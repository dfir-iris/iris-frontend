<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Check, RotateCw, CircleDot } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomTasksService,
		type WarRoomTask
	} from '$lib/services/war-room-tasks.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let tasks = $state<WarRoomTask[]>([]);
	let loading = $state(true);

	let createOpen = $state(false);
	let creating = $state(false);
	let newTitle = $state('');
	let newDescription = $state('');
	let newDue = $state('');

	const load = async () => {
		loading = true;
		const res = await WarRoomTasksService.list(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			tasks = res.data;
		}
		loading = false;
	};

	onMount(load);

	const submitCreate = async () => {
		const title = newTitle.trim();
		if (!title) return;
		creating = true;
		const res = await WarRoomTasksService.create(warRoomId, {
			title,
			description: newDescription.trim() || null,
			due_at: newDue || null
		});
		creating = false;
		if (res.ok) {
			toast({ title: 'Task created' });
			createOpen = false;
			newTitle = '';
			newDescription = '';
			newDue = '';
			load();
		} else {
			toast({ title: 'Could not create task', variant: 'destructive' });
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
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Tasks</h2>
			<p class="text-xs text-muted-foreground">
				War-room-level coordination tasks. Can optionally pull from an attached case.
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>
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
									<!--
									  Attribution line: who's on the hook + who put
									  it on the board. Both fields come from the
									  server-joined display name so we don't have
									  to look up users client-side.
									-->
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

<Dialog bind:open={createOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New task</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-title">
					Title
				</label>
				<Input
					id="task-title"
					value={newTitle}
					oninput={(e) => (newTitle = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-description">
					Description
				</label>
				<Input
					id="task-description"
					value={newDescription}
					oninput={(e) => (newDescription = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-due">
					Due (optional)
				</label>
				<Input
					id="task-due"
					type="date"
					value={newDue}
					oninput={(e) => (newDue = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (createOpen = false)} disabled={creating}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={creating || !newTitle.trim()}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
