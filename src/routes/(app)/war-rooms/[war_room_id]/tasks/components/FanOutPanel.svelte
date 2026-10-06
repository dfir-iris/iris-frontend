<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import { untrack } from 'svelte';
	import { Check, CircleDot, ExternalLink, Lock, Plus, Unlink } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		WarRoomTasksService,
		type WarRoomTaskFanOutLink
	} from '$lib/services/war-room-tasks.service';

	type Props = {
		warRoomId: number;
		taskId: number;
		canWrite: boolean;
		/** Bump to force a reload (e.g. after a new fan-out). */
		reloadKey?: number;
		/** Links loaded or changed — lets the page refresh its roll-up. */
		onChanged?: (links: WarRoomTaskFanOutLink[]) => void;
		/** Open the fan-out dialog for this task. */
		onAddCases?: () => void;
	};

	let { warRoomId, taskId, canWrite, reloadKey = 0, onChanged, onAddCases }: Props = $props();

	let links = $state<WarRoomTaskFanOutLink[]>([]);
	let loading = $state(true);
	let confirmOpen = $state(false);
	let pendingUnlink = $state<WarRoomTaskFanOutLink | null>(null);

	const load = async () => {
		loading = true;
		const res = await WarRoomTasksService.fanOutStatus(warRoomId, taskId);
		loading = false;
		if (res.ok && Array.isArray(res.data)) {
			links = res.data;
		} else {
			links = [];
			toast({ title: 'Could not load case tasks', variant: 'destructive' });
		}
	};

	// Initial load, then again whenever the parent bumps `reloadKey`.
	$effect(() => {
		void reloadKey;
		untrack(() => void load());
	});

	const askUnlink = (l: WarRoomTaskFanOutLink) => {
		pendingUnlink = l;
		confirmOpen = true;
	};

	const doUnlink = async () => {
		// Leave `pendingUnlink` set: the dialog title reads it while it
		// animates closed, and the next askUnlink overwrites it.
		const l = pendingUnlink;
		if (!l) return;
		const res = await WarRoomTasksService.unlinkFanOut(warRoomId, taskId, l.case_id);
		if (res.ok) {
			links = links.filter((x) => x.case_id !== l.case_id);
			toast({ title: `Unlinked case #${l.case_id}` });
			onChanged?.(links);
		} else {
			toast({ title: apiErrorMessage(res, 'Could not unlink case'), variant: 'destructive' });
		}
	};

	const caseTaskHref = (l: WarRoomTaskFanOutLink) =>
		l.case_task_id != null
			? `/case/${l.case_id}/tasks/${l.case_task_id}`
			: `/case/${l.case_id}/tasks`;
</script>

<div class="ml-8 border-l border-dashed pl-3" aria-label="Case tasks" role="region">
	{#if loading}
		<div class="flex flex-col gap-1 py-1">
			<Skeleton class="h-7 w-full" />
			<Skeleton class="h-7 w-full" />
		</div>
	{:else}
		<ul class="flex flex-col">
			{#each links as l (l.case_id)}
				{#if l.accessible}
					<li class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
						{#if l.done}
							<Check class="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Done" />
						{:else}
							<CircleDot class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Open" />
						{/if}
						<span class="font-mono text-xs text-muted-foreground">#{l.case_id}</span>
						<span class="min-w-0 max-w-[40%] truncate">{l.case_name ?? `Case #${l.case_id}`}</span>
						{#if l.task_title}
							<span class="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:inline">
								{l.task_title}
							</span>
						{:else}
							<span class="flex-1"></span>
						{/if}
						<span
							class="ml-auto shrink-0 text-xs {l.done
								? 'text-emerald-700 dark:text-emerald-400'
								: 'text-muted-foreground'}"
						>
							{l.status_name ?? 'No status'}
						</span>
						<span
							class="hidden w-28 shrink-0 truncate text-right text-2xs text-muted-foreground sm:inline"
						>
							{#if l.assignees?.length}
								{l.assignees.map((a) => a.name).join(', ')}
							{:else}
								<span class="italic">Unassigned</span>
							{/if}
						</span>
						<a
							href={caseTaskHref(l)}
							class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
							title="Open the task in its case"
							aria-label={`Open the task in case #${l.case_id}`}
						>
							<ExternalLink class="h-3.5 w-3.5" />
						</a>
						{#if canWrite}
							<button
								type="button"
								class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
								title="Unlink this case (the case task stays)"
								aria-label={`Unlink case #${l.case_id}`}
								onclick={() => askUnlink(l)}
							>
								<Unlink class="h-3.5 w-3.5" />
							</button>
						{/if}
					</li>
				{:else}
					<li
						class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
						title="You do not have access to this case"
					>
						<Lock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						<span class="font-mono text-xs">#{l.case_id}</span>
						<span class="italic">Restricted case</span>
					</li>
				{/if}
			{:else}
				<li class="px-2 py-1.5 text-xs text-muted-foreground">Not linked to any case.</li>
			{/each}
			{#if canWrite && onAddCases}
				<li>
					<Button
						variant="ghost"
						size="sm"
						class="mt-1 h-6 gap-1 px-2 text-2xs text-muted-foreground"
						onclick={onAddCases}
					>
						<Plus class="h-3 w-3" /> Add cases
					</Button>
				</li>
			{/if}
		</ul>
	{/if}
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={pendingUnlink ? `Unlink case #${pendingUnlink.case_id}?` : 'Unlink case?'}
	message="The task stays in the case; it just stops counting towards this war-room task."
	confirmText="Unlink"
	confirmButtonVariant="destructive"
	onConfirm={doUnlink}
/>
