<!--
  War-room "Cases" tab.

  Two responsibilities:
    * Multi-select attach: an operator can search across every case
      they have full-access to and tick the checkboxes they want to
      pull into the war room — no more one-at-a-time round-trips.
    * Quick-peek: clicking an attached row opens the same
      `CaseDetailModal` the cases overview uses, so the operator can
      inspect a case without leaving the war-room workspace.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		ExternalLink,
		Loader2,
		Plus,
		Search,
		Trash2,
		WaypointsIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import CaseDetailModal from '$lib/components/common/CaseDetailModal.svelte';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let attachments = $state<WarRoomCaseAttachment[]>([]);
	let loading = $state(true);

	// --- Detail modal ---------------------------------------------------
	let detailOpen = $state(false);
	let detailCaseId = $state<number | null>(null);

	const openDetail = (caseId: number) => {
		detailCaseId = caseId;
		detailOpen = true;
	};

	// --- Attach dialog --------------------------------------------------
	let attachOpen = $state(false);
	let attaching = $state(false);
	let caseSearch = $state('');
	let candidates = $state<Case[]>([]);
	let candidatesLoading = $state(false);
	// Multi-select model: a Set of case ids the operator has ticked. The
	// ids are not pruned when the search changes — that way you can
	// search-tick-search-tick and submit the full set at the end.
	let selectedIds = $state<Set<number>>(new Set());
	// Cache of case rows that were once selected (so we can show their
	// names in the "selected" pill row even after the search query
	// pushes them out of the candidate list).
	let selectedCache = $state<Record<number, Case>>({});
	let attachNote = $state('');

	const load = async () => {
		loading = true;
		const res = await WarRoomsService.listCases(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			attachments = res.data;
		}
		loading = false;
	};

	onMount(load);

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const onSearchCandidates = (value: string) => {
		caseSearch = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			candidatesLoading = true;
			// Reuse the existing cases search endpoint — `quick_search`
			// matches against name, customer, and numeric id.
			const res = await CaseService.list({
				quick_search: value.trim() || undefined,
				per_page: 50
			});
			candidatesLoading = false;
			if (res.ok && res.data && typeof res.data !== 'string') {
				const payload = res.data as { data: Case[] };
				const attached = new Set(attachments.map((a) => a.case_id));
				candidates = (payload.data ?? []).filter(
					(c) => !attached.has(c.case_id)
				);
			}
		}, 250);
	};

	const openAttach = () => {
		caseSearch = '';
		selectedIds = new Set();
		selectedCache = {};
		attachNote = '';
		candidates = [];
		attachOpen = true;
		onSearchCandidates('');
	};

	const toggleCandidate = (c: Case) => {
		const next = new Set(selectedIds);
		if (next.has(c.case_id)) {
			next.delete(c.case_id);
		} else {
			next.add(c.case_id);
			selectedCache = { ...selectedCache, [c.case_id]: c };
		}
		selectedIds = next;
	};

	const removeFromSelection = (caseId: number) => {
		const next = new Set(selectedIds);
		next.delete(caseId);
		selectedIds = next;
	};

	const submitAttach = async () => {
		if (selectedIds.size === 0) return;
		attaching = true;
		const ids = Array.from(selectedIds);
		const note = attachNote.trim() || null;

		// Fan out the attach calls. Best-effort per case so a single
		// failure doesn't block the rest — we surface a summary toast at
		// the end.
		let okCount = 0;
		let failCount = 0;
		for (const id of ids) {
			const res = await WarRoomsService.attachCase(warRoomId, {
				case_id: id,
				note
			});
			if (res.ok) okCount++;
			else failCount++;
		}
		attaching = false;

		if (okCount > 0) {
			toast({
				title:
					okCount === 1
						? '1 case attached'
						: `${okCount} cases attached`,
				description:
					failCount > 0
						? `${failCount} could not be attached.`
						: undefined,
				variant: failCount === 0 ? 'success' : 'destructive'
			});
		} else {
			toast({
				title: 'Could not attach any case',
				variant: 'destructive'
			});
		}
		attachOpen = false;
		load();
	};

	const detach = async (caseId: number) => {
		if (!confirm('Detach this case from the war room?')) return;
		const res = await WarRoomsService.detachCase(warRoomId, caseId);
		if (res.ok) {
			toast({ title: 'Case detached' });
			attachments = attachments.filter((a) => a.case_id !== caseId);
		} else {
			toast({ title: 'Could not detach', variant: 'destructive' });
		}
	};

	// Resolve the selected ids back to their cached display rows so the
	// chip strip above the candidates list reads like a basket.
	const selectedRows = $derived.by<Case[]>(() => {
		const out: Case[] = [];
		for (const id of selectedIds) {
			const c = selectedCache[id];
			if (c) out.push(c);
		}
		return out;
	});
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Attached cases</h2>
			<p class="text-xs text-muted-foreground">
				Cases pulled into this war room for coordinated triage. Click a row to peek at
				the case details.
			</p>
		</div>
		<Button onclick={openAttach}>
			<Plus class="mr-1 h-4 w-4" /> Attach cases
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if attachments.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<p class="text-sm text-muted-foreground">
				No cases attached yet. Attach cases to start coordinating them from this war
				room.
			</p>
			<Button variant="outline" onclick={openAttach}>
				<Plus class="mr-1 h-4 w-4" /> Attach cases
			</Button>
		</div>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each attachments as a (a.case_id)}
				<li
					class="group flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2 transition-colors hover:bg-card"
				>
					<button
						type="button"
						class="flex min-w-0 flex-1 items-start gap-2 text-left"
						onclick={() => openDetail(a.case_id)}
						aria-label={`Open details for case #${a.case_id}`}
					>
						<WaypointsIcon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<span class="truncate text-sm font-medium">{a.case_name}</span>
								<span class="font-mono text-2xs text-muted-foreground">
									#{a.case_id}
								</span>
							</span>
							<!--
							  Secondary line packs the customer name + the
							  optional attach note. We always render the
							  customer if known so the operator can spot at a
							  glance whether several cases under the same
							  client are in the room.
							-->
							<span class="mt-0.5 block truncate text-2xs text-muted-foreground">
								{#if a.customer_name}
									{a.customer_name}
									{#if a.note}
										<span class="opacity-50">·</span>
										{a.note}
									{/if}
								{:else if a.note}
									{a.note}
								{/if}
							</span>
						</span>
					</button>

					<a
						href={`/case/${a.case_id}`}
						class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						aria-label="Open case in a new tab"
						onclick={(e) => e.stopPropagation()}
					>
						<ExternalLink class="h-4 w-4" />
					</a>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 text-destructive hover:text-destructive"
						onclick={(e) => {
							e.stopPropagation();
							detach(a.case_id);
						}}
						aria-label="Detach"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!--
  Attach dialog. `sm:max-w-2xl` + `max-h-[85vh]` + a constrained inner
  grid keeps the content from spilling outside the modal even with long
  case names; the candidates list owns the scroll inside that frame.
-->
<Dialog bind:open={attachOpen}>
	<DialogContent
		class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
	>
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle>Attach cases</DialogTitle>
			<DialogDescription>
				Pick one or more cases to pull into this war room. Only cases you have full
				access to are listed.
			</DialogDescription>
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={caseSearch}
					oninput={(e) => onSearchCandidates((e.target as HTMLInputElement).value)}
					placeholder="Search by case name, customer, or id"
					class="pl-7"
				/>
			</div>

			<!-- Selected basket. Sticks above the candidate list so the
			     operator can see what they've already picked while
			     searching for more. -->
			{#if selectedRows.length > 0}
				<div class="rounded-md border bg-muted/30 px-3 py-2">
					<div class="mb-1.5 flex items-center justify-between">
						<p class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Selected ({selectedRows.length})
						</p>
						<button
							type="button"
							class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => (selectedIds = new Set())}
						>
							Clear
						</button>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each selectedRows as c (c.case_id)}
							<button
								type="button"
								class="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-2xs hover:bg-muted/60"
								onclick={() => removeFromSelection(c.case_id)}
								title="Remove from selection"
							>
								<span class="truncate">
									#{c.case_id} — {c.case_name}
								</span>
								<Trash2 class="h-2.5 w-2.5 opacity-60 group-hover:text-destructive" />
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="min-h-0 flex-1 overflow-y-auto rounded-md border">
				{#if candidatesLoading}
					<div class="p-3 text-center text-xs text-muted-foreground">
						Searching…
					</div>
				{:else if candidates.length === 0}
					<div class="p-3 text-center text-xs text-muted-foreground">
						No matching cases.
					</div>
				{:else}
					<ul class="divide-y">
						{#each candidates as c (c.case_id)}
							{@const selected = selectedIds.has(c.case_id)}
							<li>
								<label
									class={[
										'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors',
										selected ? 'bg-primary/5' : 'hover:bg-muted/40'
									]}
								>
									<Checkbox
										checked={selected}
										onCheckedChange={() => toggleCandidate(c)}
										aria-label={`Select case #${c.case_id}`}
									/>
									<span class="flex min-w-0 flex-1 items-center gap-2">
										<span class="font-mono text-2xs text-muted-foreground">
											#{c.case_id}
										</span>
										<span class="flex min-w-0 flex-1 flex-col">
											<span class="truncate">{c.case_name}</span>
											{#if c.case_customer?.customer_name}
												<span class="truncate text-2xs text-muted-foreground">
													{c.case_customer.customer_name}
												</span>
											{/if}
										</span>
									</span>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<label
					class="text-xs font-medium text-muted-foreground"
					for="attach-note"
				>
					Note (optional, applied to every attachment)
				</label>
				<Input
					id="attach-note"
					value={attachNote}
					oninput={(e) => (attachNote = (e.target as HTMLInputElement).value)}
					placeholder="Why are these cases in the war room?"
					class="mt-1"
				/>
			</div>
		</div>

		<DialogFooter class="border-t px-6 py-3">
			<Button
				variant="ghost"
				onclick={() => (attachOpen = false)}
				disabled={attaching}
			>
				Cancel
			</Button>
			<Button
				onclick={submitAttach}
				disabled={attaching || selectedIds.size === 0}
				class="gap-1.5"
			>
				{#if attaching}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{/if}
				{attaching
					? 'Attaching…'
					: selectedIds.size > 1
						? `Attach ${selectedIds.size} cases`
						: 'Attach case'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<CaseDetailModal
	bind:open={detailOpen}
	caseId={detailCaseId}
	onOpenChange={(v) => (detailOpen = v)}
/>
