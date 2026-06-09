<script lang="ts">
	import { ClipboardListIcon, CheckCircleIcon, UserIcon, FileTextIcon } from 'lucide-svelte';
	import type { Tag } from '$lib/types/resources/tag';
	import type { TaskStatus } from '$lib/types/resources/task';
	import { type CaseAccessUserRow } from '$lib/services/case.service';
	import { Input } from '$lib/components/ui/input';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { TagInput } from '$lib/components/common/tag';

	export type TaskFormData = {
		task_title: string;
		task_description: string;
		task_status_id?: number;
		task_assignees_id?: number[];
		task_tags?: string;
	};

	type Props = {
		formData: TaskFormData;
		currentTags: Tag[];
		taskStatuses: TaskStatus[];
		users: CaseAccessUserRow[];
		onUpdateField: (field: string, value: string | number | number[] | Tag[]) => void;
		onSave?: () => void;
	};

	let { formData, currentTags, taskStatuses, users, onUpdateField, onSave }: Props = $props();

	const statusOptions = $derived<SelectOption[]>(
		taskStatuses.map((s) => ({ value: String(s.id), label: s.status_name }))
	);

	const userOptions = $derived<SelectOption[]>(
		users.map((u) => ({ value: String(u.user_id), label: `${u.user_login} (${u.user_name})` }))
	);

	const updateField = (field: string, value: string | number | number[]) =>
		onUpdateField(field, value);

	const handleTagsChange = (tags: Tag[]) => onUpdateField('task_tags', tags);
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<ClipboardListIcon class="h-4 w-4" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Title *</p>
						<Input
							value={formData.task_title}
							oninput={(e) =>
								updateField('task_title', (e.currentTarget as HTMLInputElement).value)}
							class="mt-1"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<CheckCircleIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Status *</p>

						<div class="mt-1">
							<SearchSelect
								value={formData.task_status_id ? String(formData.task_status_id) : ''}
								options={statusOptions}
								placeholder="Select status"
								searchPlaceholder="Search status..."
								onChange={(value) => updateField('task_status_id', Number(value))}
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<UserIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Assignees</p>

						<div class="mt-1">
							<SearchSelect
								value={formData.task_assignees_id?.map(String) ?? []}
								options={userOptions}
								multiple
								placeholder="Select assignees"
								searchPlaceholder="Search users..."
								onChange={(value) =>
									updateField(
										'task_assignees_id',
										(Array.isArray(value) ? value : [value]).map(Number)
									)}
							/>
						</div>
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
				value={formData.task_description}
				onChange={(value) => updateField('task_description', value)}
				onSave={onSave ?? (() => {})}
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
