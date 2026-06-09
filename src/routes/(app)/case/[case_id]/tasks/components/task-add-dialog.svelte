<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Tag } from '$lib/types/resources/tag';
	import type { TaskStatus } from '$lib/types/resources/task';
	import { toast } from '$lib/stores/toast.store';
	import { tagsToString } from '$lib/utils/tags';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import TaskForm, { type TaskFormData } from './task-form.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let taskStatuses = $state<TaskStatus[]>([]);
	let users = $state<CaseAccessUserRow[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);

	let formData = $state<TaskFormData>({
		task_title: '',
		task_description: '',
		task_status_id: undefined,
		task_assignees_id: undefined,
		task_tags: ''
	});

	const reset = () => {
		currentTags = [];
		isSaving = false;
		formData = {
			task_title: '',
			task_description: '',
			task_status_id: undefined,
			task_assignees_id: undefined,
			task_tags: ''
		};
	};

	const close = () => onOpenChange(false);

	const loadOptions = async () => {
		const [statusRes, loadedUsers] = await Promise.all([
			TaskStatusService.list(),
			CaseService.listUsers(caseId)
		]);

		if (statusRes.ok && Array.isArray(statusRes.data)) {
			taskStatuses = statusRes.data;
		}

		users = loadedUsers;
	};

	const updateField = (field: string, value: string | number | number[] | Tag[]) => {
		if (field === 'task_tags') {
			if (Array.isArray(value) && value.every((v) => typeof v === 'object')) {
				currentTags = [...(value as Tag[])];
				formData.task_tags = tagsToString(value as Tag[]);
			} else if (typeof value === 'string') {
				formData.task_tags = value;
			}

			return;
		}

		if (field === 'task_title' && typeof value === 'string') {
			formData.task_title = value;

			return;
		}

		if (field === 'task_description' && typeof value === 'string') {
			formData.task_description = value;

			return;
		}

		if (field === 'task_status_id') {
			formData.task_status_id = typeof value === 'number' ? value : undefined;

			return;
		}

		if (field === 'task_assignees_id' && Array.isArray(value)) {
			formData.task_assignees_id = value as number[];
		}
	};

	const save = async () => {
		if (!formData.task_title.trim() || !formData.task_status_id) {
			toast({
				title: 'Missing required fields',
				description: 'Title and status are required.',
				variant: 'destructive'
			});

			return;
		}

		isSaving = true;

		try {
			const created = await caseTasks.createTask(
				{
					task_title: formData.task_title.trim(),
					task_status_id: formData.task_status_id,
					task_assignees_id: formData.task_assignees_id ?? [],
					task_description: formData.task_description,
					task_tags: tagsToString(currentTags)
				},
				{ fetch }
			);

			if (!created) throw new Error('Failed to create task');

			toast({ title: 'Task created', variant: 'success' });

			close();

			await goto(`/case/${caseId}/tasks/${created.id}`, { replaceState: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating the task. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (open) {
			loadOptions();
		} else {
			reset();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			close();
		}
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-[780px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add Task</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
			<TaskForm
				{formData}
				{currentTags}
				{taskStatuses}
				{users}
				onUpdateField={updateField}
				onSave={save}
			/>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>
			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Add Task
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
