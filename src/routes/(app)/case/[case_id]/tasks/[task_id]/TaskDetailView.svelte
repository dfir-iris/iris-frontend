<!--
  Task detail panel. Renders the tabs (Details / Comments) plus the metadata
  footer for one task. Used by:
    - the task route page  (/case/:case_id/tasks/:task_id)
    - the TaskDetailDialog (modal opened from mention chips)
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import { AlertTriangleIcon, InfoIcon, MessagesSquareIcon, SearchIcon } from 'lucide-svelte';
	import { type Task } from '$lib/types/resources/task';
	import type { Tag } from '$lib/types/resources/tag';
	import { normalizeTags, tagsToString } from '$lib/utils/tags';
	import { toast } from '$lib/stores/toast.store';
	import type { UpdateCaseTaskBody } from '$lib/services/case-tasks.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import DetailsTab from './details-tab.svelte';
	import CommentsTab from './comments-tab.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';

	type EditData = {
		task_title: string;
		task_description: string;
		task_status_id?: number;
		task_assignees_id?: number[];
		task_tags?: string;
	};

	let {
		caseId,
		taskId,
		onAfterDelete
	}: {
		caseId: number;
		taskId: number;
		onAfterDelete?: () => void;
	} = $props();

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	const task = $derived(caseTasks.byId[taskId]);

	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	let currentTags = $state<Tag[]>([]);
	let comments = $state<Comment[]>([]);

	let editData = $state<EditData>({
		task_title: '',
		task_description: '',
		task_status_id: undefined,
		task_assignees_id: undefined,
		task_tags: undefined
	});

	const syncTagsFromTask = (currentTask: Task | undefined) => {
		currentTags = normalizeTags(currentTask?.task_tags);
	};

	const resetEditData = (currentTask: Task) => {
		editData = {
			task_title: currentTask.task_title,
			task_description: currentTask.task_description ?? '',
			task_status_id: currentTask.task_status_id,
			task_assignees_id: currentTask.task_assignees_id ?? undefined,
			task_tags: currentTask.task_tags ?? undefined
		};
	};

	const loadComments = async () => {
		if (!task) return;
		const res = await CommentsService.list('tasks', task.id);
		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];
	};

	const loadTask = async () => {
		isLoading = true;
		loadError = null;

		try {
			const loaded = await caseTasks.getTask(taskId, { fetch });

			if (!loaded) {
				loadError = 'Failed to load task';
				return;
			}

			await loadComments();
			syncTagsFromTask(loaded);
			resetEditData(loaded);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load task';
		} finally {
			isLoading = false;
		}
	};

	const handleUpdateEditData = (field: string, value: string | number | number[] | Tag[]) => {
		if (field === 'task_tags') {
			if (Array.isArray(value) && value.every((v) => typeof v === 'object')) {
				currentTags = [...(value as Tag[])];
				editData.task_tags = tagsToString(value as Tag[]);
			} else if (typeof value === 'string') {
				editData.task_tags = value;
			}
			return;
		}

		if (field === 'task_title' && typeof value === 'string') {
			editData.task_title = value;
			return;
		}

		if (field === 'task_description' && typeof value === 'string') {
			editData.task_description = value;
			return;
		}

		if (field === 'task_status_id') {
			editData.task_status_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'task_assignees_id' && Array.isArray(value)) {
			editData.task_assignees_id = value as number[];
		}
	};

	const startEditing = () => {
		if (!task) return;
		syncTagsFromTask(task);
		resetEditData(task);
		isEditing = true;
	};

	const cancelEditing = () => {
		if (task) {
			syncTagsFromTask(task);
			resetEditData(task);
		}
		isEditing = false;
	};

	const saveChanges = async () => {
		if (!task) return;

		isSaving = true;

		try {
			const payload: UpdateCaseTaskBody = {
				task_title: editData.task_title,
				task_description: editData.task_description,
				task_status_id: editData.task_status_id,
				task_assignees_id: editData.task_assignees_id ?? [],
				task_tags: tagsToString(currentTags)
			};

			const updated = await caseTasks.patchTask(taskId, payload, { fetch });

			if (!updated) throw new Error('Failed to update task');

			syncTagsFromTask(updated);
			isEditing = false;

			toast({
				title: 'Task updated',
				description: 'Task details have been successfully updated.',
				variant: 'success'
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toast({
				title: 'Update failed',
				description: `There was a problem updating the task. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	const handleTaskDeleted = async () => {
		await caseTasks.removeTask(taskId, { fetch });
		onAfterDelete?.();
	};

	$effect(() => {
		void taskId;
		loadTask();
	});
</script>

{#if isLoading && !task}
	<Card class="overflow-hidden border shadow-lg">
		<CardContent class="p-8">
			<div class="mb-6 flex items-center gap-4">
				<Skeleton class="h-10 w-10 rounded-full"></Skeleton>
				<Skeleton class="h-8 w-64"></Skeleton>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
				{#each Array(9)}
					<div class="space-y-2">
						<Skeleton class="h-4 w-24"></Skeleton>
						<Skeleton class="h-6 w-full"></Skeleton>
					</div>
				{/each}
			</div>
		</CardContent>
	</Card>
{:else if loadError}
	<div in:fade>
		<ErrorAlert>
			<div class="flex items-center gap-2">
				<AlertTriangleIcon class="h-5 w-5" />
				<span>There was a problem loading Task #{taskId}!</span>
			</div>
		</ErrorAlert>
	</div>
{:else if task?.id}
	<div in:fade={{ duration: 150 }} class="flex h-full min-h-0 flex-col">
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b bg-muted/20">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="comments"
								class="relative flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<MessagesSquareIcon class="mr-1 h-4 w-4" />
								<span>Comments</span>

								{#if comments?.length}
									<span
										class="absolute left-8 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-2xs text-white"
									>
										{comments.length}
									</span>
								{/if}
							</TabsTrigger>
						</TabsList>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto p-6">
						<TabsContent value="details">
							<DetailsTab
								{task}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
								onStartEditing={startEditing}
								onCancelEditing={cancelEditing}
								onSaveChanges={saveChanges}
								onDeleteTask={handleTaskDeleted}
								{isSaving}
								deleteUrl={`/api/v2/cases/${caseId}/tasks/${task.id}`}
							/>
						</TabsContent>

						<TabsContent value="comments">
							<CommentsTab {task} onRefresh={() => loadComments()} />
						</TabsContent>
					</div>
				</Tabs>
			</div>

			<div class="shrink-0 border-t bg-muted/30 px-6 py-4">
				<div class="text-xs text-muted-foreground">
					ID #{task.id || 'Unknown ID'} - UUID #{task.task_uuid || 'Unknown ID'}
				</div>
			</div>
		</div>
	</div>
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />
		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">Task Not Found</h2>
		<p class="text-muted-foreground">The task with ID #{taskId} could not be found or loaded.</p>
	</div>
{/if}
