<!--
  Task detail panel. Renders the identity strip plus the tabs (Details /
  Comments) for one task. Used by:
    - the task route page  (/case/:case_id/tasks/:task_id)
    - the TaskDetailDialog (modal opened from mention chips)
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		AlertTriangleIcon,
		ClipboardListIcon,
		InfoIcon,
		MessagesSquareIcon,
		SearchIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import CustomAttributesTabWrapper from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import { onMount } from 'svelte';
	import { type Task } from '$lib/types/resources/task';
	import type { Tag } from '$lib/types/resources/tag';
	import { cn } from '$lib/utils';
	import { normalizeTags, tagsToString } from '$lib/utils/tags';
	import { toast } from '$lib/stores/toast.store';
	import type { UpdateCaseTaskBody } from '$lib/services/case-tasks.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import EntityDetailHeader from '$lib/components/common/EntityDetailHeader.svelte';
	import { getTaskUrl } from '../helpers';
	import DetailsTab from './details-tab.svelte';
	import CommentsTab from './comments-tab.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';

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
	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);

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
		// Edit lives in the header strip now, so it can be hit from any tab —
		// send the user to the form they just asked for.
		activeTab = 'details';
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

	onMount(() => {
		void ensureHasCustomAttributes('task');
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
				{#each Array(9) as _}
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
			<EntityDetailHeader
				Icon={ClipboardListIcon}
				title={task.task_title}
				subtitle={`Task · #${task.id}`}
				{isEditing}
				{isSaving}
				{canEdit}
				editLabel="Edit Task"
				onStartEditing={startEditing}
				onCancelEditing={cancelEditing}
				onSaveChanges={saveChanges}
				onDelete={handleTaskDeleted}
				deleteUrl={`/api/v2/cases/${caseId}/tasks/${task.id}`}
				deletePrompt={`Are you sure you want to delete the task "${task.task_title}"? This action cannot be undone.`}
				shareUrl={getTaskUrl(caseId, String(task.id))}
				markdownIcon="fa-list-check"
				hookType="task"
				{caseId}
				objectId={task.id}
			/>

			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="comments"
								class="relative flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<MessagesSquareIcon class="mr-1 h-4 w-4" />
								<span>Comments</span>

								<!--
								  Zero renders dimmed rather than hidden: "checked,
								  none" and "not loaded yet" have to look different.
								-->
								<span
									class={cn(
										'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors',
										!comments.length && 'opacity-40'
									)}
								>
									{comments.length}
								</span>
							</TabsTrigger>

							{#if hasCustomAttributes.task === true}
								<TabsTrigger
									value="custom_attributes"
									class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
								>
									<WaypointsIcon class="mr-1 h-4 w-4" />
									<span>Custom attributes</span>
								</TabsTrigger>
							{/if}
						</TabsList>
					</div>

					<!--
					  No padding here: the Details tab opens on a full-bleed field
					  board that must reach both pane edges. Tabs that render
					  ordinary content bring their own padding.
					-->
					<div class="min-h-0 flex-1 overflow-y-auto">
						<TabsContent value="details" class="mt-0 min-h-full">
							<DetailsTab
								{task}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
								onSaveChanges={saveChanges}
							/>
						</TabsContent>

						<TabsContent value="comments" class="mt-0 p-4">
							<CommentsTab {task} onRefresh={() => loadComments()} />
						</TabsContent>

						{#if hasCustomAttributes.task === true}
							<TabsContent value="custom_attributes" class="mt-0 p-4">
								<CustomAttributesTabWrapper
									objectType="task"
									existing={(task.custom_attributes ?? null) as Record<
										string,
										Record<string, unknown>
									> | null}
									{canEdit}
									onSave={async (values) => {
										const updated = await caseTasks.patchTask(
											taskId,
											{ custom_attributes: values },
											{ fetch }
										);
										if (!updated) throw new Error('Failed to update task');
									}}
								/>
							</TabsContent>
						{/if}
					</div>
				</Tabs>
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
