<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Check, RotateCw, CircleDot, Pencil, Search, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		Popover,
		PopoverContent,
		PopoverTrigger
	} from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomTasksService,
		type WarRoomTask
	} from '$lib/services/war-room-tasks.service';
	import { UsersService, type User } from '$lib/services/users.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let tasks = $state<WarRoomTask[]>([]);
	let loading = $state(true);
	let users = $state<User[]>([]);

	type FormState = {
		title: string;
		description: string;
		due: string;
		assigneeId: number | null;
	};

	const emptyForm = (): FormState => ({
		title: '',
		description: '',
		due: '',
		assigneeId: null
	});

	let dialogOpen = $state(false);
	let dialogMode = $state<'create' | 'edit'>('create');
	let editing = $state<WarRoomTask | null>(null);
	let form = $state<FormState>(emptyForm());
	let saving = $state(false);

	let assigneeOpen = $state(false);
	let assigneeSearch = $state('');

	const load = async () => {
		loading = true;
		const res = await WarRoomTasksService.list(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			tasks = res.data;
		}
		loading = false;
	};

	const loadUsers = async () => {
		const res = await UsersService.list();
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as { data?: User[] };
			users = Array.isArray(payload.data) ? payload.data : [];
		}
	};

	onMount(() => {
		load();
		loadUsers();
	});

	const openCreate = () => {
		dialogMode = 'create';
		editing = null;
		form = emptyForm();
		dialogOpen = true;
	};

	const openEdit = (t: WarRoomTask) => {
		dialogMode = 'edit';
		editing = t;
		form = {
			title: t.title,
			description: t.description ?? '',
			due: t.due_at ? t.due_at.slice(0, 10) : '',
			assigneeId: t.assignee_id
		};
		dialogOpen = true;
	};

	const submit = async () => {
		const title = form.title.trim();
		if (!title) return;
		saving = true;
		const body = {
			title,
			description: form.description.trim() || null,
			due_at: form.due || null,
			assignee_id: form.assigneeId
		};
		const res =
			dialogMode === 'create'
				? await WarRoomTasksService.create(warRoomId, body)
				: await WarRoomTasksService.update(warRoomId, editing!.task_id, body);
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTask;
			if (dialogMode === 'create') {
				tasks = [next, ...tasks];
				toast({ title: 'Task created' });
			} else {
				tasks = tasks.map((x) => (x.task_id === next.task_id ? next : x));
				toast({ title: 'Task updated' });
			}
			dialogOpen = false;
		} else {
			toast({
				title: dialogMode === 'create' ? 'Could not create task' : 'Could not update task',
				variant: 'destructive'
			});
		}
	};

	const toggle = async (t: WarRoomTask) => {
		const action = t.closed_at ? 'reopen' : 'close';
		const res = await (action === 'close'
			? WarRoomTasksService.close(warRoomId, t.task_id)
			: WarRoomTasksService.reopen(warRoomId, t.task_id));
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTask;
			tasks = tasks.map((x) => (x.task_id === t.task_id ? next : x));
		}
	};

	const remove = async (t: WarRoomTask) => {
		if (!confirm('Delete this task?')) return;
		const res = await WarRoomTasksService.remove(warRoomId, t.task_id);
		if (res.ok) {
			tasks = tasks.filter((x) => x.task_id !== t.task_id);
		}
	};

	const open = $derived(tasks.filter((t) => !t.closed_at));
	const closed = $derived(tasks.filter((t) => t.closed_at));

	const assigneeLabel = $derived.by(() => {
		if (form.assigneeId == null) return 'Unassigned';
		const u = users.find((x) => x.user_id === form.assigneeId);
		return u ? u.user_name || u.user_login : `User #${form.assigneeId}`;
	});

	const userMatches = $derived.by(() => {
		const needle = assigneeSearch.trim().toLowerCase();
		if (!needle) return users.slice(0, 50);
		return users
			.filter((u) =>
				(u.user_login + ' ' + u.user_name).toLowerCase().includes(needle)
			)
			.slice(0, 50);
	});
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Tasks</h2>
			<p class="text-xs text-muted-foreground">
				War-room-level coordination tasks. Can optionally pull from an attached case.
			</p>
		</div>
		<Button onclick={openCreate}>
			<Plus class="mr-1 h-4 w-4" /> New task
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-12 w-full" />
			{/each}
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			<section>
				<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Open ({open.length})
				</h3>
				{#if open.length === 0}
					<p class="text-sm text-muted-foreground">No open tasks.</p>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each open as t (t.task_id)}
							<li class="flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2">
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => toggle(t)}
									aria-label="Close task"
								>
									<CircleDot class="h-3.5 w-3.5" />
								</Button>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm">{t.title}</p>
									<p class="line-clamp-1 text-2xs text-muted-foreground">
										{#if t.assignee_name}
											<span class="font-medium text-foreground">
												{t.assignee_name}
											</span>
										{:else}
											<span class="italic">Unassigned</span>
										{/if}
										{#if t.created_by_name}
											<span class="opacity-60">·</span>
											created by {t.created_by_name}
										{/if}
										{#if t.description}
											<span class="opacity-60">·</span>
											{t.description}
										{/if}
									</p>
								</div>
								{#if t.due_at}
									<span class="shrink-0 text-2xs text-muted-foreground">
										Due {new Date(t.due_at).toLocaleDateString()}
									</span>
								{/if}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => openEdit(t)}
									aria-label="Edit task"
								>
									<Pencil class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-destructive hover:text-destructive"
									onclick={() => remove(t)}
									aria-label="Delete"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if closed.length > 0}
				<section>
					<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Closed ({closed.length})
					</h3>
					<ul class="flex flex-col gap-1.5">
						{#each closed as t (t.task_id)}
							<li class="flex items-center gap-2 rounded-md border bg-card/20 px-3 py-2 text-muted-foreground">
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => toggle(t)}
									aria-label="Reopen task"
								>
									<Check class="h-3.5 w-3.5 text-green-600" />
								</Button>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm line-through">{t.title}</p>
									<p class="line-clamp-1 text-2xs">
										{#if t.closed_by_name}
											Closed by {t.closed_by_name}
										{:else}
											Closed
										{/if}
										{#if t.closed_at}
											<span class="opacity-60">·</span>
											{new Date(t.closed_at).toLocaleDateString()}
										{/if}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => toggle(t)}
									aria-label="Reopen"
								>
									<RotateCw class="h-3.5 w-3.5" />
								</Button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/if}
</div>

<Dialog bind:open={dialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{dialogMode === 'create' ? 'New task' : 'Edit task'}</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-title">
					Title
				</label>
				<Input
					id="task-title"
					value={form.title}
					oninput={(e) => (form.title = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-description">
					Description
				</label>
				<Input
					id="task-description"
					value={form.description}
					oninput={(e) => (form.description = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<span class="text-xs font-medium text-muted-foreground">Assignee</span>
				<div class="mt-1 flex items-center gap-1">
					<Popover bind:open={assigneeOpen}>
						<PopoverTrigger class="flex-1">
							<span
								class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-left text-sm font-normal hover:bg-accent hover:text-accent-foreground"
							>
								<span class="truncate">{assigneeLabel}</span>
							</span>
						</PopoverTrigger>
					<PopoverContent class="w-[--bits-popover-anchor-width] p-0">
						<div class="flex items-center border-b px-2">
							<Search class="h-3.5 w-3.5 text-muted-foreground" />
							<Input
								value={assigneeSearch}
								oninput={(e) => (assigneeSearch = (e.target as HTMLInputElement).value)}
								placeholder="Search users…"
								class="h-9 border-0 shadow-none focus-visible:ring-0"
							/>
						</div>
						<div class="max-h-64 overflow-y-auto py-1">
							<button
								type="button"
								class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
								onclick={() => {
									form.assigneeId = null;
									assigneeOpen = false;
								}}
							>
								<span class="italic text-muted-foreground">Unassigned</span>
							</button>
							{#each userMatches as u (u.user_id)}
								<button
									type="button"
									class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
									onclick={() => {
										form.assigneeId = u.user_id;
										assigneeOpen = false;
									}}
								>
									<span class="font-medium">{u.user_name || u.user_login}</span>
									{#if u.user_name && u.user_login !== u.user_name}
										<span class="ml-1 text-xs text-muted-foreground">
											@{u.user_login}
										</span>
									{/if}
								</button>
							{:else}
								<p class="px-3 py-2 text-xs text-muted-foreground">No users match.</p>
							{/each}
						</div>
					</PopoverContent>
					</Popover>
					{#if form.assigneeId != null}
						<Button
							variant="ghost"
							size="icon"
							class="h-9 w-9 shrink-0"
							onclick={() => (form.assigneeId = null)}
							aria-label="Clear assignee"
						>
							<X class="h-4 w-4" />
						</Button>
					{/if}
				</div>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-due">
					Due (optional)
				</label>
				<Input
					id="task-due"
					type="date"
					value={form.due}
					oninput={(e) => (form.due = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (dialogOpen = false)} disabled={saving}>
				Cancel
			</Button>
			<Button onclick={submit} disabled={saving || !form.title.trim()}>
				{saving ? 'Saving…' : dialogMode === 'create' ? 'Create' : 'Save'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
