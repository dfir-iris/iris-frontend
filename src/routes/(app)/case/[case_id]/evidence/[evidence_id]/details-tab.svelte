<script lang="ts">
	import {
		FileLock2Icon,
		FileTextIcon,
		HashIcon,
		HardDriveIcon,
		UserIcon,
		CalendarIcon,
		TagIcon,
		XIcon,
		SaveIcon,
		EditIcon,
		EllipsisVerticalIcon,
		ForwardIcon,
		FileSymlinkIcon
	} from 'lucide-svelte';
	import type { Evidence, EvidenceType } from '$lib/types/resources/evidence';
	import { toast } from '$lib/stores/toast.store';
	import type { RequestResponse } from '$lib/services/api.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { EvidenceTypesService } from '$lib/services/evidence-types.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import EvidenceForm from '../components/evidence-form.svelte';
	import { callHook } from '../../utils/hooks';
	import { getEvidenceUrl } from '../helpers';

	type IconComponent = typeof FileLock2Icon;

	type EditData = {
		filename: string;
		file_description: string;
		type_id?: number;
		file_hash?: string;
		file_size?: number;
		acquisition_date?: string;
	};

	type Props = {
		evidence: Evidence;
		caseId: number;
		isEditing?: boolean;
		editData?: EditData;
		onUpdateEditData?: (field: string, value: string | number) => void;
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteEvidence?: () => void;
		isSaving?: boolean;
		deleteUrl?: string;
	};

	let {
		evidence,
		caseId,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteEvidence = () => {},
		isSaving = false,
		deleteUrl = ''
	}: Props = $props();

	let evidenceTypes = $state<EvidenceType[]>([]);
	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

	const formatSize = (bytes: number | null): string => {
		if (!bytes || bytes <= 0) return 'N/A';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	};

	const loadOptions = async () => {
		const typesRes = await EvidenceTypesService.list({ fetch });

		if (typesRes.ok && Array.isArray(typesRes.data)) {
			evidenceTypes = typesRes.data as EvidenceType[];
		}

		const hooksResponse = (await HooksService.list('evidence')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = (hooksResponse.data as HookOption[]) ?? [];
	};

	const updateField = (field: string, value: string | number) => onUpdateEditData(field, value);

	const callModule = async (hookOption: HookOption) => {
		const result = await callHook(caseId, 'evidence', [evidence.id], hookOption);

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
		<div class="mb-4 flex items-start justify-between gap-2 border-b pb-4">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					<FileLock2Icon class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Evidence #{evidence.id}</h2>
				</div>

				{#if evidence.file_uuid}
					<p class="mt-1 break-all font-mono text-xs italic text-muted-foreground">
						#{evidence.file_uuid}
					</p>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2">
				{#if isEditing}
					<Button variant="outline" size="sm" onclick={onCancelEditing} disabled={isSaving}>
						<XIcon class="h-4 w-4" />
						Cancel
					</Button>

					<Button variant="default" size="sm" onclick={onSaveChanges} disabled={isSaving}>
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
						Edit
					</Button>

					<DeleteButton
						url={deleteUrl}
						onrefresh={onDeleteEvidence}
						buttonText="Delete"
						deletion_prompt_message={`Are you sure you want to delete the evidence "${evidence.filename}"? This action cannot be undone.`}
					/>
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
									.writeText(getEvidenceUrl(caseId, String(evidence.id)))
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
										`[<i class="fa-solid fa-file-shield"></i> #${evidence.id}](${getEvidenceUrl(caseId, String(evidence.id))})`
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

						<Separator />

						{#if hookOptions.length}
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
			<EvidenceForm
				formData={editData}
				{evidenceTypes}
				onUpdateField={updateField}
				onSave={onSaveChanges}
			/>
		{:else}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				{@render fieldWithIcon(
					'Filename',
					evidence.filename,
					FileLock2Icon,
					null,
					'md:col-span-2'
				)}

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<TagIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Type</p>
							<p class="mt-1 font-semibold text-foreground">
								{evidence.type?.name ?? 'N/A'}
							</p>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<HardDriveIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Size</p>
							<p class="mt-1 font-semibold text-foreground">
								{formatSize(evidence.file_size)}
							</p>
						</div>
					</div>
				</div>

				{@render fieldWithIcon('Hash', evidence.file_hash ?? 'N/A', HashIcon, null, 'md:col-span-2')}

				{@render fieldWithIcon('Date added', evidence.date_added ?? 'N/A', CalendarIcon)}

				{@render fieldWithIcon(
					'Acquisition date',
					evidence.acquisition_date ?? 'N/A',
					CalendarIcon
				)}

				<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<UserIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Added by</p>
							<p class="mt-1 font-semibold text-foreground">
								{evidence.user?.user_name ?? evidence.user?.user_login ?? 'N/A'}
							</p>
						</div>
					</div>
				</div>
			</div>

			<section class="mt-6">
				<div class="mb-4 flex items-center gap-2 border-b pb-2">
					<FileTextIcon class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Description</h2>
				</div>
				<div class="rounded-lg bg-card/40 p-4">
					{#if evidence.file_description}
						<MarkDownPreview markdown={evidence.file_description} />
					{:else}
						<p class="italic text-muted-foreground">No description provided</p>
					{/if}
				</div>
			</section>
		{/if}
	</section>
</div>

{#snippet fieldWithIcon(
	label: string,
	value: string | number,
	Icon: IconComponent,
	hint: string | null = null,
	className = ''
)}
	<div class={`rounded-lg bg-card/40 p-4 ${className}`}>
		<div class="flex items-start gap-3">
			<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
				<Icon class="h-4 w-4" />
			</div>

			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium text-muted-foreground">{label}</p>

				<p class="whitespace-pre-wrap break-all font-semibold text-foreground">{value}</p>

				{#if hint}
					<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
				{/if}
			</div>
		</div>
	</div>
{/snippet}
