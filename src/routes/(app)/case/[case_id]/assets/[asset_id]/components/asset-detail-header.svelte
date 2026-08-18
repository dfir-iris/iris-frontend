<!--
  Identity + action strip for the asset detail pane.

  Lives above the tab bar so the asset's name, type and compromise state stay
  on screen whatever tab is open, and so the Edit / Delete / module-hook
  actions have one home instead of being buried inside the Details tab.
-->
<script lang="ts">
	import {
		XIcon,
		SaveIcon,
		EditIcon,
		EllipsisVerticalIcon,
		ForwardIcon,
		FileSymlinkIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import type { Asset } from '$lib/types/resources/asset';
	import { toast } from '$lib/stores/toast.store';
	import type { RequestResponse } from '$lib/services/api.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import { getAssetTypeIcon } from '$lib/components/common/assets/asset-type-icon';
	import { callHook } from '../../../utils/hooks';
	import { getAssetUrl } from '../../helpers';

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		isSaving?: boolean;
		canEdit?: boolean;
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteAsset?: () => void;
	};

	let {
		asset,
		isEditing = false,
		isSaving = false,
		canEdit = true,
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteAsset = () => {}
	}: Props = $props();

	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

	const caseId = $derived(Number(page.params.case_id));
	const AssetTypeIcon = $derived(getAssetTypeIcon(asset.asset_type?.asset_name));
	const isCompromised = $derived(asset.asset_compromise_status_id === 1);

	const copyToClipboard = (value: string) => {
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast({ title: 'Link copied', variant: 'success' });
			})
			.catch((e) => {
				console.error('Clipboard copy error:', e);

				toast({ title: 'Could not copy link', variant: 'destructive' });
			});
	};

	const callModule = async (hookOption: HookOption) => {
		const result = await callHook(Number(asset.case_id), 'asset', [asset.asset_id], hookOption);

		toast({
			variant: result?.status === 'error' ? 'destructive' : 'success',
			title: result?.message
		});
	};

	const loadHooks = async () => {
		const hooksResponse = (await HooksService.list('asset')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = (hooksResponse.data as HookOption[]) ?? [];
	};

	$effect(() => {
		loadHooks();
	});
</script>

<div class="flex shrink-0 items-center gap-2.5 border-b px-4 py-2">
	<div class="shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
		<AssetTypeIcon class="h-4 w-4" />
	</div>

	<div class="min-w-0">
		<h2 class="truncate text-base font-semibold leading-tight" title={asset.asset_name}>
			{asset.asset_name}
		</h2>

		<p class="truncate text-2xs text-muted-foreground">
			{asset.asset_type?.asset_name ?? 'Unknown type'} · #{asset.asset_id}
		</p>
	</div>

	{#if isCompromised}
		<Badge variant="compromised" class="shrink-0 px-2 py-0 text-2xs">Compromised</Badge>
	{/if}

	<div class="ml-auto flex shrink-0 items-center gap-2">
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
				<button title="menu" class="text-muted-foreground transition-colors hover:text-foreground">
					<EllipsisVerticalIcon size="16" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onclick={() => copyToClipboard(getAssetUrl(asset.case_id, String(asset.asset_id)))}
				>
					<ForwardIcon /> Share
				</DropdownMenuItem>

				<DropdownMenuItem
					onclick={() =>
						copyToClipboard(
							`[<i class="fa-solid fa-bell"></i> #25](${getAssetUrl(asset.case_id, String(asset.asset_id))})`
						)}
				>
					<FileSymlinkIcon /> Markdown Link
				</DropdownMenuItem>

				{#if canEdit && hookOptions.length}
					<Separator />

					{#each hookOptions as hookOption}
						<DropdownMenuItem onclick={() => callModule(hookOption)}>
							{hookOption.manual_hook_ui_name}
						</DropdownMenuItem>
					{/each}
				{/if}
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>
