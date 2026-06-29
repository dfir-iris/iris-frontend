<script lang="ts">
	import {
		ServerIcon,
		GlobeIcon,
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon,
		ShieldIcon,
		ComponentIcon,
		XIcon,
		SaveIcon,
		EditIcon,
		EllipsisVerticalIcon,
		ForwardIcon,
		FileSymlinkIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
	import { toast } from '$lib/stores/toast.store';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { TagDisplay } from '$lib/components/common/tag';
	import AssetEditForm, { type AssetEditData } from '../components/asset-edit-form.svelte';
	import AssetDetailField from './components/asset-detail-field.svelte';
	import { callHook } from '../../utils/hooks';
	import { getAssetUrl } from '../helpers';

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		editData?: AssetEditData;
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteAsset?: () => void;
		isSaving?: boolean;
		/** When false, Edit / Delete / Save controls and module hooks are
		 *  hidden. Read-only users still see field values, share link, and
		 *  markdown-link copy actions because those don't mutate state. */
		canEdit?: boolean;
	};

	let {
		asset,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteAsset = () => {},
		isSaving = false,
		canEdit = true
	}: Props = $props();

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);
	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

	const caseId = $derived(Number(page.params.case_id));

	const loadOptions = async () => {
		const [assetTypesRes, analysisStatusesRes] = await Promise.all([
			AssetTypesService.list(caseId, { fetch }),
			AnalysisStatusService.list(caseId, { fetch })
		]);

		if (assetTypesRes.ok && Array.isArray(assetTypesRes.data)) {
			assetTypes = assetTypesRes.data;
		}

		if (analysisStatusesRes.ok && Array.isArray(analysisStatusesRes.data)) {
			analysisStatuses = analysisStatusesRes.data;
		}

		const hooksResponse = (await HooksService.list('asset')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = hooksResponse.data as HookOption[];
	};

	const callModule = async (hookOption: HookOption) => {
		const result = await callHook(Number(asset.case_id), 'asset', [asset.asset_id], hookOption);

		toast({
			variant: result?.status === 'error' ? 'destructive' : 'success',
			title: result?.message
		});
	};

	$effect(() => {
		loadOptions();
	});
</script>

<div class="space-y-8 p-1">
	<section>
		<div class="mb-4 flex items-center justify-between gap-2 border-b pb-2">
			<div class="flex items-center gap-2">
				<ServerIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">General Information</h2>
			</div>

			<div class="flex items-center gap-2">
				{#if canEdit}
					{#if isEditing}
						<Button variant="outline" size="sm" onclick={onCancelEditing} disabled={isSaving}>
							<XIcon class="h-4 w-4" />
							Cancel
						</Button>

						<Button size="sm" onclick={onSaveChanges} disabled={isSaving}>
							{#if isSaving}
								<span class="animate-spin">⟳</span>
								Saving...
							{:else}
								<SaveIcon class="h-4 w-4" />
								Save Changes
							{/if}
						</Button>
					{:else}
						<Button variant="outline" size="sm" onclick={onStartEditing}>
							<EditIcon class="h-4 w-4" />
							Edit Asset
						</Button>

						<DeleteButton
							url={`/api/v2/cases/${caseId}/assets/${asset.asset_id}`}
							onrefresh={onDeleteAsset}
							buttonText="Delete"
							deletion_prompt_message={`Are you sure you want to delete the asset "${asset.asset_name}"? This action cannot be undone.`}
						/>
					{/if}
				{/if}

				<DropdownMenu bind:open={isMenuOpen}>
					<DropdownMenuTrigger>
						<button
							title="menu"
							class="text-muted-foreground transition-colors hover:text-foreground"
						>
							<EllipsisVerticalIcon size="16" />
						</button>
					</DropdownMenuTrigger>

					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onclick={() => {
								navigator.clipboard
									.writeText(getAssetUrl(asset.case_id, String(asset.asset_id)))
									.then(() => {
										toast({
											title: 'Link copied',
											variant: 'success'
										});
									})
									.catch((e) => {
										console.error('Clipboard copy error:', e);

										toast({
											title: 'Could not copy link',
											variant: 'destructive'
										});
									});
							}}><ForwardIcon /> Share</DropdownMenuItem
						>

						<DropdownMenuItem
							onclick={() => {
								navigator.clipboard
									.writeText(
										`[<i class="fa-solid fa-bell"></i> #25](${getAssetUrl(asset.case_id, String(asset.asset_id))})`
									)
									.then(() => {
										toast({
											title: 'Link copied',
											variant: 'success'
										});
									})
									.catch((e) => {
										console.error('Clipboard copy error:', e);

										toast({
											title: 'Could not copy link',
											variant: 'destructive'
										});
									});
							}}><FileSymlinkIcon /> Markdown Link</DropdownMenuItem
						>

						{#if canEdit && hookOptions.length}
							<Separator />

							{#each hookOptions as hookOption}
								<DropdownMenuItem onclick={() => callModule(hookOption)}
									>{hookOption.manual_hook_ui_name}</DropdownMenuItem
								>
							{/each}
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		{#if isEditing && editData}
			<AssetEditForm
				{editData}
				{currentTags}
				{assetTypes}
				{analysisStatuses}
				onUpdateField={onUpdateEditData}
			/>
		{:else}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<AssetDetailField label="Asset Name" value={asset.asset_name} Icon={ServerIcon} />

				<AssetDetailField
					label="Asset Type"
					value={asset.asset_type?.asset_name ?? 'N/A'}
					Icon={ComponentIcon}
				/>

				<AssetDetailField
					label="Analysis Status"
					value={asset.analysis_status?.name ?? 'N/A'}
					Icon={CheckCircleIcon}
				/>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ShieldIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Compromise Status</p>

							<div class="mt-1">
								<CompromiseStatus status={asset.asset_compromise_status_id || 3} />
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</section>

	{#if !isEditing}
		<section>
			<div class="mb-4 flex items-center gap-2 border-b pb-2">
				<FileTextIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Description</h2>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				{#if asset.asset_description}
					<MarkDownPreview markdown={asset.asset_description} />
				{:else}
					<p class="italic text-muted-foreground">No description provided</p>
				{/if}
			</div>
		</section>

		<section>
			<div class="mb-4 flex items-center gap-2 border-b pb-2">
				<NetworkIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Network Information</h2>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<AssetDetailField label="IP Address" value={asset.asset_ip || 'N/A'} Icon={NetworkIcon} />
				<AssetDetailField label="Domain" value={asset.asset_domain || 'N/A'} Icon={GlobeIcon} />
			</div>
		</section>

		<section>
			<div class="rounded-lg bg-card/40 p-4">
				{#if asset.asset_tags}
					<TagDisplay tags={asset.asset_tags} size="default" />
				{:else}
					<p class="italic text-muted-foreground">No tags</p>
				{/if}
			</div>
		</section>
	{/if}
</div>
