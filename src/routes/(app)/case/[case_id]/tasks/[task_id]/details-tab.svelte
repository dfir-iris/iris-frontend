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
	import type { Task } from '$lib/types/resources/task';
	import type { Tag } from '$lib/types/resources/tag';
	import { toast } from '$lib/stores/toast.store';
	import type { RequestResponse } from '$lib/services/api.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import { TagInput, TagDisplay } from '$lib/components/common/tag';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
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

	let taskStatuses = $state<{ id: number; status_name: string }[]>([]);
	let users = $state<User[]>([]);
	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

	const statusOptions = $derived<SelectOption[]>(
		taskStatuses.map((s) => ({
			value: String(s.id),
			label: s.status_name
		}))
	);

	const userOptions = $derived<SelectOption[]>(
		users.map((u) => ({
			value: String(u.user_id),
			label: `${u.user_login} (${u.user_name})`
		}))
	);

	const loadOptions = async () => {
		const [statusRes, usersRes] = await Promise.all([
			TaskStatusService.list(),
			UsersService.list()
		]);

		if (statusRes.ok && Array.isArray(statusRes.data)) {
			taskStatuses = statusRes.data;
		}

		if (usersRes.ok && usersRes.data) {
			const envelope = usersRes.data as unknown as RequestResponse<User[]>;
			users = (envelope.data ?? []).filter((u) => !u.user_is_service_account);
		}

		const hooksResponse = (await HooksService.list('task')).data as unknown as RequestResponse<
			HookOption[]
		>;

		hookOptions = hooksResponse.data as HookOption[];
	};

	const updateField = (field: string, value: string | number | number[]) =>
		onUpdateEditData(field, value);

	const handleTagsChange = (tags: Tag[]) => onUpdateEditData('task_tags', tags);

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

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#if isEditing && editData}
				<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ClipboardListIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Title *</p>

							<Input
								value={editData.task_title}
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
									value={editData.task_status_id ? String(editData.task_status_id) : ''}
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
									value={editData.task_assignees_id?.map(String) ?? []}
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
			{:else}
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
									<div class="flex flex-wrap gap-1">
										{#each task.task_assignees as assignee}
											<span
												class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
											>
												{assignee.name || assignee.user}
											</span>
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
					value={editData.task_description}
					onChange={(value) => updateField('task_description', value)}
					onSave={onSaveChanges}
				/>
			{:else if task.task_description}
				<MarkDownPreview markdown={task.task_description} />
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
			{:else if task.task_tags}
				<TagDisplay tags={task.task_tags} size="default" />
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

				<p class="whitespace-pre-wrap break-all font-semibold text-foreground">{value}</p>

				{#if hint}
					<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
				{/if}
			</div>
		</div>
	</div>
{/snippet}
