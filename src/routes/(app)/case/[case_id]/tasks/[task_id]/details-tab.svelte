<script lang="ts">
	import {
		ClipboardListIcon,
		FileTextIcon,
		CheckCircleIcon,
		UserIcon,
		CalendarIcon,
		XIcon,
		SaveIcon,
		EditIcon,
		EllipsisVerticalIcon,
		ForwardIcon,
		FileSymlinkIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import type { Task, TaskStatus } from '$lib/types/resources/task';
	import type { Tag } from '$lib/types/resources/tag';
	import { toast } from '$lib/stores/toast.store';
	import type { RequestResponse } from '$lib/services/api.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import { TagDisplay } from '$lib/components/common/tag';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import TaskForm from '../components/task-form.svelte';
	import { callHook } from '../../utils/hooks';
	import { getTaskUrl } from '../helpers';

	type IconComponent = typeof ClipboardListIcon;

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
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteTask?: () => void;
		isSaving?: boolean;
		deleteUrl?: string;
	};

	let {
		task,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteTask = () => {},
		isSaving = false,
		deleteUrl = ''
	}: Props = $props();

	let taskStatuses = $state<TaskStatus[]>([]);
	let users = $state<CaseAccessUserRow[]>([]);
	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

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

		const hooksResponse = (await HooksService.list('task')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = hooksResponse.data as HookOption[];
	};

	const updateField = (field: string, value: string | number | number[] | Tag[]) =>
		onUpdateEditData(field, value);

	const callModule = async (hookOption: HookOption) => {
		const result = await callHook(Number(task.case?.case_id), 'task', [task.id], hookOption);

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
					<ClipboardListIcon class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Task #{task.id}</h2>
				</div>

				{#if task.task_uuid}
					<p class="mt-1 break-all font-mono text-xs italic text-muted-foreground">
						#{task.task_uuid}
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
						onrefresh={onDeleteTask}
						buttonText="Delete"
						deletion_prompt_message={`Are you sure you want to delete the task "${task.task_title}"? This action cannot be undone.`}
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
									.writeText(getTaskUrl(task.case?.case_id, String(task.id)))
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
										`[<i class="fa-solid fa-list-check"></i> #${task.id}](${getTaskUrl(task.case?.case_id, String(task.id))})`
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
			<TaskForm
				formData={editData}
				{currentTags}
				{taskStatuses}
				{users}
				onUpdateField={updateField}
				onSave={onSaveChanges}
			/>
		{:else}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				{@render fieldWithIcon('Title', task.task_title, ClipboardListIcon, null, 'md:col-span-2')}

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<CheckCircleIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Status</p>
							<div class="mt-1">
								{#if task.status}
									<StatusBadge status={task.status.status_name as CaseStatus} />
								{:else}
									<p class="font-semibold text-foreground">N/A</p>
								{/if}
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
								{#if task.task_assignees?.length}
									<div class="flex flex-wrap items-center gap-1">
										{#each task.task_assignees as assignee (assignee.id)}
											{@const me =
												($current_user?.user_id ?? $current_user?.id ?? null) ===
												assignee.id}
											<Chip
												kind="user"
												id={assignee.id}
												label={me ? 'You' : assignee.name || assignee.user}
												title={assignee.name || assignee.user}
											/>
										{/each}
									</div>
								{:else}
									<p class="font-semibold text-foreground">Unassigned</p>
								{/if}
							</div>
						</div>
					</div>
				</div>

				{@render fieldWithIcon('Open Date', task.task_open_date ?? 'N/A', CalendarIcon)}
			</div>

			<section class="mt-6">
				<div class="mb-4 flex items-center gap-2 border-b pb-2">
					<FileTextIcon class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Description</h2>
				</div>
				<div class="rounded-lg bg-card/40 p-4">
					{#if task.task_description}
						<MarkDownPreview markdown={task.task_description} />
					{:else}
						<p class="italic text-muted-foreground">No description provided</p>
					{/if}
				</div>
			</section>

			<section class="mt-6">
				<div class="rounded-lg bg-card/40 p-4">
					{#if task.task_tags}
						<TagDisplay tags={task.task_tags} size="default" />
					{:else}
						<p class="italic text-muted-foreground">No tags</p>
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
