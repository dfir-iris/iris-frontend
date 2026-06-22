<script lang="ts">
	import { ComponentIcon, FileTextIcon, FileWarningIcon, ServerIcon } from 'lucide-svelte';
	import type { Tag } from '$lib/types/resources/tag';
	import type { IocType } from '$lib/services/ioc-types.service';
	import type { TlpItem } from '$lib/services/tlp.service';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { TagInput } from '$lib/components/common/tag';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	export type IocAddData = {
		ioc_value: string;
		ioc_description: string;
		ioc_type_id?: number;
		ioc_tlp_id?: number;
		ioc_tags?: string;
		one_per_line: boolean;
	};

	type Props = {
		addData: IocAddData;
		currentTags: Tag[];
		iocTypes: IocType[];
		tlps: TlpItem[];
		onUpdateField: (field: string, value: string | number | boolean | Tag[]) => void;
	};

	let { addData, currentTags, iocTypes, tlps, onUpdateField }: Props = $props();

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

	const updateField = (field: string, value: string | number) => onUpdateField(field, value);
	const handleTagsChange = (tags: Tag[]) => onUpdateField('ioc_tags', tags);

	// UI-only flag — splits the textarea by newline into one IOC per line.
	const handleOnePerLineChange = (checked: boolean) => onUpdateField('one_per_line', checked);
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<ComponentIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Type *</p>

						<div class="mt-1">
							<SearchSelect
								value={addData.ioc_type_id ? String(addData.ioc_type_id) : ''}
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
								value={addData.ioc_tlp_id ? String(addData.ioc_tlp_id) : ''}
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
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-medium text-muted-foreground">
								{addData.one_per_line ? 'IOC Values *' : 'IOC Value *'}
							</p>

							<label class="inline-flex items-center gap-2 text-xs text-muted-foreground">
								<Checkbox
									checked={addData.one_per_line}
									onCheckedChange={(v) => handleOnePerLineChange(!!v)}
								/>
								<span>One IOC per line</span>
							</label>
						</div>

						<Textarea
							value={addData.ioc_value}
							oninput={(e) =>
								updateField('ioc_value', (e.currentTarget as HTMLTextAreaElement).value)}
							placeholder={addData.one_per_line ? 'One IOC per line' : 'IOC value'}
							rows={addData.one_per_line ? 5 : 2}
							class="mt-1 w-full"
						/>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>

		<div class="rounded-lg bg-card/40 p-4">
			<MarkDownEditor
				value={addData.ioc_description}
				onChange={(value) => updateField('ioc_description', value)}
				onSave={() => {}}
			/>
		</div>
	</section>

	<section>
		<div class="rounded-lg bg-card/40 p-4">
			<TagInput
				tags={currentTags}
				outputFormat="array"
				onchange={handleTagsChange}
				placeholder="Add tags..."
				maxTags={20}
			/>
		</div>
	</section>
</div>
