<!--
  Kanban ("triage queue") view of the alerts page.

  Two mutually exclusive layouts, because the two questions an analyst
  asks of a queue need different axes:

    * `severity` — the *unassigned* backlog, one column per severity.
      "What is waiting for someone, and how badly?" Dragging a card
      re-rates the alert.
    * `status`   — the *assigned* work, one column per alert status.
      "What is in flight, and where is it stuck?" Dragging a card moves
      it along the workflow.

  Alerts in a terminal status (Closed / Merged / Escalated) never appear
  in either layout — they are finished work and would only pad the
  columns. That exclusion is pushed to the server as a `not_in` custom
  condition so the pagination totals stay honest, rather than filtered
  out client-side after the fact.

  The board reuses the page's currently applied filters (customer, tags,
  dates, …) with one deliberate exception: it owns the owner scope,
  since "unassigned" vs "assigned" *is* the layout choice. In `status`
  mode a page filter naming a specific user is still honoured, so
  "Owner = me" + board gives the classic "my queue".

  Board data is fetched here rather than reusing the list view's page of
  alerts: a board showing the first 25 of 400 alerts reads as "this is
  the whole queue", which is worse than being slow. It pages eagerly up
  to MAX_ITEMS and says so when it hits the ceiling.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { UserPlusIcon } from 'lucide-svelte';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Paginated } from '$lib/services/api.service';
	import { AlertService, type FilterAlertsParams } from '$lib/services/alerts.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import type { Severity } from '$lib/services/severities.service';
	import { current_user } from '$lib/stores/auth.store';
	import { toApiDate } from '$lib/utils';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	// The board component lives under `common/tasks/` because case tasks
	// were its first caller, but it is model-agnostic (accessors + a card
	// snippet) and is shared as-is here.
	import TaskKanbanBoard from '$lib/components/common/tasks/TaskKanbanBoard.svelte';
	import type { KanbanColumn } from '$lib/components/common/tasks/kanban-types';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import AlertDetailDialog from '../alert-detail-dialog.svelte';
	import type { Filters } from '../AlertFilters';
	import {
		SEVERITY_COLOR,
		SEVERITY_RANK,
		STATUS_COLOR,
		STATUS_RANK,
		UNASSIGNED_OWNER_ID,
		isTerminalStatusName,
		rankOf,
		type AlertBoardGroup
	} from './board-config';

	type Props = {
		filters: Filters;
		group: AlertBoardGroup;
		severities: Severity[];
		alertStatuses: AlertStatus[];
		/** Bump to force a refetch — wired to the page's Refresh button. */
		refreshKey?: number;
		/** Bubbled up so the page can keep its "N Alerts" heading honest. */
		onCountChange?: (count: number) => void;
	};

	let {
		filters,
		group,
		severities,
		alertStatuses,
		refreshKey = 0,
		onCountChange
	}: Props = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	// Page size for the eager load, and the ceiling past which the board
	// stops asking for more. A deployment with tens of thousands of open
	// alerts should not be able to wedge the tab on a view switch.
	const PER_PAGE = 200;
	const MAX_ITEMS = 1000;

	/** Placeholder columns shown while the first page is in flight. */
	const SKELETON_COLUMNS = [0, 1, 2, 3];

	let items = $state<Alert[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Guards against an out-of-order response overwriting a newer one
	// when the user flips grouping (or edits filters) mid-flight.
	let requestSeq = 0;

	const terminalStatusIds = $derived(
		alertStatuses.filter((s) => isTerminalStatusName(s.status_name)).map((s) => s.status_id)
	);

	/**
	 * Parse the page's own custom-condition tree so it can be AND-ed with
	 * the board's. Malformed JSON is dropped rather than forwarded: the
	 * backend would reject the whole request and the board would show
	 * nothing, which reads as "no alerts" instead of "bad filter".
	 */
	const parsePageConditions = (raw: string | undefined): unknown | null => {
		if (!raw || raw.trim() === '') return null;

		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	};

	/**
	 * Compose the page filters with the board's own scope. Returns `null`
	 * while the status lookup is still loading — without it the terminal
	 * statuses cannot be excluded, and a board that briefly shows closed
	 * alerts is worse than one that waits a tick.
	 */
	const boardParams = $derived.by<FilterAlertsParams | null>(() => {
		if (alertStatuses.length === 0) return null;

		const params: FilterAlertsParams = {
			...filters,
			alert_start_date: toApiDate(filters.alert_start_date),
			alert_end_date: toApiDate(filters.alert_end_date, true),
			creation_start_date: toApiDate(filters.creation_start_date),
			creation_end_date: toApiDate(filters.creation_end_date, true),
			per_page: PER_PAGE
		};

		// Owner scope belongs to the board, not to the filter panel — see
		// the header comment. `status` mode keeps a page filter that names
		// a real user so "Owner = me" narrows the board to my own queue;
		// anything else (unset, or the "unassigned" sentinel, which would
		// contradict the layout) falls through to "has any owner".
		if (group === 'severity') {
			params.alert_owner_id = UNASSIGNED_OWNER_ID;
		} else if (params.alert_owner_id == null || params.alert_owner_id <= 0) {
			params.alert_owner_id = undefined;
		}

		const conditions: unknown[] = [];

		const pageConditions = parsePageConditions(filters.custom_conditions);
		if (pageConditions) conditions.push(pageConditions);

		if (terminalStatusIds.length > 0) {
			conditions.push({
				field: 'alert_status_id',
				operator: 'not_in',
				value: terminalStatusIds
			});
		}

		// `neq null` compiles to `alert_owner_id IS NOT NULL`, which is the
		// complement of the `-1` sentinel the search helper understands.
		if (group === 'status' && params.alert_owner_id == null) {
			conditions.push({ field: 'alert_owner_id', operator: 'neq', value: null });
		}

		params.custom_conditions =
			conditions.length > 0 ? JSON.stringify({ logic: 'and', conditions }) : undefined;

		return params;
	});

	const load = async (params: FilterAlertsParams) => {
		const seq = ++requestSeq;

		loading = true;
		loadError = null;

		try {
			const collected: Alert[] = [];
			let pageNumber = 1;
			let reportedTotal = 0;

			for (;;) {
				const response = await alerts.listPaginated({ ...params, page: pageNumber });

				// A newer request landed while this one was in flight; drop
				// everything collected so far rather than racing it.
				if (seq !== requestSeq) return;

				if (!response.ok || response.error) {
					loadError = response.error?.message ?? 'Failed to load alerts';
					return;
				}

				const body = response.data as Paginated<Alert> | null;
				const rows = Array.isArray(body?.data) ? body.data : [];

				collected.push(...rows);
				reportedTotal = typeof body?.total === 'number' ? body.total : collected.length;

				if (rows.length === 0 || body?.next_page == null) break;
				if (collected.length >= MAX_ITEMS) break;

				pageNumber += 1;
			}

			items = collected;
			total = reportedTotal;
			onCountChange?.(reportedTotal);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	};

	const reload = () => {
		const params = boardParams;
		if (params) void load(params);
	};

	// Re-fetch whenever the composed query changes — grouping switch,
	// filter apply, the status lookup finishing its own load, or the
	// page's Refresh button bumping `refreshKey`.
	$effect(() => {
		const params = boardParams;
		// Read unconditionally so the dependency is registered even on
		// the early return below.
		void refreshKey;

		if (!params) return;

		void load(params);
	});

	const columns = $derived.by<KanbanColumn[]>(() => {
		if (group === 'severity') {
			return [...severities]
				.sort(
					(a, b) =>
						rankOf(SEVERITY_RANK, a.severity_name) - rankOf(SEVERITY_RANK, b.severity_name) ||
						a.severity_id - b.severity_id
				)
				.map((s) => ({
					id: s.severity_id,
					title: s.severity_name,
					bscolor: SEVERITY_COLOR[s.severity_name.toLowerCase().trim()] ?? null
				}));
		}

		return alertStatuses
			.filter((s) => !isTerminalStatusName(s.status_name))
			.sort(
				(a, b) =>
					rankOf(STATUS_RANK, a.status_name) - rankOf(STATUS_RANK, b.status_name) ||
					a.status_id - b.status_id
			)
			.map((s) => ({
				id: s.status_id,
				title: s.status_name,
				bscolor: STATUS_COLOR[s.status_name.toLowerCase().trim()] ?? null
			}));
	});

	const columnIdOf = (alert: Alert): number | null =>
		group === 'severity' ? (alert.alert_severity_id ?? null) : (alert.alert_status_id ?? null);

	/**
	 * Persist a drag.
	 *
	 * Goes straight through the service rather than `alerts.patch`: on
	 * failure `patch` refetches and returns the optimistically-merged
	 * row, so a rejected move would be indistinguishable from an applied
	 * one. A drag needs an unambiguous answer.
	 */
	const moveAlert = async (alert: Alert, columnId: number | null) => {
		// Both lookups are non-nullable on the model, so the board never
		// renders a null column and this can only be a real id.
		if (columnId === null) return;

		const body =
			group === 'severity' ? { alert_severity_id: columnId } : { alert_status_id: columnId };

		const response = await AlertService.update(alert.alert_id, body);

		if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
			applyUpdated(response.data);
			return;
		}

		toast({
			title: group === 'severity' ? 'Could not change severity' : 'Could not change status',
			description: response.error?.message ?? 'The change was not saved.',
			variant: 'destructive'
		});
	};

	/**
	 * Fold a server-confirmed alert back into the board. An alert that no
	 * longer matches the board's scope (assigned away from the unassigned
	 * backlog, moved into a terminal status) is dropped instead of kept —
	 * leaving it would show a card in a column the board has no room for.
	 */
	const applyUpdated = (updated: Alert) => {
		const stillInScope =
			!isTerminalStatusName(updated.status?.status_name) &&
			(group === 'severity' ? updated.alert_owner_id == null : updated.alert_owner_id != null);

		if (!stillInScope) {
			items = items.filter((a) => a.alert_id !== updated.alert_id);
			total = Math.max(0, total - 1);
			onCountChange?.(total);
			return;
		}

		items = items.map((a) => (a.alert_id === updated.alert_id ? updated : a));
	};

	const assignToMe = async (alert: Alert) => {
		const ownerId = $current_user?.id;
		if (ownerId == null) return;

		const response = await AlertService.update(alert.alert_id, { alert_owner_id: ownerId });

		if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
			applyUpdated(response.data);
			return;
		}

		toast({
			title: 'Could not assign alert',
			description: response.error?.message ?? 'The assignment was not saved.',
			variant: 'destructive'
		});
	};

	/**
	 * Opening a card is a read, not a departure: navigating to
	 * `/alerts/{id}` would throw away the column layout, the eagerly
	 * paged queue behind it and the analyst's place in it. The modal
	 * shows the very same detail card the dedicated page does.
	 */
	const openAlert = (alert: Alert) => {
		detailAlertId = alert.alert_id;
		detailOpen = true;
	};

	let detailAlertId = $state<number | null>(null);
	let detailOpen = $state(false);

	const forgetAlert = (alertId: number) => {
		if (!items.some((a) => a.alert_id === alertId)) return;

		items = items.filter((a) => a.alert_id !== alertId);
		total = Math.max(0, total - 1);
		onCountChange?.(total);
	};

	const tagList = (alert: Alert): string[] =>
		(alert.alert_tags ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);

	const eventTime = (alert: Alert): string => {
		const raw = alert.alert_source_event_time ?? alert.alert_creation_time;
		if (!raw) return '';

		const parsed = new Date(raw);
		return Number.isNaN(parsed.getTime()) ? '' : mediumDateTimeFormatter(parsed);
	};

	const truncated = $derived(items.length < total);

	// The page loads its lookups one after another, so there is a window
	// where the statuses have landed but the severities have not. Without
	// this the board would flash "no severities are configured" at an
	// analyst whose severities are merely one await away.
	const lookupsPending = $derived(
		alertStatuses.length === 0 || (group === 'severity' && severities.length === 0)
	);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
	{#if lookupsPending || (loading && items.length === 0)}
		<div class="flex min-h-0 flex-1 gap-4">
			{#each SKELETON_COLUMNS as index (index)}
				<Skeleton class="h-full min-w-56 flex-1 basis-0 rounded-lg" />
			{/each}
		</div>
	{:else if loadError}
		<div class="flex flex-1 flex-col items-center justify-center gap-3">
			<p class="text-sm text-muted-foreground">{loadError}</p>
			<Button variant="outline" size="xs" onclick={reload}>Retry</Button>
		</div>
	{:else if columns.length === 0}
		<p class="p-4 text-sm text-muted-foreground">
			{group === 'severity'
				? 'No severities are configured, so there is nothing to lay the board out by.'
				: 'Every configured alert status is a terminal one, so the board has no column to show.'}
		</p>
	{:else}
		<div class="min-h-0 flex-1" class:opacity-60={loading}>
			<TaskKanbanBoard
				{columns}
				{items}
				idOf={(alert) => alert.alert_id}
				{columnIdOf}
				onMove={moveAlert}
				onActivate={openAlert}
				card={alertCard}
				itemLabel="Alert"
				emptyLabel="No alerts"
				layout="fill"
			/>
		</div>

		<p class="shrink-0 text-xs text-muted-foreground">
			{items.length}
			{items.length === 1 ? 'alert' : 'alerts'}{truncated
				? ` of ${total} (capped at ${MAX_ITEMS} — narrow the filters to see the rest)`
				: ''}
			· Closed, merged and escalated alerts are never shown · Drag a card to another column to change
			its {group === 'severity' ? 'severity' : 'status'}, or focus one and press Ctrl/⌘ + ← →.
		</p>
	{/if}
</div>

{#snippet alertCard(alert: Alert)}
	<p class="line-clamp-2 text-sm font-medium leading-snug">{alert.alert_title}</p>

	<div class="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
		<span>#{alert.alert_id}</span>
		{#if alert.alert_source}
			<span aria-hidden="true">·</span>
			<span class="truncate">{alert.alert_source}</span>
		{/if}
		{#if eventTime(alert)}
			<span aria-hidden="true">·</span>
			<span>{eventTime(alert)}</span>
		{/if}
	</div>

	{#if tagList(alert).length}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each tagList(alert).slice(0, 4) as tag (tag)}
				<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
			{/each}
			{#if tagList(alert).length > 4}
				<span class="py-0.5 text-xs text-muted-foreground">+{tagList(alert).length - 4}</span>
			{/if}
		</div>
	{/if}

	<div class="mt-2.5 flex items-center justify-between gap-2">
		<!--
		  Show the axis the columns *don't* already encode: on the
		  severity board the column is the severity, so the useful extra
		  is where the alert sits in the workflow, and vice versa.
		-->
		<span class="min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
			{group === 'severity'
				? (alert.status?.status_name ?? 'Unspecified')
				: (alert.severity?.severity_name ?? 'Unspecified')}
		</span>

		{#if group === 'severity'}
			<!--
			  The unassigned board's only exit: without this the analyst
			  has to open each alert to pick it up. `stopPropagation`
			  keeps the click off the card's own "open alert" handler.
			-->
			<Button
				variant="outline"
				size="xs"
				class="h-7 shrink-0 px-2 text-xs"
				title="Assign this alert to me"
				onclick={(e) => {
					e.stopPropagation();
					void assignToMe(alert);
				}}
			>
				<UserPlusIcon class="mr-1 h-3.5 w-3.5" />
				Take
			</Button>
		{:else if alert.owner}
			<UserAvatar
				userId={alert.alert_owner_id ?? null}
				name={alert.owner.user_name ?? alert.owner.user_login ?? ''}
				size="size-7"
				class="shrink-0"
				title={`Owner: ${alert.owner.user_name ?? alert.owner.user_login ?? ''}`}
			/>
		{/if}
	</div>
{/snippet}

<AlertDetailDialog
	bind:open={detailOpen}
	alertId={detailAlertId}
	{alertStatuses}
	onUpdated={applyUpdated}
	onDeleted={forgetAlert}
/>
