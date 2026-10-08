<!--
  Flags row of the asset Details tab, right under the fact strip: the
  status facts the asset carries (Isolated, Patched, Can't be patched…),
  set and removed one by one in any order. One line when nothing is
  being edited — the set flags as chips (click to update, × to remove),
  "Flag" to add one, the change count to unfold the history. Every
  change adds or updates an event on the case "Asset status" timeline;
  the same flags drive the war-room Board.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { ChevronRightIcon, GavelIcon, HistoryIcon, PlusIcon, XIcon } from 'lucide-svelte';
	import type { Asset } from '$lib/types/resources/asset';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import {
		ASSET_STATUS_TIMELINE_NAME,
		AssetFlagsService,
		assetFlagChipClass,
		assetFlagDotClass,
		type AssetFlag,
		type AssetFlagHistoryEntry,
		type CaseAssetFlag
	} from '$lib/services/asset-flags.service';
	import { assetFlags, loadAssetFlags } from '$lib/stores/asset-flags.store.svelte';
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import { getAssetFlagIcon } from '$lib/components/common/assets/asset-flag-icon';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		FLAG_REASON_MAX,
		applyAssetFlag,
		buildFlagChange,
		flagNeedsInput,
		validateFlagInput,
		type FlagApplyAction
	} from '../flag-helpers';

	let { asset }: { asset: Asset } = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);
	const caseId = $derived(Number(page.params.case_id));

	const flags = $derived(assetFlags.items);
	const setById = $derived(new Map((asset.flags ?? []).map((entry) => [entry.flag_id, entry])));
	// Set flags in taxonomy order, with the taxonomy entry (fresh colour /
	// icon) preferred over the nested dump.
	const setFlags = $derived.by(() => {
		const order = new Map(flags.map((flag, index) => [flag.id, index]));
		return (asset.flags ?? [])
			.map((entry) => ({ entry, flag: flags.find((f) => f.id === entry.flag_id) ?? entry.flag }))
			.filter((row): row is { entry: CaseAssetFlag; flag: AssetFlag } => !!row.flag)
			.sort((a, b) => (order.get(a.flag.id) ?? 0) - (order.get(b.flag.id) ?? 0));
	});
	const unsetFlags = $derived(flags.filter((flag) => !setById.has(flag.id)));
	// Reasons and decisions are the part a chip cannot carry: listed under
	// the row, one short line each, only for the flags that have one.
	const annotated = $derived(setFlags.filter((row) => row.entry.reason || row.entry.decision_id));
	// Re-fetch the history whenever the set of flags or their details move.
	const flagsSignature = $derived(
		(asset.flags ?? [])
			.map((entry) => `${entry.flag_id}:${entry.set_at}:${entry.reason}:${entry.decision_id}`)
			.join('|')
	);

	let busy = $state(false);
	// The flag the inline form is open for: `set` adds it, `edit` updates
	// (or removes) a flag the asset already carries.
	let pending = $state<{ flag: AssetFlag; mode: 'set' | 'edit' } | null>(null);
	let reason = $state('');
	let decisionId = $state('');
	let eventDate = $state('');
	let formError = $state<string | null>(null);

	let history = $state<AssetFlagHistoryEntry[]>([]);
	let historyOpen = $state(false);

	$effect(() => {
		void loadAssetFlags();
	});

	const loadHistory = async (assetId: number) => {
		if (!Number.isFinite(caseId)) return;
		const res = await AssetFlagsService.history(caseId, assetId);
		if (asset.asset_id !== assetId) return;
		history = res.ok && Array.isArray(res.data) ? res.data : [];
	};

	$effect(() => {
		const id = asset.asset_id;
		void flagsSignature;
		void loadHistory(id);
	});

	// Drop a half-filled form when switching asset.
	$effect(() => {
		void asset.asset_id;
		pending = null;
		formError = null;
	});

	const apply = async (flag: AssetFlag, action: FlagApplyAction, fromForm = false) => {
		busy = true;
		try {
			const body = fromForm ? buildFlagChange(reason, decisionId, eventDate, action) : {};
			const result = await applyAssetFlag(
				caseAssets,
				caseId,
				[asset.asset_id],
				flag.id,
				action,
				body
			);
			if (result.failed.length) {
				const message = result.failed[0]?.message ?? 'Unable to change the flag';
				if (fromForm) {
					formError = message;
				} else {
					toast({ title: 'Flag not changed', description: message, variant: 'destructive' });
				}
				return;
			}
			pending = null;
			toast({
				title: action === 'clear' ? `${flag.name} removed` : `${flag.name} set`,
				variant: 'success'
			});
		} finally {
			busy = false;
		}
	};

	const openForm = (flag: AssetFlag, mode: 'set' | 'edit') => {
		const current = setById.get(flag.id);
		pending = { flag, mode };
		reason = current?.reason ?? '';
		decisionId =
			current?.decision_id !== null && current?.decision_id !== undefined
				? String(current.decision_id)
				: '';
		eventDate = '';
		formError = null;
	};

	// From the "Flag" menu: straight on unless the flag needs a reason or
	// a decision, in which case the form collects them first.
	const add = (flag: AssetFlag) => {
		if (!canEdit || busy) return;
		if (flagNeedsInput(flag)) {
			openForm(flag, 'set');
			return;
		}
		pending = null;
		void apply(flag, 'set');
	};

	const remove = (flag: AssetFlag) => {
		if (!canEdit || busy) return;
		pending = null;
		void apply(flag, 'clear');
	};

	const submit = (action: FlagApplyAction) => {
		if (!pending) return;
		formError = validateFlagInput(pending.flag, reason, decisionId, eventDate, action);
		if (formError) return;
		void apply(pending.flag, action, true);
	};

	const flagOf = (entry: AssetFlagHistoryEntry) =>
		(entry.flag_id !== null ? flags.find((f) => f.id === entry.flag_id) : null) ?? {
			name: entry.flag_name,
			color: 'slate',
			icon: null
		};

	const ACTION_LABELS: Record<AssetFlagHistoryEntry['action'], string> = {
		set: 'Set',
		updated: 'Updated',
		cleared: 'Removed'
	};

	const formatWhen = (value: string | null | undefined) => (value ? formatDateTime(value) : '');

	const chipTitle = (row: { entry: CaseAssetFlag; flag: AssetFlag }) =>
		[
			row.flag.description || row.flag.name,
			row.entry.set_at ? `Set ${formatWhen(row.entry.set_at)}` : '',
			row.entry.reason ?? '',
			row.entry.decision_id ? `Decision #${row.entry.decision_id}` : '',
			canEdit ? 'Click to update' : ''
		]
			.filter(Boolean)
			.join('\n');
</script>

<section class="px-3.5 pb-2 pt-0.5" aria-label="Status flags" data-testid="asset-flags">
	<div class="flex flex-wrap items-center gap-1.5">
		<span
			class="mr-1 text-2xs uppercase tracking-wide text-muted-foreground"
			title={`Each change is recorded on the ${ASSET_STATUS_TIMELINE_NAME} timeline`}
		>
			Flags
		</span>

		{#each setFlags as row (row.flag.id)}
			{@const Icon = getAssetFlagIcon(row.flag.icon)}
			<span
				class="inline-flex h-6 items-center overflow-hidden rounded-md border text-xs font-medium {assetFlagChipClass(
					row.flag.color
				)} {pending?.flag.id === row.flag.id ? 'ring-2 ring-ring/30' : ''}"
				data-testid="asset-flag-set"
				data-flag={row.flag.name}
			>
				<button
					type="button"
					class="inline-flex h-full items-center gap-1 pl-2 {canEdit
						? 'pr-1 hover:brightness-95'
						: 'cursor-default pr-2'}"
					title={chipTitle(row)}
					aria-label={canEdit ? `Update ${row.flag.name}` : row.flag.name}
					disabled={!canEdit || busy}
					onclick={() => openForm(row.flag, 'edit')}
				>
					<Icon class="h-3.5 w-3.5" aria-hidden="true" />
					{row.flag.name}
					{#if row.entry.decision_id}
						<GavelIcon class="h-3 w-3 opacity-70" aria-label="Linked to a decision" />
					{/if}
				</button>
				{#if canEdit}
					<button
						type="button"
						class="inline-flex h-full items-center px-1 opacity-60 hover:opacity-100 disabled:opacity-30"
						aria-label={`Remove ${row.flag.name}`}
						title={`Remove ${row.flag.name}`}
						disabled={busy}
						onclick={() => remove(row.flag)}
					>
						<XIcon class="h-3 w-3" aria-hidden="true" />
					</button>
				{/if}
			</span>
		{:else}
			{#if assetFlags.loaded}
				<span class="text-xs text-muted-foreground" data-testid="asset-flags-none">None</span>
			{/if}
		{/each}

		{#if canEdit && unsetFlags.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-6 items-center gap-1 rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
					disabled={busy}
					data-testid="asset-flag-add"
				>
					<PlusIcon class="h-3 w-3" aria-hidden="true" />
					Flag
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-64">
					{#each unsetFlags as flag (flag.id)}
						{@const Icon = getAssetFlagIcon(flag.icon)}
						<DropdownMenu.Item class="items-start gap-2" onclick={() => add(flag)}>
							<Icon class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="text-xs font-medium">{flag.name}</span>
								{#if flag.description}
									<span class="line-clamp-2 text-2xs text-muted-foreground">
										{flag.description}
									</span>
								{/if}
							</span>
							{#if flag.requires_decision}
								<GavelIcon
									class="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
									aria-label="Requires a decision"
								/>
							{/if}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}

		{#if history.length}
			<button
				type="button"
				class="ml-auto inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
				aria-expanded={historyOpen}
				aria-controls="asset-flag-history"
				title={`Flag changes, also on the ${ASSET_STATUS_TIMELINE_NAME} timeline`}
				data-testid="asset-flag-history-toggle"
				onclick={() => (historyOpen = !historyOpen)}
			>
				<HistoryIcon class="h-3 w-3" aria-hidden="true" />
				{history.length}
				{history.length === 1 ? 'change' : 'changes'}
				<ChevronRightIcon
					class="h-3 w-3 transition-transform {historyOpen ? 'rotate-90' : ''}"
					aria-hidden="true"
				/>
			</button>
		{/if}
	</div>

	{#if annotated.length && !pending}
		<ul class="mt-1 flex flex-col gap-0.5 pl-[2.6rem] text-2xs text-muted-foreground">
			{#each annotated as row (row.flag.id)}
				<li class="truncate" title={row.entry.reason ?? undefined}>
					<span class="font-medium text-foreground/80">{row.flag.name}</span>
					{#if row.entry.reason}— {row.entry.reason}{/if}
					{#if row.entry.decision_id}
						· decision #{row.entry.decision_id}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if pending}
		{@const editing = pending.mode === 'edit'}
		<form
			class="mt-2 flex flex-col gap-2 rounded-md border bg-muted/20 p-3"
			onsubmit={(e) => {
				e.preventDefault();
				submit('set');
			}}
			aria-label={`${editing ? 'Update' : 'Set'} ${pending.flag.name}`}
			data-testid="asset-flag-form"
		>
			<div class="flex items-center gap-2 text-xs">
				{editing ? 'Update' : 'Set'}
				<AssetFlagChip flag={pending.flag} />
				{#if pending.flag.description}
					<span class="truncate text-2xs text-muted-foreground">{pending.flag.description}</span>
				{/if}
			</div>
			<div class="flex flex-col gap-1">
				<label
					for="asset-flag-reason"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Reason{pending.flag.requires_reason ? ' *' : ' (optional)'}
				</label>
				<Textarea
					id="asset-flag-reason"
					rows={2}
					maxlength={FLAG_REASON_MAX}
					bind:value={reason}
					placeholder="Context for the timeline event"
					disabled={busy}
				/>
			</div>
			<div class="flex flex-wrap gap-3">
				<div class="flex flex-col gap-1">
					<label
						for="asset-flag-decision"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Decision ID{pending.flag.requires_decision ? ' *' : ' (optional)'}
					</label>
					<Input
						id="asset-flag-decision"
						inputmode="numeric"
						class="h-8 w-40 text-xs"
						bind:value={decisionId}
						placeholder="e.g. 12"
						disabled={busy}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label
						for="asset-flag-date"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Event date (optional)
					</label>
					<Input
						id="asset-flag-date"
						type="datetime-local"
						class="h-8 w-52 text-xs"
						bind:value={eventDate}
						title="When it happened; now when left empty"
						disabled={busy}
					/>
				</div>
			</div>
			{#if formError}
				<p class="text-2xs text-destructive" role="alert">{formError}</p>
			{/if}
			<div class="flex items-center justify-end gap-1.5">
				{#if editing}
					<Button
						type="button"
						variant="ghost"
						size="xs"
						class="mr-auto text-destructive hover:text-destructive"
						disabled={busy}
						data-testid="asset-flag-remove"
						onclick={() => submit('clear')}
					>
						<XIcon size={12} class="mr-0.5" />
						Remove flag
					</Button>
				{/if}
				<Button
					type="button"
					variant="outline"
					size="xs"
					disabled={busy}
					onclick={() => {
						pending = null;
						formError = null;
					}}
				>
					Cancel
				</Button>
				<Button type="submit" size="xs" disabled={busy}>
					{busy ? 'Saving…' : editing ? 'Update' : 'Set flag'}
				</Button>
			</div>
		</form>
	{/if}

	{#if historyOpen && history.length > 0}
		<ol
			id="asset-flag-history"
			class="relative ml-1 mt-2 border-l border-border/60 pl-4"
			data-testid="asset-flag-history"
		>
			{#each history as entry (entry.id)}
				{@const flag = flagOf(entry)}
				<li class="relative pb-2 last:pb-0">
					<span
						class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background {entry.action ===
						'cleared'
							? 'bg-muted-foreground/40'
							: assetFlagDotClass(flag.color)}"
					></span>
					<div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
						<span>{ACTION_LABELS[entry.action] ?? entry.action}</span>
						<AssetFlagChip {flag} />
						{#if entry.changed_by_name}
							<span class="text-muted-foreground">by {entry.changed_by_name}</span>
						{/if}
						{#if entry.war_room_id && entry.war_room_name}
							<a
								href={`/war-rooms/${entry.war_room_id}`}
								class="text-muted-foreground underline-offset-2 hover:underline"
							>
								via {entry.war_room_name}
							</a>
						{/if}
						{#if entry.decision_number}
							<span class="inline-flex items-center gap-0.5 text-muted-foreground">
								<GavelIcon class="h-3 w-3" aria-hidden="true" />D-{entry.decision_number}
							</span>
						{/if}
						<span class="ml-auto text-2xs text-muted-foreground">
							{formatWhen(entry.changed_at)}
						</span>
					</div>
					{#if entry.reason}
						<p class="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
							{entry.reason}
						</p>
					{/if}
				</li>
			{/each}
			<li class="pt-1 text-2xs text-muted-foreground">
				Also on the
				<a href={`/case/${caseId}/timeline`} class="underline-offset-2 hover:underline">
					{ASSET_STATUS_TIMELINE_NAME}
				</a>
				timeline.
			</li>
		</ol>
	{/if}
</section>
