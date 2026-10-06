<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import { Check, CircleAlert, Lock, Network } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Switch } from '$lib/components/ui/switch';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import {
		WarRoomTasksService,
		type WarRoomTask,
		type WarRoomTaskFanOutResult
	} from '$lib/services/war-room-tasks.service';

	type Props = {
		open: boolean;
		warRoomId: number;
		task: WarRoomTask | null;
		/** Called once the request returned, with the per-case results. */
		onDone?: (results: WarRoomTaskFanOutResult[]) => void;
	};

	let { open = $bindable(false), warRoomId, task, onDone }: Props = $props();

	let cases = $state<WarRoomCaseAttachment[]>([]);
	let loadingCases = $state(false);
	let selected = $state<Set<number>>(new Set());
	let assignToOwner = $state(true);
	let submitting = $state(false);
	let results = $state<WarRoomTaskFanOutResult[] | null>(null);
	// Cases the task is already linked to: shown checked + disabled.
	let linked = $state<Set<number>>(new Set());
	const selectable = $derived(cases.filter((c) => !linked.has(c.case_id)));
	const allSelected = $derived(
		selectable.length > 0 && selectable.every((c) => selected.has(c.case_id))
	);

	const loadCases = async (taskId: number) => {
		loadingCases = true;
		const [res, linksRes] = await Promise.all([
			WarRoomsService.listCases(warRoomId),
			WarRoomTasksService.fanOutStatus(warRoomId, taskId)
		]);
		loadingCases = false;
		linked = new Set(
			linksRes.ok && Array.isArray(linksRes.data) ? linksRes.data.map((l) => l.case_id) : []
		);
		if (res.ok && Array.isArray(res.data)) {
			cases = res.data;
			// Default to every case that does not have the task yet —
			// "fan out" almost always means "to all of them".
			selected = new Set(cases.filter((c) => !linked.has(c.case_id)).map((c) => c.case_id));
		} else {
			cases = [];
			toast({ title: 'Could not load attached cases', variant: 'destructive' });
		}
	};

	// Reset and (re)load each time the dialog opens.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen && task) {
			results = null;
			assignToOwner = true;
			selected = new Set();
			linked = new Set();
			void loadCases(task.task_id);
		}
		wasOpen = open;
	});

	const toggle = (caseId: number, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(caseId);
		else next.delete(caseId);
		selected = next;
	};

	const toggleAll = () => {
		selected = allSelected ? new Set() : new Set(selectable.map((c) => c.case_id));
	};

	const caseName = (caseId: number) =>
		cases.find((c) => c.case_id === caseId)?.case_name ?? `Case #${caseId}`;

	const submit = async () => {
		if (!task || selected.size === 0) return;
		submitting = true;
		const res = await WarRoomTasksService.fanOut(warRoomId, task.task_id, {
			case_ids: [...selected],
			assign_to_case_owner: assignToOwner
		});
		submitting = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			results = Array.isArray(res.data.results) ? res.data.results : [];
			const created = results.filter((r) => r.status === 'created').length;
			const failed = results.filter((r) => r.status === 'denied' || r.status === 'error').length;
			toast({
				title: `Fanned out to ${created} case${created === 1 ? '' : 's'}`,
				description: failed ? `${failed} case${failed === 1 ? '' : 's'} failed.` : undefined,
				variant: failed && !created ? 'destructive' : undefined
			});
			onDone?.(results);
		} else {
			toast({
				title: apiErrorMessage(res, 'Could not fan out the task'),
				variant: 'destructive'
			});
		}
	};

	const STATUS_LABEL: Record<string, string> = {
		created: 'Created',
		exists: 'Already linked',
		denied: 'No access',
		error: 'Error'
	};

	const statusClass = (status: string) => {
		switch (status) {
			case 'created':
				return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
			case 'exists':
				return 'border-border bg-muted text-muted-foreground';
			default:
				return 'border-destructive/40 bg-destructive/10 text-destructive';
		}
	};
</script>

<Dialog bind:open>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>Fan out to cases</DialogTitle>
			<DialogDescription>
				{#if task}
					Creates one linked task per selected case for “{task.title}”, visible in each case's own
					task list.
				{/if}
			</DialogDescription>
		</DialogHeader>

		{#if results}
			<ul
				class="flex max-h-[50vh] flex-col gap-1 overflow-y-auto py-2"
				aria-label="Fan-out results"
			>
				{#each results as r (r.case_id)}
					<li class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
						{#if r.status === 'created' || r.status === 'exists'}
							<Check class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
						{:else if r.status === 'denied'}
							<Lock class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						{:else}
							<CircleAlert class="h-3.5 w-3.5 shrink-0 text-destructive" />
						{/if}
						<span class="font-mono text-xs text-muted-foreground">#{r.case_id}</span>
						<span class="min-w-0 flex-1 truncate">{caseName(r.case_id)}</span>
						{#if r.message}
							<span class="hidden max-w-[40%] truncate text-2xs text-muted-foreground sm:inline">
								{r.message}
							</span>
						{/if}
						<span
							class="shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium {statusClass(
								r.status
							)}"
						>
							{STATUS_LABEL[r.status] ?? r.status}
						</span>
					</li>
				{/each}
			</ul>
			<DialogFooter>
				<Button onclick={() => (open = false)}>Close</Button>
			</DialogFooter>
		{:else}
			<div class="flex flex-col gap-3 py-2">
				<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
					<label for="fan-out-assign-owner" class="min-w-0">
						<span class="block text-sm font-medium">Assign to case owner</span>
						<span class="block text-xs text-muted-foreground">
							Each case task goes to the owner of its case
						</span>
					</label>
					<Switch id="fan-out-assign-owner" bind:checked={assignToOwner} />
				</div>

				<div>
					<div class="mb-1 flex items-center justify-between">
						<p class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Attached cases
						</p>
						{#if selectable.length > 1}
							<button
								type="button"
								class="text-2xs text-muted-foreground hover:text-foreground"
								onclick={toggleAll}
							>
								{allSelected ? 'Clear' : 'Select all'}
							</button>
						{/if}
					</div>
					{#if loadingCases}
						<div class="flex flex-col gap-1">
							{#each Array(3) as _}
								<Skeleton class="h-8 w-full" />
							{/each}
						</div>
					{:else if cases.length === 0}
						<p class="text-sm text-muted-foreground">No cases are attached to this war room.</p>
					{:else}
						<ul class="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto rounded-md border p-1">
							{#each cases as c (c.case_id)}
								{@const isLinked = linked.has(c.case_id)}
								{@const id = `fan-out-case-${c.case_id}`}
								<li
									class={[
										'flex items-center gap-2 rounded px-2 py-1.5',
										isLinked ? 'opacity-60' : 'hover:bg-muted/50'
									]}
								>
									<Checkbox
										{id}
										checked={isLinked || selected.has(c.case_id)}
										disabled={isLinked}
										onCheckedChange={(v) => toggle(c.case_id, v === true)}
									/>
									<label for={id} class="flex min-w-0 flex-1 items-center gap-2 text-sm">
										<span class="font-mono text-xs text-muted-foreground">#{c.case_id}</span>
										<span class="truncate">{c.case_name}</span>
										{#if c.customer_name}
											<span class="truncate text-xs text-muted-foreground">
												· {c.customer_name}
											</span>
										{/if}
									</label>
									{#if isLinked}
										<span class="shrink-0 text-2xs text-muted-foreground">Linked</span>
									{:else if assignToOwner}
										<span class="shrink-0 truncate text-2xs text-muted-foreground">
											{c.owner_name || c.owner_login || 'No owner'}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
			<DialogFooter>
				<Button variant="ghost" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
				<Button onclick={submit} disabled={submitting || selected.size === 0 || !task}>
					<Network class="mr-1 h-4 w-4" />
					{submitting
						? 'Fanning out…'
						: `Fan out to ${selected.size} case${selected.size === 1 ? '' : 's'}`}
				</Button>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
