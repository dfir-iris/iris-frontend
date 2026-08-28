<script lang="ts">
	import {
		FileLock2Icon,
		FileTextIcon,
		HashIcon,
		HardDriveIcon,
		CalendarIcon,
		TagIcon
	} from 'lucide-svelte';
	import type { EvidenceType } from '$lib/types/resources/evidence';
	import { Input } from '$lib/components/ui/input';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	export type EvidenceFormData = {
		filename: string;
		file_description: string;
		type_id?: number;
		file_hash?: string;
		file_size?: number;
		acquisition_date?: string;
	};

	type Props = {
		formData: EvidenceFormData;
		evidenceTypes: EvidenceType[];
		onUpdateField: (field: string, value: string | number) => void;
		onSave?: () => void;
	};

	let { formData, evidenceTypes, onUpdateField, onSave }: Props = $props();

	const typeOptions = $derived<SelectOption[]>(
		evidenceTypes.map((t) => ({ value: String(t.id), label: t.name }))
	);

	const updateField = (field: string, value: string | number) => onUpdateField(field, value);
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<FileLock2Icon class="h-4 w-4" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Filename *</p>
						<Input
							value={formData.filename}
							oninput={(e) => updateField('filename', (e.currentTarget as HTMLInputElement).value)}
							class="mt-1"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<TagIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Type</p>

						<div class="mt-1">
							<SearchSelect
								value={formData.type_id ? String(formData.type_id) : ''}
								options={typeOptions}
								placeholder="Select type"
								searchPlaceholder="Search type..."
								onChange={(value) => updateField('type_id', Number(value))}
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<HardDriveIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Size (bytes)</p>

						<Input
							type="number"
							value={formData.file_size ?? ''}
							oninput={(e) =>
								updateField('file_size', Number((e.currentTarget as HTMLInputElement).value))}
							class="mt-1"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<HashIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Hash</p>

						<Input
							value={formData.file_hash ?? ''}
							oninput={(e) => updateField('file_hash', (e.currentTarget as HTMLInputElement).value)}
							class="mt-1 font-mono"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<CalendarIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Acquisition date</p>

						<Input
							type="datetime-local"
							value={formData.acquisition_date ?? ''}
							oninput={(e) =>
								updateField('acquisition_date', (e.currentTarget as HTMLInputElement).value)}
							class="mt-1"
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
				value={formData.file_description}
				onChange={(value) => updateField('file_description', value)}
				onSave={onSave ?? (() => {})}
			/>
		</div>
	</section>
</div>
