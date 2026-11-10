<!--
  Add rows to a manual tracker: free-text lines (one row each) and / or
  war-room items picked from the scope listings. An item already in the
  tracker can be added again: it gets one more row.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import TrackerStepChip from '$lib/components/common/trackers/TrackerStepChip.svelte';
	import { WarRoomScopeService } from '$lib/services/war-room-scope.service';
	import { WarRoomsService } from '$lib/services/war-rooms.service';
	import {
		TRACKER_ITEM_TYPE_LABEL,
		WarRoomTrackersService,
		trackerTimelineWarning,
		type Tracker,
		type TrackerItemType,
		type TrackerNewRow,
		type TrackerRow,
		type TrackerStep
	} from '$lib/services/war-room-trackers.service';
	import { caseNumberedName } from '$lib/utils/case-name';
	import { errorMessage } from '../helpers';
	import { okObject } from '$lib/components/common/trackers/tracker-helpers';

	type Props = {
		open: boolean;
		warRoomId: number;
		tracker: Tracker;
		offered: TrackerStep[];
		/** Rows per item (`asset:44`) already in the tracker. */
		itemCounts: Map<string, number>;
		onAdded?: (rows: TrackerRow[]) => void;
	};

	let { open = $bindable(), warRoomId, tracker, offered, itemCounts, onAdded }: Props = $props();

	interface Candidate {
		key: string;
		type: TrackerItemType;
		id: number;
		label: string;
		hint: string;
	}

	const TYPES: TrackerItemType[] = ['asset', 'ioc', 'customer', 'case', 'managed_asset'];
	const SHOWN = 200;

	let text = $state('');
	let type = $state<TrackerItemType>('asset');
	let q = $state('');
	let candidates = $state<Candidate[]>([]);
	let loading = $state(false);
	let truncated = $state(false);
	let picked = $state<Map<string, Candidate>>(new Map());
	let stepIds = $state<number[]>([]);
	let note = $state('');
	let busy = $state(false);
	let seq = 0;

	const lines = $derived(
		text
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
	);

	const shown = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		const list = needle
			? candidates.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(needle))
			: candidates;
		return list.slice(0, SHOWN);
	});

	const load = async () => {
		const mine = ++seq;
		loading = true;
		truncated = false;
		let out: Candidate[] = [];
		const kind = type;
		if (kind === 'asset') {
			const body = okObject(await WarRoomScopeService.listAssets(warRoomId));
			if (body) {
				truncated = body.truncated;
				out = body.data.map((a) => ({
					key: `asset:${a.asset_id}`,
					type: kind,
					id: a.asset_id,
					label: a.asset_name,
					hint: [a.asset_type_name, caseNumberedName(a.case_id, a.case_name)]
						.filter(Boolean)
						.join(' · ')
				}));
			}
		} else if (kind === 'ioc') {
			const body = okObject(await WarRoomScopeService.listIocs(warRoomId));
			if (body) {
				truncated = body.truncated;
				const seen = new Set<number>();
				for (const i of body.data) {
					if (seen.has(i.ioc_id)) continue;
					seen.add(i.ioc_id);
					out.push({
						key: `ioc:${i.ioc_id}`,
						type: kind,
						id: i.ioc_id,
						label: i.ioc_value,
						hint: [i.ioc_type_name, caseNumberedName(i.case_id, i.case_name)]
							.filter(Boolean)
							.join(' · ')
					});
				}
			}
		} else if (kind === 'customer') {
			const body = okObject(await WarRoomScopeService.listCustomers(warRoomId));
			if (body) {
				out = body.data
					.filter((c) => c.customer_id !== null)
					.map((c) => ({
						key: `customer:${c.customer_id}`,
						type: kind,
						id: c.customer_id as number,
						label: c.customer_name ?? `Customer #${c.customer_id}`,
						hint: `${c.cases.length} ${c.cases.length === 1 ? 'case' : 'cases'}`
					}));
			}
		} else if (kind === 'case') {
			const res = await WarRoomsService.listCases(warRoomId);
			if (res.ok && Array.isArray(res.data)) {
				out = res.data.map((c) => ({
					key: `case:${c.case_id}`,
					type: kind,
					id: c.case_id,
					label: caseNumberedName(c.case_id, c.case_name),
					hint: [c.customer_name, c.state_name].filter(Boolean).join(' · ')
				}));
			}
		} else {
			const body = okObject(await WarRoomScopeService.listRegistryAssets(warRoomId));
			if (body) {
				truncated = body.truncated;
				const seen = new Set<number>();
				for (const r of body.data) {
					if (seen.has(r.managed_asset_id)) continue;
					seen.add(r.managed_asset_id);
					out.push({
						key: `managed_asset:${r.managed_asset_id}`,
						type: kind,
						id: r.managed_asset_id,
						label: r.asset_name,
						hint: [r.asset_type_name, r.owner].filter(Boolean).join(' · ')
					});
				}
			}
		}
		if (mine !== seq) return;
		candidates = out;
		loading = false;
	};

	$effect(() => {
		if (!open) return;
		untrack(() => {
			text = '';
			q = '';
			note = '';
			picked = new Map();
			stepIds = [];
			busy = false;
		});
	});

	$effect(() => {
		void type;
		if (open) untrack(() => void load());
	});

	const togglePick = (c: Candidate) => {
		const next = new Map(picked);
		if (next.has(c.key)) next.delete(c.key);
		else next.set(c.key, c);
		picked = next;
	};

	const toggleStep = (id: number) => {
		stepIds = stepIds.includes(id) ? stepIds.filter((s) => s !== id) : [...stepIds, id];
	};

	const total = $derived(lines.length + picked.size);

	const submit = async () => {
		if (total === 0 || busy) return;
		const rows: TrackerNewRow[] = [
			...lines.map((label) => ({ label })),
			...[...picked.values()].map((c) => ({ item_type: c.type, item_id: c.id }))
		];
		busy = true;
		try {
			const res = await WarRoomTrackersService.addRows(warRoomId, tracker.id, {
				rows,
				allow_duplicates: true,
				step_ids: stepIds.length ? stepIds : undefined,
				note: note.trim() || undefined
			});
			const body = okObject(res);
			if (!body) {
				if (res.status !== 403) {
					toast({
						title: 'Could not add the rows',
						description: errorMessage(res, 'The server refused the request.'),
						variant: 'destructive'
					});
				}
				return;
			}
			const added = body.data ?? [];
			const skipped = rows.length - added.length;
			const timelineWarning = trackerTimelineWarning(body.timeline);
			const description = [
				skipped > 0 ? `${skipped} already in the tracker.` : null,
				timelineWarning
			]
				.filter(Boolean)
				.join(' ');
			toast({
				title: `${added.length} ${added.length === 1 ? 'row' : 'rows'} added`,
				description: description || undefined,
				variant: timelineWarning ? 'warning' : 'success'
			});
			open = false;
			onAdded?.(added);
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Add rows to {tracker.name}</Dialog.Title>
			<Dialog.Description>
				Type free-text rows (one per line) and / or pick items of the war room.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
			<div class="flex flex-col gap-1">
				<label
					for="tracker-add-text"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Free-text rows
				</label>
				<Textarea
					id="tracker-add-text"
					rows={3}
					bind:value={text}
					placeholder={'ACME Corp — legal\nPartner SOC'}
					disabled={busy}
					data-testid="tracker-add-text"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<span class="text-2xs uppercase tracking-wide text-muted-foreground">War-room items</span>
				<div class="flex flex-wrap items-center gap-2">
					<select
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
						bind:value={type}
						aria-label="Item type"
						disabled={busy}
					>
						{#each TYPES as t (t)}
							<option value={t}>{TRACKER_ITEM_TYPE_LABEL[t]}s</option>
						{/each}
					</select>
					<Input
						class="h-8 max-w-xs text-xs"
						placeholder="Filter…"
						bind:value={q}
						aria-label="Filter the items"
					/>
					{#if picked.size}
						<span class="text-2xs text-muted-foreground">{picked.size} picked</span>
					{/if}
				</div>
				<div class="max-h-64 overflow-y-auto rounded-md border">
					{#if loading}
						<div class="flex justify-center py-6">
							<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
						</div>
					{:else if shown.length === 0}
						<p class="py-6 text-center text-xs text-muted-foreground">Nothing to pick.</p>
					{:else}
						<ul class="divide-y">
							{#each shown as c (c.key)}
								{@const count = itemCounts.get(c.key) ?? 0}
								<li>
									<label
										class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50"
									>
										<input
											type="checkbox"
											class="h-3.5 w-3.5 accent-primary"
											checked={picked.has(c.key)}
											disabled={busy}
											onchange={() => togglePick(c)}
											data-testid="tracker-add-candidate"
										/>
										<span class="min-w-0 flex-1 truncate">{c.label}</span>
										<span class="shrink-0 truncate text-2xs text-muted-foreground">{c.hint}</span>
										{#if count}
											<span
												class="shrink-0 rounded border px-1 text-2xs text-muted-foreground"
												title="Already in the tracker: adding it again creates one more row"
												data-testid="tracker-add-candidate-count"
											>
												in tracker{count > 1 ? ` ×${count}` : ''}
											</span>
										{/if}
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if truncated || shown.length === SHOWN}
					<p class="text-2xs text-muted-foreground">Only part of the list is shown: filter it.</p>
				{/if}
			</div>

			{#if offered.length}
				<div class="flex flex-col gap-1.5">
					<span class="text-2xs uppercase tracking-wide text-muted-foreground">
						Initial steps
					</span>
					<div class="flex flex-wrap gap-1.5">
						{#each offered as s (s.id)}
							<button
								type="button"
								role="checkbox"
								aria-checked={stepIds.includes(s.id)}
								aria-label={s.name}
								onclick={() => toggleStep(s.id)}
								disabled={busy}
							>
								<TrackerStepChip step={s} size="sm" muted={!stepIds.includes(s.id)} />
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<label
					for="tracker-add-note"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Note
				</label>
				<Input id="tracker-add-note" bind:value={note} disabled={busy} />
			</div>
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={total === 0 || busy} data-testid="tracker-add-submit">
				{busy ? 'Adding…' : total ? `Add ${total} ${total === 1 ? 'row' : 'rows'}` : 'Add'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
