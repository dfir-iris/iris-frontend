<script lang="ts">
	import { page } from '$app/state';
	import type { Task, TaskStatus } from '$lib/types/resources/task';
	import type { Tag } from '$lib/types/resources/tag';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { Fact, FactBar, FactRecord, FactTags } from '$lib/components/common/fact-bar';
	import { current_user } from '$lib/stores/auth.store';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import TaskForm from '../components/task-form.svelte';

	type EditData = {
		task_title: string;
		task_description: string;
		task_status_id?: number;
		task_assignees_id?: number[];
		task_tags?: string;
	};

	type Props = {
		task: Task;
		isEditing?: boolean;
		editData?: EditData;
		onUpdateEditData?: (field: string, value: string | number | number[] | Tag[]) => void;
		currentTags?: Tag[];
		onSaveChanges?: () => void;
	};

	let {
		task,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onSaveChanges = () => {}
	}: Props = $props();

	let taskStatuses = $state<TaskStatus[]>([]);
	let users = $state<CaseAccessUserRow[]>([]);

	const loadOptions = async () => {
		const caseId = Number(page.params.case_id);
		const [statusRes, loadedUsers] = await Promise.all([
			TaskStatusService.list(),
			CaseService.listUsers(caseId)
		]);

		if (statusRes.ok && Array.isArray(statusRes.data)) {
			taskStatuses = statusRes.data as TaskStatus[];
		}

		users = loadedUsers;
	};

	const updateField = (field: string, value: string | number | number[] | Tag[]) =>
		onUpdateEditData(field, value);

	$effect(() => {
		loadOptions();
	});
</script>

{#if isEditing && editData}
	<div class="p-4">
		<TaskForm
			formData={editData}
			{currentTags}
			{taskStatuses}
			{users}
			onUpdateField={updateField}
			onSave={onSaveChanges}
		/>
	</div>
{:else}
	<!--
	  Triage facts on one strip, then the prose at full width. The title is
	  absent on purpose — it is the header one line above this.
	-->
	<FactBar>
		<Fact>
			{#if task.status}
				<StatusBadge status={task.status.status_name as CaseStatus} />
			{:else}
				<span class="text-muted-foreground/60">No status</span>
			{/if}
		</Fact>

		<Fact label="Assignees">
			{#if task.task_assignees?.length}
				<span class="flex flex-wrap items-center gap-1">
					{#each task.task_assignees as assignee (assignee.id)}
						{@const me = ($current_user?.user_id ?? $current_user?.id ?? null) === assignee.id}

						<Chip
							kind="user"
							id={assignee.id}
							label={me ? 'You' : assignee.name || assignee.user}
							title={assignee.name || assignee.user}
						/>
					{/each}
				</span>
			{:else}
				<span class="text-muted-foreground/60">Unassigned</span>
			{/if}
		</Fact>

		<Fact label="Opened" value={task.task_open_date} />
	</FactBar>

	<FactTags tags={task.task_tags} />

	<div class="p-4">
		{#if task.task_description}
			<MarkDownPreview markdown={task.task_description} />
		{:else}
			<p class="text-sm italic text-muted-foreground">No description provided</p>
		{/if}

		<FactRecord
			items={[
				['ID', `#${task.id}`, true],
				['UUID', task.task_uuid, true],
				['Case', task.case?.case_id ? `#${task.case.case_id}` : null, true]
			]}
		/>
	</div>
{/if}
