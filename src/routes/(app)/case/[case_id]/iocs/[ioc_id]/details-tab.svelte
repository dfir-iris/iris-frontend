<script lang="ts">
	import { ServerIcon } from 'lucide-svelte';
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { Tag } from '$lib/types/resources/tag';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { TagInput } from '$lib/components/common/tag';
	import TlpBadge from '$lib/components/common/tlp/TlpBadge.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { Fact, FactBar, FactRecord, FactTags } from '$lib/components/common/fact-bar';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

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
		onSaveChanges?: () => void;
	};

	let {
		ioc,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onSaveChanges = () => {}
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

{#if isEditing && editData}
	<div class="space-y-4 p-4">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<label class="space-y-1">
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Type *
				</span>

				<SearchSelect
					value={editData.ioc_type_id ? String(editData.ioc_type_id) : ''}
					options={iocTypeOptions}
					placeholder="Select type"
					searchPlaceholder="Search type..."
					onChange={(value) => updateField('ioc_type_id', Number(value))}
				/>
			</label>

			<label class="space-y-1">
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					TLP *
				</span>

				<SearchSelect
					value={editData.ioc_tlp_id ? String(editData.ioc_tlp_id) : ''}
					options={tlpOptions}
					placeholder="Select TLP"
					searchPlaceholder="Search TLP..."
					onChange={(value) => updateField('ioc_tlp_id', Number(value))}
				/>
			</label>
		</div>

		<label class="block space-y-1">
			<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				IOC Value *
			</span>

			<Textarea
				value={editData.ioc_value}
				oninput={(e) => updateField('ioc_value', (e.currentTarget as HTMLTextAreaElement).value)}
				rows={4}
			/>
		</label>

		<div class="space-y-1">
			<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Description
			</span>

			<MarkDownEditor
				value={editData.ioc_description}
				onChange={(value) => updateField('ioc_description', value)}
				onSave={onSaveChanges}
			/>
		</div>

		<div class="space-y-1">
			<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Tags
			</span>

			<TagInput
				tags={currentTags}
				outputFormat="array"
				onchange={handleTagsChange}
				placeholder="Add tags..."
				maxTags={20}
			/>
		</div>
	</div>
{:else}
	<FactBar>
		<Fact>
			<TlpBadge tlp_name={ioc.tlp?.tlp_name} />
		</Fact>

		<Fact label="Type" value={ioc.ioc_type?.type_name} />
		<Fact label="Linked cases" value={ioc.link?.length ? ioc.link.length : null} />
	</FactBar>

	<FactTags tags={ioc.ioc_tags} />

	<div class="p-4">
		<!--
		  The value is the IOC's identity, so it stays on screen in full rather
		  than only truncated into the header: hashes and URLs are what an
		  analyst copies out of this pane.
		-->
		<div class="mb-4 flex items-start gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5">
			<ServerIcon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

			<p class="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs">
				{ioc.ioc_value}
			</p>

			<ClipboardCopy value={ioc.ioc_value} tooltipText="Copy IOC value" size={12} />
		</div>

		{#if ioc.ioc_description}
			<MarkDownPreview markdown={ioc.ioc_description} />
		{:else}
			<p class="text-sm italic text-muted-foreground">No description provided</p>
		{/if}

		<FactRecord
			items={[
				['ID', `#${ioc.ioc_id}`, true],
				['UUID', ioc.ioc_uuid, true],
				['Case', ioc.case_id ? `#${ioc.case_id}` : null, true]
			]}
		/>
	</div>
{/if}
