<script lang="ts">
	import {
		ServerIcon,
		FileTextIcon,
		ComponentIcon,
		FileWarningIcon,
		XIcon,
		SaveIcon,
		EditIcon
	} from 'lucide-svelte';
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { Tag } from '$lib/types/resources/tag';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { TagInput, TagDisplay } from '$lib/components/common/tag';
	import TlpBadge from '$lib/components/common/tlp/TlpBadge.svelte';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	type IconComponent = typeof ServerIcon;

	type EditData = {
		ioc_value: string;
		ioc_description: string;
		ioc_type_id?: number;
		ioc_tlp_id?: number;
		ioc_tags?: string;
	};

	type Props = {
		ioc: Ioc;
		isEditing?: boolean;
		editData?: EditData;
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
		onIocChange?: (updatedIoc: Partial<Ioc>) => void;
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteIoc?: () => void;
		isSaving?: boolean;
		deleteUrl?: string;
	};

	let {
		ioc,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteIoc = () => {},
		isSaving = false,
		deleteUrl = ''
	}: Props = $props();

	let iocTypes = $state<IocType[]>([]);
	let tlps = $state<TlpItem[]>([]);

	const iocTypeOptions = $derived<SelectOption[]>(
		iocTypes.map((type) => ({
			value: String(type.type_id),
			label: type.type_name
		}))
	);

	const tlpOptions = $derived<SelectOption[]>(
		tlps.map((tlp) => ({
			value: String(tlp.tlp_id),
			label: tlp.tlp_name
		}))
	);

	const loadOptions = async () => {
		const [iocTypesRes, tlpRes] = await Promise.all([IocTypesService.list(), TlpService.list()]);

		if (iocTypesRes.ok && iocTypesRes.data) {
			iocTypes = iocTypesRes.data as IocType[];
		}

		if (tlpRes.ok && tlpRes.data) {
			tlps = tlpRes.data as TlpItem[];
		}
	};

	const updateField = (field: string, value: string | number) => onUpdateEditData(field, value);

	const handleTagsChange = (tags: Tag[]) => onUpdateEditData('ioc_tags', tags);

	$effect(() => {
		loadOptions();
	});
</script>

<div class="space-y-8 p-1">
	<section>
		<div class="mb-4 flex items-start justify-between gap-2 border-b pb-4">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					<ServerIcon class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">IOC #{ioc.ioc_id}</h2>
				</div>

				{#if ioc.ioc_uuid}
					<p class="mt-1 break-all font-mono text-xs italic text-muted-foreground">
						#{ioc.ioc_uuid}
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
						onrefresh={onDeleteIoc}
						buttonText="Delete"
						deletion_prompt_message={`Are you sure you want to delete the IOC "${ioc.ioc_value}"? This action cannot be undone.`}
					/>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#if isEditing && editData}
				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ComponentIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Type *</p>

							<div class="mt-1">
								<SearchSelect
									value={editData.ioc_type_id ? String(editData.ioc_type_id) : ''}
									options={iocTypeOptions}
									placeholder="Select type"
									searchPlaceholder="Search type..."
									onChange={(value) => updateField('ioc_type_id', Number(value))}
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<FileWarningIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">TLP *</p>

							<div class="mt-1">
								<SearchSelect
									value={editData.ioc_tlp_id ? String(editData.ioc_tlp_id) : ''}
									options={tlpOptions}
									placeholder="Select TLP"
									searchPlaceholder="Search TLP..."
									onChange={(value) => updateField('ioc_tlp_id', Number(value))}
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ServerIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">IOC Value *</p>

							<Textarea
								value={editData.ioc_value}
								oninput={(e) =>
									updateField('ioc_value', (e.currentTarget as HTMLTextAreaElement).value)}
								rows={5}
								class="mt-1"
							/>
						</div>
					</div>
				</div>
			{:else}
				{@render fieldWithIcon('Type', ioc.ioc_type?.type_name ?? 'N/A', ComponentIcon)}

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<FileWarningIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">TLP</p>

							<div class="flex items-center gap-1">
								<TlpBadge tlp_name={ioc.tlp?.tlp_name} />

								{#if ioc.tlp?.tlp_name}
									<ClipboardCopy value={`TLP:${ioc.tlp.tlp_name}`} />
								{/if}
							</div>
						</div>
					</div>
				</div>

				{@render fieldWithIcon('IOC Value', ioc.ioc_value, ServerIcon, null, 'md:col-span-2')}
			{/if}
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>

		<div class="rounded-lg bg-card/40 p-4">
			{#if isEditing && editData}
				<MarkDownEditor
					value={editData.ioc_description}
					onChange={(value) => updateField('ioc_description', value)}
					onSave={onSaveChanges}
				/>
			{:else if ioc.ioc_description}
				<MarkDownPreview markdown={ioc.ioc_description} />
			{:else}
				<p class="italic text-muted-foreground">No description provided</p>
			{/if}
		</div>
	</section>

	<section>
		<div class="rounded-lg bg-card/40 p-4">
			{#if isEditing}
				<TagInput
					tags={currentTags}
					outputFormat="array"
					onchange={handleTagsChange}
					placeholder="Add tags..."
					maxTags={20}
				/>
			{:else if ioc.ioc_tags}
				<TagDisplay tags={ioc.ioc_tags} size="default" />
			{:else}
				<p class="italic text-muted-foreground">No tags</p>
			{/if}
		</div>
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

				<div class="flex items-center gap-1">
					<p class="whitespace-pre-wrap break-all font-semibold text-foreground">{value}</p>

					{#if value && value.toString().length > 0 && value !== 'N/A'}
						<ClipboardCopy value={value.toString()} />
					{/if}
				</div>

				{#if hint}
					<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
				{/if}
			</div>
		</div>
	</div>
{/snippet}
