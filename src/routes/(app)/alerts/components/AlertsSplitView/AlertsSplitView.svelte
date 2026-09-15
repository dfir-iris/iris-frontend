<script lang="ts">
	/**
	 * Split triage cockpit — the central workspace of design 1a.
	 *
	 * A 640px queue on the left, a detail pane on the right, and the
	 * detail never costs you your place in the queue: j/k walk the list,
	 * `e` escalates, `m` merges, `x` selects. The page keeps ownership of
	 * the toolbar above (filters, saved views, sort) and of every dialog;
	 * this component is only the two panes.
	 *
	 * Styling deliberately mirrors the mockup's own custom-property
	 * palette rather than reaching for the app's semantic tokens. The
	 * cockpit is a dense, colour-coded surface whose severity / status /
	 * age accents have to agree across three regions at once, and the
	 * mockup's scale is the thing being reproduced. The tokens are scoped
	 * to `.iris-triage` so nothing leaks into the rest of the app.
	 */
	import { getContext, onMount } from 'svelte';
	import type { Alert } from '$lib/types/resources/alert';
	import type { AlertCluster } from '$lib/types/resources/alert-cluster';
	import type { AlertQueueUnit } from '$lib/types/resources/alert-queue-unit';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { AlertClustersService } from '$lib/services/alert-clusters.service';
	import type { UpdateAlertAssetBody, UpdateAlertIocBody } from '$lib/services/alerts.service';
	import type { HookOption } from '$lib/services/hooks.service';
	import { alertHooks } from '$lib/stores/alert-hooks.store.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { callAlertHook } from '$lib/utils/hooks';
	import EnrichmentDialog from '$lib/components/common/EnrichmentDialog.svelte';
	import { CommentsThread } from '$lib/components/common/Comments';
	import InvestigationFlowSteps from '$lib/components/common/InvestigationFlow/InvestigationFlowSteps.svelte';
	import AlertRelatedGraph from '../AlertRelatedGraph/AlertRelatedGraph.svelte';
	import AlertIocEditDialog from '../alert-ioc-edit-dialog.svelte';
	import AlertAssetEditDialog from '../alert-asset-edit-dialog.svelte';
	import { hasChanges, saveAlertAsset, saveAlertIoc } from '../../helpers/alert-observables';
	import { clusterSelectionState, flattenAlertQueueUnits } from '$lib/utils/alert-queue';
	import {
		ALERT_QUEUE_COLUMNS,
		alertSortArrow,
		type AlertSortColumn,
		type AlertSortState
	} from '../../helpers/alert-queue-columns';
	import {
		activityEntries,
		ageLabel,
		ageVar,
		assetLabel,
		clockTime,
		relativeDate,
		formatRawEvent,
		observableFlag,
		primaryTechnique,
		rangeLabel,
		severityVar,
		statusVar,
		techniqueLabels,
		titleVar
	} from './triage-format';

	interface Props {
		class?: string;
		/**
		 * Every alert on the page, flat and de-duplicated. Drives selection
		 * and the bulk actions the parent owns. When `groups` is set this is
		 * the flattening of it, not a second query.
		 */
		alerts: Alert[];
		/**
		 * Queue rows with clustered alerts collapsed into their cluster. When
		 * omitted the queue falls back to one row per alert.
		 */
		groups?: AlertQueueUnit[] | null;
		loading?: boolean;
		total: number;
		page: number;
		perPage: number;
		selected: Record<number, boolean>;
		/** Which column the queue is ordered by, and in which direction. */
		sort: AlertSortState;
		/** Which quick-filter tab is active. `null` = All open (no owner filter). */
		queueTab: 'mine' | 'unassigned' | 'escalated' | null;
		/** Shortcut key hints only; actual counts are from total/tabs */
		queueCounts?: { mine: number; unassigned: number; escalated: number; all: number };
		/**
		 * Optional snippet rendered in the filter bar below the queue tabs.
		 * Pass <AlertFilterLabels ...> from the page so the chip data stays
		 * in the parent without threading all the lookup arrays down here.
		 */
		filterBar?: import('svelte').Snippet;
		/**
		 * Optional snippet rendered above the queue whenever something is
		 * selected. The page passes the same bulk-action buttons the list
		 * view uses, so the two views can never drift apart.
		 */
		selectionBar?: import('svelte').Snippet;
		/** Whether the filter panel is currently open (used to toggle the button label). */
		filterPanelOpen?: boolean;
		/** Called when the user clicks the "+ Filter" button. */
		onOpenFilters?: () => void;
		/** Suspends the keyboard bindings while a dialog or panel owns focus. */
		shortcutsEnabled?: boolean;
		onToggleSort: (column: AlertSortColumn) => void;
		onSelect: (alertId: number, checked: boolean) => void;
		/** Select or clear a whole group of alerts at once — a cluster's members. */
		onSelectMany: (alertIds: number[], checked: boolean) => void;
		onSelectAll: (checked: boolean) => void;
		onAssignToMe: (alert: Alert) => void;
		onAssign: (alert: Alert) => void;
		onEscalate: (alert: Alert) => void;
		onMerge: (alert: Alert) => void;
		onClose: (alert: Alert) => void;
		/**
		 * Optional — the Delete button only appears when the page supplies a
		 * handler AND the user carries `alerts_delete`. The confirmation
		 * dialog is the page's, the same one the list view opens.
		 */
		onDelete?: (alert: Alert) => void;
		/**
		 * Fired after the Comments tab wrote something, so the page can
		 * refresh the alert and keep the tab's count honest.
		 */
		onCommentsChanged?: (alert: Alert) => void;
		onOpenCluster: (clusterId: number) => void;
		onPageChange: (page: number) => void;
		onQueueTabChange: (tab: 'mine' | 'unassigned' | 'escalated' | null) => void;
	}

	const alertsCtx = getContext<AlertsContext>(ALERTS_CTX);
	const userCtx = getContext<UserCtx>(USER_CTX);

	let {
		class: className = '',
		alerts,
		groups = null,
		loading = false,
		total,
		page,
		perPage,
		selected,
		sort,
		queueTab,
		queueCounts,
		filterBar,
		selectionBar,
		filterPanelOpen = false,
		onOpenFilters,
		shortcutsEnabled = true,
		onToggleSort,
		onSelect,
		onSelectMany,
		onSelectAll,
		onAssignToMe,
		onAssign,
		onEscalate,
		onMerge,
		onClose,
		onDelete,
		onCommentsChanged,
		onOpenCluster,
		onPageChange,
		onQueueTabChange
	}: Props = $props();

	type Tab =
		| 'overview'
		| 'flow'
		| 'assets'
		| 'cluster'
		| 'iocs'
		| 'raw'
		| 'timeline'
		| 'notes'
		| 'comments'
		| 'graph';

	// Deleting is destructive and irreversible, so the button is hidden
	// rather than disabled when the user can't do it — same reading the
	// side nav gives a page they have no permission for.
	const canDelete = $derived(onDelete !== undefined && userCtx?.can('alerts_delete') === true);

	let focusedId = $state<number | null>(null);
	// Which pane the small-screen layout is showing. Inert above the stacking
	// breakpoint, where both panes are on screen at once. It can't be derived
	// from `focusedId`: the effect below auto-focuses the first alert, so the
	// detail would open on load and the queue would never be reachable.
	let narrowPane = $state<'queue' | 'detail'>('queue');
	// What the analyst last picked. Read through `activeTab` below, which
	// narrows it to a tab the focused alert actually has.
	let requestedTab = $state<Tab>('overview');
	let rowEls = $state<Record<number, HTMLElement | undefined>>({});
	let showAssignMenu = $state<boolean>(false);
	let showModulesMenu = $state<boolean>(false);

	// Buttons contributed by modules that registered
	// `on_manual_trigger_alert`. Triggering one writes to the alert, so
	// the menu follows the same permission as every other write action
	// here rather than letting the analyst discover a 403 by clicking.
	const canTriggerHooks = $derived(
		alertHooks.options.length > 0 && userCtx?.can('alerts_write') === true
	);

	const triggerHook = async (alert: Alert, hookOption: HookOption) => {
		showModulesMenu = false;
		const result = await callAlertHook([alert.alert_id], hookOption);
		toast({
			title: result.message,
			variant: result.status === 'error' ? 'destructive' : 'success'
		});
	};

	/**
	 * `now` is sampled once on mount and ticked every 30s rather than read
	 * during render: age labels are used in a dozen places and reading
	 * Date.now() inline would make every one of them a fresh value on any
	 * unrelated re-render (and would differ between SSR and hydration).
	 */
	let now = $state(0);
	onMount(() => {
		now = Date.now();
		void alertHooks.load();
		const id = setInterval(() => (now = Date.now()), 30_000);
		const onDocClick = (e: MouseEvent) => {
			// Both header menus close on any click outside *their own*
			// wrapper, so opening one shuts the other.
			const wrap = (e.target as HTMLElement | null)?.closest('.menu-wrap');
			if (wrap?.getAttribute('data-menu') !== 'assign') showAssignMenu = false;
			if (wrap?.getAttribute('data-menu') !== 'modules') showModulesMenu = false;
		};
		document.addEventListener('click', onDocClick, true);
		return () => {
			clearInterval(id);
			document.removeEventListener('click', onDocClick, true);
		};
	});

	// ---- queue rows --------------------------------------------------

	// Which clusters the analyst has folded shut. Expanded is the default:
	// the cluster is the queue entry, but its alerts still have to be
	// walkable with j/k without a click first.
	let collapsedClusters = $state<Record<number, boolean>>({});

	const isClusterOpen = (clusterId: number) => collapsedClusters[clusterId] !== true;

	const toggleCluster = (clusterId: number) => {
		collapsedClusters = { ...collapsedClusters, [clusterId]: isClusterOpen(clusterId) };
	};

	// One code path for both modes: without grouping every alert is its own
	// unit, which is exactly what the ungrouped queue rendered before.
	const queueUnits = $derived<AlertQueueUnit[]>(
		groups ?? alerts.map((alert) => ({ kind: 'alert', alert }))
	);

	// What the keyboard walks: on-screen alerts only, so `j` never lands on
	// a row hidden inside a folded cluster.
	const visibleAlerts = $derived(flattenAlertQueueUnits(queueUnits, isClusterOpen));

	const unitKey = (unit: AlertQueueUnit) =>
		unit.kind === 'cluster' ? `c${unit.cluster.cluster_id}` : `a${unit.alert.alert_id}`;

	// ---- cluster selection -------------------------------------------

	// A cluster's checkbox reflects, and drives, its members: ticked when
	// every member is, a bar while only some are.
	const clusterSelection = (members: Alert[]) => clusterSelectionState(members, selected);

	const toggleClusterSelection = (members: Alert[]) => {
		const checked = clusterSelection(members) !== 'all';
		onSelectMany(
			members.map((member) => member.alert_id),
			checked
		);
	};

	// Drives the selection bar. Counted over the page rather than over
	// `selected`, whose keys can outlive the alerts they came from.
	const selectedCount = $derived(alerts.filter((a) => selected[a.alert_id] === true).length);

	// Keep the cursor on a row that still exists after a refresh / page
	// change, but never yank it off a row the analyst deliberately moved to.
	const focusedIndex = $derived(visibleAlerts.findIndex((a) => a.alert_id === focusedId));
	const focused = $derived(focusedIndex >= 0 ? visibleAlerts[focusedIndex] : undefined);

	$effect(() => {
		if (visibleAlerts.length === 0) {
			focusedId = null;
		} else if (!visibleAlerts.some((a) => a.alert_id === focusedId)) {
			focusedId = visibleAlerts[0].alert_id;
		}
	});

	// ---- cluster context for the focused alert -----------------------

	let cluster = $state<AlertCluster | null>(null);
	let clusterMembers = $state<Alert[]>([]);

	$effect(() => {
		const clusterId = focused?.clusters?.[0];
		if (clusterId === undefined) {
			cluster = null;
			clusterMembers = [];
			return;
		}

		// Guard against a slower earlier request overwriting a newer one
		// when the analyst walks the queue faster than the API answers.
		let stale = false;

		void (async () => {
			const [detail, members] = await Promise.all([
				AlertClustersService.get(clusterId),
				// Via the context rather than AlertService directly: it
				// unwraps the `{status, message, data}` envelope and applies
				// the same normalisation the queue's own alerts went through.
				alertsCtx.listPaginated({ cluster_id: clusterId, per_page: 50, sort: 'asc' })
			]);
			if (stale) return;

			const clusterBody = detail.data;
			cluster = clusterBody && typeof clusterBody !== 'string' ? clusterBody : null;

			const memberBody = members.data;
			clusterMembers =
				memberBody && typeof memberBody !== 'string' && Array.isArray(memberBody.data)
					? memberBody.data
					: [];
		})();

		return () => {
			stale = true;
		};
	});

	const clusterLabel = $derived(
		cluster ? `${cluster.cluster_title} · ${cluster.alert_ids?.length ?? 0} alerts` : ''
	);

	// ---- derived detail data -----------------------------------------

	const iocs = $derived(focused?.iocs ?? []);
	const rawEvent = $derived(formatRawEvent(focused?.alert_source_content));

	// ---- observable details ------------------------------------------

	// The IOC/asset tabs are where an analyst documents what an
	// observable turned out to be, so they carry the same edit and
	// enrichment affordances the card view has.
	let enrichmentOpen = $state(false);
	let enrichmentSubject = $state('');
	let enrichmentValue = $state<unknown>(null);

	let editedIoc = $state<Ioc | null>(null);
	let iocDialogOpen = $state(false);
	let editedAsset = $state<Asset | null>(null);
	let assetDialogOpen = $state(false);
	let savingObservable = $state(false);

	// Suspends j/k/e/m/x while one of these dialogs is up — `isTyping`
	// only covers the fields, not the buttons between them.
	const observableDialogOpen = $derived(enrichmentOpen || iocDialogOpen || assetDialogOpen);

	const showEnrichment = (subject: string, enrichment: unknown) => {
		enrichmentSubject = subject;
		enrichmentValue = enrichment;
		enrichmentOpen = true;
	};

	const editIoc = (ioc: Ioc) => {
		editedIoc = ioc;
		iocDialogOpen = true;
	};

	const closeIocDialog = () => {
		iocDialogOpen = false;
		editedIoc = null;
	};

	const editAsset = (asset: Asset) => {
		editedAsset = asset;
		assetDialogOpen = true;
	};

	const closeAssetDialog = () => {
		assetDialogOpen = false;
		editedAsset = null;
	};

	const saveIoc = async (ioc: Ioc, changes: UpdateAlertIocBody) => {
		if (!focused) return;

		if (!hasChanges(changes)) {
			closeIocDialog();
			return;
		}

		savingObservable = true;

		const updated = await saveAlertIoc(focused, ioc.ioc_id, changes);

		savingObservable = false;

		if (updated) closeIocDialog();
	};

	const saveAsset = async (asset: Asset, changes: UpdateAlertAssetBody) => {
		if (!focused) return;

		if (!hasChanges(changes)) {
			closeAssetDialog();
			return;
		}

		savingObservable = true;

		const updated = await saveAlertAsset(focused, asset.asset_id, changes);

		savingObservable = false;

		if (updated) closeAssetDialog();
	};

	const activity = $derived(activityEntries(focused?.modification_history, 3));
	const techniques = $derived(focused ? techniqueLabels(focused) : []);
	const notes = $derived((focused?.alert_note ?? '').trim());

	// The entity the Comments tab is bound to. Rebuilt whenever the
	// focused alert changes, which is what makes the thread re-fetch.
	const commentsEntity = $derived(
		focused
			? {
					type: 'alerts' as const,
					id: focused.alert_id,
					label: focused.alert_title ?? `Alert #${focused.alert_id}`
				}
			: null
	);

	type TabDef = { id: Tab; label: string; count: number | undefined; dot?: boolean };

	// No checklist, no tab. The alert says whether a flow is attached; the
	// step count behind it would need a round trip per alert, which is not
	// worth paying on every j/k press just to render a tab label.
	const hasInvestigationFlow = $derived(focused?.investigation_flow != null);

	const tabs = $derived<TabDef[]>([
		{ id: 'overview' as Tab, label: 'Overview', count: undefined as number | undefined },
		...(hasInvestigationFlow
			? [{ id: 'flow' as Tab, label: 'Investigation', count: undefined as number | undefined }]
			: []),
		{
			id: 'assets' as Tab,
			label: 'Assets',
			count: (focused?.assets?.length ?? 0) > 0 ? focused?.assets?.length : undefined
		},
		{
			id: 'cluster' as Tab,
			label: 'Cluster',
			count: cluster?.alert_ids?.length,
			dot: cluster != null
		},
		{ id: 'iocs' as Tab, label: 'IOCs', count: iocs.length },
		{ id: 'raw' as Tab, label: 'Raw event', count: undefined },
		{ id: 'timeline' as Tab, label: 'Timeline', count: undefined },
		{ id: 'notes' as Tab, label: 'Notes', count: notes ? 1 : undefined },
		{
			id: 'comments' as Tab,
			label: 'Comments',
			// Undefined rather than 0 so an empty thread reads like the
			// tabs that carry no count at all instead of advertising a zero.
			count: focused?.comments?.length ? focused.comments.length : undefined
		},
		{ id: 'graph' as Tab, label: 'Graph', count: undefined }
	]);

	/**
	 * Walking the queue can pull the open tab out from under the analyst —
	 * `j` onto an alert with no flow while Investigation is up. Derived
	 * rather than corrected in an $effect so the flow pane never gets a
	 * frame to mount (and fire its request) against an alert that has no
	 * checklist; the pick itself survives, so stepping back onto an alert
	 * that does have one puts you straight back on the tab.
	 */
	const activeTab = $derived<Tab>(
		tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview'
	);

	const allSelected = $derived(
		alerts.length > 0 && alerts.every((a) => selected[a.alert_id] === true)
	);

	// ---- keyboard ----------------------------------------------------

	const move = (delta: number) => {
		if (visibleAlerts.length === 0) return;
		const from = focusedIndex >= 0 ? focusedIndex : 0;
		const next = Math.min(visibleAlerts.length - 1, Math.max(0, from + delta));
		focusedId = visibleAlerts[next].alert_id;
		rowEls[focusedId]?.scrollIntoView({ block: 'nearest' });
	};

	/**
	 * Typing in a field must not trigger the single-letter shortcuts. We
	 * check the event target rather than a flag so shortcuts stay live
	 * while focus is on a row, a button, or the document body.
	 */
	const isTyping = (target: EventTarget | null): boolean => {
		const el = target as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		return (
			tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
		);
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (!shortcutsEnabled || observableDialogOpen) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (isTyping(event.target)) return;

		switch (event.key) {
			case 'j':
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'k':
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case 'e':
				if (focused) {
					event.preventDefault();
					onEscalate(focused);
				}
				break;
			case 'm':
				if (focused) {
					event.preventDefault();
					onMerge(focused);
				}
				break;
			case 'x':
				// The mockup's `x` is *select*, not close — it is how you
				// build a multi-alert selection without leaving the keyboard.
				if (focused) {
					event.preventDefault();
					onSelect(focused.alert_id, !selected[focused.alert_id]);
				}
				break;
		}
	};
</script>

<svelte:window on:keydown={onKeydown} />

<!-- Both panes sit side by side on wide screens. Narrow ones show one at a
     time and use `show-detail` to pick which — see the media query. -->
<div
	class="iris-triage {className}"
	class:show-detail={narrowPane === 'detail'}
	role="region"
	aria-label="Alert triage cockpit"
>
	<!-- ============ queue ============ -->
	<div class="queue">
		<!-- Quick-filter tabs: My queue / Unassigned / Escalated / All open -->
		<div class="queue-tabs" role="tablist" aria-label="Alert queue filter">
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === 'mine'}
				aria-selected={queueTab === 'mine'}
				onclick={() => onQueueTabChange('mine')}
			>
				My queue{#if queueCounts?.mine != null}<span class="qtab-count">{queueCounts.mine}</span
					>{/if}
			</button>
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === 'unassigned'}
				aria-selected={queueTab === 'unassigned'}
				onclick={() => onQueueTabChange('unassigned')}
			>
				Unassigned{#if queueCounts?.unassigned != null}<span class="qtab-count"
						>{queueCounts.unassigned}</span
					>{/if}
			</button>
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === 'escalated'}
				aria-selected={queueTab === 'escalated'}
				onclick={() => onQueueTabChange('escalated')}
			>
				Escalated{#if queueCounts?.escalated != null}<span class="qtab-count"
						>{queueCounts.escalated}</span
					>{/if}
			</button>
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === null}
				aria-selected={queueTab === null}
				onclick={() => onQueueTabChange(null)}
			>
				All open{#if queueCounts?.all != null}<span class="qtab-count">{queueCounts.all}</span>{/if}
			</button>
		</div>

		{#if filterBar || onOpenFilters}
			<div class="filter-bar">
				{#if filterBar}{@render filterBar()}{/if}
				{#if onOpenFilters}
					<button
						type="button"
						class="btn-filter-add"
						class:btn-filter-active={filterPanelOpen}
						onclick={onOpenFilters}>{filterPanelOpen ? 'Hide filters ×' : '+ Filter'}</button
					>
				{/if}
			</div>
		{/if}

		<!-- Column headers, the same affordance the case overview queue has:
		     click one to order the whole result set by it, click it again to
		     reverse. Ordering is server-side, so it survives paging. -->
		<div class="queue-head">
			<button
				type="button"
				class="checkbox"
				role="checkbox"
				aria-checked={allSelected}
				aria-label={allSelected ? 'Deselect all alerts' : 'Select all alerts'}
				data-checked={allSelected}
				onclick={() => onSelectAll(!allSelected)}
			></button>
			<div class="queue-cols" role="group" aria-label="Sort alerts">
				{#each ALERT_QUEUE_COLUMNS as col (col.id)}
					{@const arrow = alertSortArrow(sort, col.id)}
					<button
						type="button"
						class="queue-sort {col.cls}"
						class:queue-sort-active={arrow !== ''}
						aria-label="Sort by {col.label}{arrow === ''
							? ''
							: arrow === '▲'
								? ' (ascending)'
								: ' (descending)'}"
						onclick={() => onToggleSort(col.id)}
					>
						<span>{col.label}</span>
						<span class="queue-sort-arrow" aria-hidden="true">{arrow}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if selectionBar && selectedCount > 0}
			<div class="selection-bar">
				<span class="selection-count"
					>{selectedCount} selected{#if allSelected}&nbsp;· whole page{/if}</span
				>
				<button type="button" class="selection-clear" onclick={() => onSelectAll(false)}
					>Clear</button
				>
				<div class="selection-actions">{@render selectionBar()}</div>
			</div>
		{/if}

		<!-- One row per alert, or — when `groups` is set — one row per cluster
		     with its member alerts nested underneath. `queueUnits` papers over
		     the difference so there is a single row template either way. -->
		{#snippet queueRow(alert: Alert, inCluster: boolean)}
			{@const isFocused = alert.alert_id === focusedId}
			{@const sev = severityVar(alert.severity?.severity_name)}
			<div class="row" class:row-focused={isFocused} bind:this={rowEls[alert.alert_id]}>
				<button
					type="button"
					class="checkbox"
					role="checkbox"
					aria-checked={selected[alert.alert_id] === true}
					aria-label="Select alert {alert.alert_id}"
					data-checked={selected[alert.alert_id] === true}
					onclick={() => onSelect(alert.alert_id, !selected[alert.alert_id])}
				></button>

				<button
					type="button"
					class="row-main"
					role="option"
					aria-selected={isFocused}
					onclick={() => {
						focusedId = alert.alert_id;
						narrowPane = 'detail';
					}}
				>
					<span class="sev-bar" style="background:{sev}"></span>

					<span class="row-body">
						<span class="row-meta">
							<span class="row-sev" style="color:{sev}">{alert.severity?.severity_name ?? '—'}</span
							>
							<span class="vrule"></span>
							<span class="row-client">{alert.customer?.customer_name ?? ''}</span>
							<span class="spacer"></span>
							<span class="row-time">{relativeDate(alert.alert_source_event_time, now)}</span>
						</span>

						<span class="row-title" style="color:{titleVar(alert.status?.status_name, isFocused)}"
							>{alert.alert_title}</span
						>

						<span class="row-chips">
							<!-- Inside a cluster the header already says so; only flag
							     the alert when it also belongs to other clusters. -->
							{#if inCluster ? (alert.clusters?.length ?? 0) > 1 : (alert.clusters?.length ?? 0) > 0}
								<span class="chip-cluster">
									<span class="chip-glyph">◈</span>
									<span
										>{alert.clusters.length > 1
											? `${alert.clusters.length} clusters`
											: 'Clustered'}</span
									>
								</span>
							{/if}
							{#if assetLabel(alert.assets)}
								<span class="chip-mono">{assetLabel(alert.assets)}</span>
							{/if}
							{#if primaryTechnique(alert)}
								<span class="chip-mono">{primaryTechnique(alert)}</span>
							{/if}
							<span class="spacer"></span>
							<span class="row-status" style="color:{statusVar(alert.status?.status_name)}"
								>{alert.status?.status_name ?? ''}</span
							>
						</span>
					</span>
				</button>
			</div>
		{/snippet}

		<div class="queue-scroll" role="listbox" aria-label="Alerts" tabindex="-1">
			{#if loading && queueUnits.length === 0}
				<div class="queue-empty">Loading alerts…</div>
			{:else if queueUnits.length === 0}
				<div class="queue-empty">No alerts match the current filters.</div>
			{:else}
				{#each queueUnits as unit (unitKey(unit))}
					{#if unit.kind === 'cluster'}
						{@const open = isClusterOpen(unit.cluster.cluster_id)}
						{@const picked = clusterSelection(unit.alerts)}
						<div class="cluster-group" class:cluster-shut={!open}>
							<div class="cluster-head">
								<button
									type="button"
									class="checkbox"
									role="checkbox"
									aria-checked={picked === 'all' ? true : picked === 'some' ? 'mixed' : false}
									aria-label="{picked === 'all' ? 'Deselect' : 'Select'} the {unit.alerts
										.length} alerts of {unit.cluster.cluster_title}"
									data-checked={picked === 'all'}
									data-partial={picked === 'some'}
									disabled={unit.alerts.length === 0}
									onclick={() => toggleClusterSelection(unit.alerts)}
								></button>

								<button
									type="button"
									class="cluster-toggle"
									aria-expanded={open}
									aria-label="{open ? 'Collapse' : 'Expand'} {unit.cluster.cluster_title}"
									onclick={() => toggleCluster(unit.cluster.cluster_id)}
								>
									<span class="cluster-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
									<!-- Spelled out rather than left to the ◈ glyph alone: the
									     rail and the tint only read as "these rows belong
									     together" once you already know the convention. -->
									<span class="cluster-badge">
										<span class="chip-glyph" aria-hidden="true">◈</span>
										<span>Cluster</span>
									</span>
									<span class="cluster-title">{unit.cluster.cluster_title}</span>
									<span class="cluster-count"
										>{unit.alerts_total}
										{unit.alerts_total === 1 ? 'alert' : 'alerts'}</span
									>
									{#if picked !== 'none'}
										<!-- Folding a cluster shut hides its ticked rows, so the
										     header has to say what is still selected inside it. -->
										<span class="cluster-picked"
											>{unit.alerts.filter((a) => selected[a.alert_id] === true).length} selected</span
										>
									{/if}
								</button>
								<button
									type="button"
									class="cluster-open"
									onclick={() => onOpenCluster(unit.cluster.cluster_id)}>Open ›</button
								>
							</div>

							{#if open}
								{#each unit.alerts as alert (alert.alert_id)}
									{@render queueRow(alert, true)}
								{/each}

								{#if unit.alerts_truncated}
									<!-- The server caps how many members it ships per row so
									     one huge cluster can't dominate the page. -->
									<button
										type="button"
										class="cluster-more"
										onclick={() => onOpenCluster(unit.cluster.cluster_id)}
										>Showing {unit.alerts.length} of {unit.alerts_total} — open the cluster for the rest</button
									>
								{/if}
							{/if}
						</div>
					{:else}
						{@render queueRow(unit.alert, false)}
					{/if}
				{/each}
			{/if}
		</div>

		<div class="queue-foot">
			<span class="key-hint">j / k navigate</span>
			<span class="key-hint">e escalate</span>
			<span class="key-hint">x select</span>
			<span class="key-hint">m merge</span>
			<div class="spacer"></div>
			<button
				type="button"
				class="pager"
				disabled={page <= 1}
				onclick={() => onPageChange(page - 1)}>Prev</button
			>
			<span class="queue-range">{rangeLabel(page, perPage, total)}</span>
			<button
				type="button"
				class="pager"
				disabled={page * perPage >= total}
				onclick={() => onPageChange(page + 1)}>Next</button
			>
		</div>
	</div>

	<!-- ============ detail ============ -->
	<div class="detail">
		<!-- Only shown on small screens, where this pane replaces the queue
		     rather than sitting beside it. Sits outside the branch below so the
		     way back survives `focused` going empty — a filter change can clear
		     it while this pane is the one on screen. -->
		<button type="button" class="detail-back" onclick={() => (narrowPane = 'queue')}>
			‹ Back to queue
		</button>
		{#if !focused}
			<div class="detail-empty">Select an alert to triage it.</div>
		{:else}
			{@const f = focused}
			{@const sev = severityVar(f.severity?.severity_name)}
			<div class="detail-head">
				<div class="detail-head-row">
					<span class="sev-pill">
						<span class="sev-dot" style="color:{sev}">●</span>
						<span class="sev-pill-label">{f.severity?.severity_name ?? 'Unspecified'}</span>
					</span>
					<span class="detail-ref">#A-{f.alert_id}</span>
					<span class="vrule"></span>
					<span class="detail-sub">{f.customer?.customer_name ?? ''}</span>
					{#if f.alert_source}
						<span class="vrule"></span>
						<span class="detail-sub">{f.alert_source}</span>
					{/if}
					<div class="spacer"></div>
					<div class="detail-actions">
						<button type="button" class="btn-accent" onclick={() => onEscalate(f)}
							>Escalate to case</button
						>
						<button type="button" class="btn-outline" onclick={() => onMerge(f)}>Merge…</button>
						<div class="menu-wrap" data-menu="assign">
							<button
								type="button"
								class="btn-outline"
								onclick={() => (showAssignMenu = !showAssignMenu)}
								aria-haspopup="true"
								aria-expanded={showAssignMenu}>Assign ▾</button
							>
							{#if showAssignMenu}
								<div class="menu-dropdown" role="menu">
									<button
										type="button"
										class="menu-item"
										role="menuitem"
										onclick={() => {
											onAssignToMe(f);
											showAssignMenu = false;
										}}>Assign to me</button
									>
									<button
										type="button"
										class="menu-item"
										role="menuitem"
										onclick={() => {
											onAssign(f);
											showAssignMenu = false;
										}}>Assign to…</button
									>
								</div>
							{/if}
						</div>
						{#if canTriggerHooks}
							<div class="menu-wrap" data-menu="modules">
								<button
									type="button"
									class="btn-outline"
									title="Actions contributed by modules"
									onclick={() => (showModulesMenu = !showModulesMenu)}
									aria-haspopup="true"
									aria-expanded={showModulesMenu}>Modules ▾</button
								>
								{#if showModulesMenu}
									<div class="menu-dropdown" role="menu">
										{#each alertHooks.options as hookOption (hookOption.manual_hook_ui_name)}
											<button
												type="button"
												class="menu-item"
												role="menuitem"
												onclick={() => triggerHook(f, hookOption)}
												>{hookOption.manual_hook_ui_name}</button
											>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
						<button type="button" class="btn-outline btn-muted" onclick={() => onClose(f)}
							>Close</button
						>
						{#if canDelete}
							<button
								type="button"
								class="btn-outline btn-danger"
								title="Delete alert"
								onclick={() => onDelete?.(f)}>Delete</button
							>
						{/if}
					</div>
				</div>

				<h2 class="detail-title">{f.alert_title}</h2>

				<div class="detail-chips">
					{#if cluster}
						<!-- Sits among the technique chips, so it gets the accent
						     border and its own label to read as a different kind of
						     thing: the others describe the alert, this one says the
						     alert is not alone. -->
						<button
							type="button"
							class="chip-cluster chip-lg chip-cluster-strong"
							onclick={() => cluster && onOpenCluster(cluster.cluster_id)}
							title="Open the cluster"
						>
							<span class="cluster-badge">
								<span class="chip-glyph" aria-hidden="true">◈</span>
								<span>Cluster</span>
							</span>
							<span>{clusterLabel}</span>
							<span class="chip-go" aria-hidden="true">›</span>
						</button>
					{/if}
					{#each techniques as technique}
						<span class="chip-mono chip-lg">{technique}</span>
					{/each}
				</div>
			</div>

			<div class="tabs" role="tablist" aria-label="Alert detail sections">
				{#each tabs as tab}
					<button
						type="button"
						role="tab"
						class="tab"
						class:tab-active={activeTab === tab.id}
						aria-selected={activeTab === tab.id}
						onclick={() => (requestedTab = tab.id)}
					>
						{tab.label}{#if tab.count !== undefined}<span class="tab-count">{tab.count}</span
							>{:else if tab.dot}<span
								class="tab-dot"
								aria-hidden="true"
								title="Attached to this alert"
							></span>{/if}
					</button>
				{/each}
			</div>

			{#if activeTab === 'graph'}
				<div class="graph-pane">
					<AlertRelatedGraph alertId={f.alert_id} />
				</div>
			{:else if activeTab === 'flow'}
				<!--
				  Full-width like the graph rather than a column of
				  `detail-main`: the checklist carries markdown descriptions
				  and a note editor per step, which the ~60% main column
				  squeezes badly. The shared component brings the app's own
				  tokens with it — same arrangement the graph pane uses.
				-->
				<div class="flow-pane">
					<InvestigationFlowSteps alertId={f.alert_id} />
				</div>
			{:else if activeTab === 'comments'}
				<!--
				  Same arrangement as the flow pane, and for the same reason:
				  the thread carries a markdown composer whose toolbar does not
				  survive the ~60% `detail-main` column. The shared component
				  brings the app's own tokens with it.
				-->
				<div class="comments-pane">
					<CommentsThread
						entity={commentsEntity}
						onChange={() => onCommentsChanged?.(f)}
						class="mx-auto w-full max-w-3xl"
					/>
				</div>
			{:else}
				<div class="detail-body">
					<div class="detail-main">
						{#if activeTab === 'overview'}
							{#if f.alert_description}
								<section class="section">
									<h3 class="section-title">Description</h3>
									<div class="detail-prose">{f.alert_description}</div>
								</section>
							{/if}

							{#if f.alert_context && Object.keys(f.alert_context).length > 0}
								<section class="section">
									<h3 class="section-title">Context</h3>
									<div class="context-grid">
										{#each Object.entries(f.alert_context) as [k, v] (k)}
											<span class="context-key">{k}</span>
											<span class="context-val">{v}</span>
										{/each}
									</div>
								</section>
							{/if}

							{#if (f.assets?.length ?? 0) > 0}
								<section class="section">
									<h3 class="section-title">Assets</h3>
									<div class="asset-list">
										{#each f.assets as a (a.asset_id)}
											<div class="asset-row">
												<div class="asset-name">{a.asset_name}</div>
												{#if a.asset_type?.asset_name || a.asset_ip || a.asset_domain}
													<div class="asset-meta">
														{[a.asset_type?.asset_name, a.asset_ip, a.asset_domain]
															.filter(Boolean)
															.join(' · ')}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</section>
							{/if}

							{#if iocs.length > 0}
								<section class="section">
									<h3 class="section-title">Observables</h3>
									<div class="ioc-chips">
										{#each iocs as ioc (ioc.ioc_id)}
											{@const flag = observableFlag(ioc)}
											<span class="ioc-chip">
												<span class="ioc-kind">{ioc.ioc_type?.type_name ?? 'ioc'}</span>
												<span class="ioc-val">{ioc.ioc_value}</span>
												{#if flag.text}
													<span class="ioc-flag" style="color:{flag.color}">{flag.text}</span>
												{/if}
											</span>
										{/each}
									</div>
								</section>
							{/if}

							{#if !f.alert_description && (!f.alert_context || Object.keys(f.alert_context).length === 0) && (f.assets?.length ?? 0) === 0 && iocs.length === 0}
								<p class="section-empty">No overview data for this alert.</p>
							{/if}
						{/if}

						{#if activeTab === 'assets'}
							<section class="section">
								<h3 class="section-title">Assets</h3>
								{#if (f.assets?.length ?? 0) === 0}
									<p class="section-empty">No assets linked to this alert.</p>
								{:else}
									<div class="asset-list">
										{#each f.assets as a (a.asset_id)}
											<div class="asset-row">
												<div class="obs-head">
													<div class="obs-main">
														<div class="asset-name">{a.asset_name}</div>
														<div class="asset-meta">
															{[a.asset_type?.asset_name, a.asset_ip, a.asset_domain]
																.filter(Boolean)
																.join(' · ')}
														</div>
													</div>

													<div class="obs-actions">
														<button
															type="button"
															class="obs-btn"
															disabled={!a.asset_enrichment}
															title={a.asset_enrichment ? 'View enrichment' : 'No enrichment'}
															onclick={() => showEnrichment(a.asset_name, a.asset_enrichment)}
															>Enrichment</button
														>
														<button
															type="button"
															class="obs-btn"
															title="Edit asset"
															onclick={() => editAsset(a)}>Edit</button
														>
													</div>
												</div>

												{#if a.asset_description}
													<div class="obs-desc">{a.asset_description}</div>
												{/if}

												{#if a.asset_tags}
													<div class="obs-tags">
														{#each a.asset_tags.split(',').filter(Boolean) as tag (tag)}
															<span class="obs-tag">{tag.trim()}</span>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</section>
						{/if}

						{#if activeTab === 'cluster'}
							<section class="section">
								<h3 class="section-title">Why this fired together</h3>
								{#if clusterMembers.length === 0}
									<p class="section-empty">This alert is not part of a cluster.</p>
								{:else}
									<div class="cluster-list">
										{#each clusterMembers as member (member.alert_id)}
											<div class="cluster-row">
												<span class="cluster-time">{clockTime(member.alert_source_event_time)}</span
												>
												<span
													class="sev-bar cluster-bar"
													style="background:{severityVar(member.severity?.severity_name)}"
												></span>
												<span class="cluster-body">
													<span class="cluster-title">{member.alert_title}</span>
													<span class="cluster-meta"
														>{[assetLabel(member.assets), primaryTechnique(member)]
															.filter(Boolean)
															.join(' · ')}</span
													>
												</span>
												<span class="cluster-link"
													>{member.alert_id === f.alert_id
														? 'this alert'
														: `#A-${member.alert_id}`}</span
												>
											</div>
										{/each}
										{#if cluster}
											<button
												type="button"
												class="cluster-promote"
												onclick={() => cluster && onOpenCluster(cluster.cluster_id)}
												>Promote all {cluster.alert_ids?.length ?? clusterMembers.length} to one case
												→</button
											>
										{/if}
									</div>
								{/if}
							</section>
						{/if}

						{#if activeTab === 'iocs'}
							<section class="section">
								<h3 class="section-title">Observables</h3>
								{#if iocs.length === 0}
									<p class="section-empty">No observables extracted from this alert.</p>
								{:else}
									<!--
									  The overview keeps the one-line chips; this tab is
									  where the observable is worked on, so it spells out
									  what was written about it and lets it be edited.
									-->
									<div class="asset-list">
										{#each iocs as ioc (ioc.ioc_id)}
											{@const flag = observableFlag(ioc)}
											<div class="asset-row">
												<div class="obs-head">
													<div class="obs-main">
														<div class="asset-name">
															{ioc.ioc_value}
															{#if flag.text}
																<span class="ioc-flag" style="color:{flag.color}">{flag.text}</span>
															{/if}
														</div>
														<div class="asset-meta">
															{[ioc.ioc_type?.type_name, ioc.tlp?.tlp_name]
																.filter(Boolean)
																.join(' · ')}
														</div>
													</div>

													<div class="obs-actions">
														<button
															type="button"
															class="obs-btn"
															disabled={!ioc.ioc_enrichment}
															title={ioc.ioc_enrichment ? 'View enrichment' : 'No enrichment'}
															onclick={() => showEnrichment(ioc.ioc_value, ioc.ioc_enrichment)}
															>Enrichment</button
														>
														<button
															type="button"
															class="obs-btn"
															title="Edit IOC"
															onclick={() => editIoc(ioc)}>Edit</button
														>
													</div>
												</div>

												{#if ioc.ioc_description}
													<div class="obs-desc">{ioc.ioc_description}</div>
												{/if}

												{#if ioc.ioc_tags}
													<div class="obs-tags">
														{#each ioc.ioc_tags.split(',').filter(Boolean) as tag (tag)}
															<span class="obs-tag">{tag.trim()}</span>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</section>
						{/if}

						{#if activeTab === 'raw'}
							<section class="section">
								<h3 class="section-title">Raw event</h3>
								{#if rawEvent}
									<pre class="raw">{rawEvent}</pre>
								{:else}
									<p class="section-empty">No raw event payload was stored with this alert.</p>
								{/if}
							</section>
						{/if}

						{#if activeTab === 'timeline'}
							{@const allEntries = activityEntries(f.modification_history, 1000)}
							{#if allEntries.length === 0}
								<p class="section-empty">No recorded activity.</p>
							{:else}
								<div class="tl-list">
									{#each allEntries as entry (entry.at)}
										<div class="tl-row">
											<div class="tl-left">
												<span class="tl-time"
													>{new Date(entry.at).toLocaleString(undefined, {
														month: 'short',
														day: 'numeric',
														hour: '2-digit',
														minute: '2-digit'
													})}</span
												>
												<span class="tl-user">{entry.user || '—'}</span>
											</div>
											<div class="tl-dot"></div>
											<div class="tl-right">
												<span class="tl-verb">{entry.verb}</span>
												{#if entry.changes.length > 0}
													<div class="tl-changes">
														{#each entry.changes as ch (ch.field)}
															<div class="tl-change">
																<span class="tl-field">{ch.field}</span>
																{#if ch.from !== '—'}
																	<span class="tl-from">{ch.from}</span>
																	<span class="tl-arrow">→</span>
																{/if}
																<span class="tl-to">{ch.to}</span>
															</div>
														{/each}
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						{/if}

						{#if activeTab === 'notes'}
							<section class="section">
								<h3 class="section-title">Notes</h3>
								{#if notes}
									<div class="note">{notes}</div>
								{:else}
									<p class="section-empty">No notes on this alert yet.</p>
								{/if}
							</section>
						{/if}
					</div>

					<div class="detail-side">
						<div class="side-block">
							<h3 class="section-title">Triage</h3>
							<div class="side-rows">
								<div class="side-row">
									<span class="side-label">Status</span>
									<span style="color:{statusVar(f.status?.status_name)}; font-weight:500"
										>{f.status?.status_name ?? '—'}</span
									>
								</div>
								<div class="side-row">
									<span class="side-label">Owner</span>
									<span class="side-value">{f.owner?.user_name ?? 'Unassigned'}</span>
								</div>
								<div class="side-row">
									<span class="side-label">Severity</span>
									<span class="side-mono" style="color:{severityVar(f.severity?.severity_name)}"
										>{f.severity?.severity_name ?? '—'}</span
									>
								</div>
								<div class="side-row">
									<span class="side-label">Age</span>
									<span class="side-mono" style="color:{ageVar(f.alert_source_event_time, now)}"
										>{ageLabel(f.alert_source_event_time, now) || '—'}</span
									>
								</div>
								<div class="side-row">
									<span class="side-label">Resolution</span>
									<span class="side-value"
										>{f.resolution_status?.resolution_status_name ?? 'Unset'}</span
									>
								</div>
							</div>
						</div>

						<div class="hrule"></div>

						<div class="side-block">
							<h3 class="section-title">Seen before</h3>
							{#if cluster}
								<p class="side-prose">
									Clustered with {(cluster.alert_ids?.length ?? 1) - 1} other alert{(cluster
										.alert_ids?.length ?? 1) -
										1 ===
									1
										? ''
										: 's'} by
									<span class="side-strong"
										>{cluster.source_rule?.rule_name ?? 'a correlation rule'}</span
									>.
								</p>
								<button
									type="button"
									class="side-link"
									onclick={() => cluster && onOpenCluster(cluster.cluster_id)}
									>View cluster →</button
								>
							{:else}
								<p class="side-prose">No correlation history for this alert.</p>
							{/if}
						</div>

						<div class="hrule"></div>

						<div class="side-block">
							<h3 class="section-title">Activity</h3>
							{#if activity.length === 0}
								<p class="section-empty">Nothing recorded yet.</p>
							{:else}
								<div class="activity">
									{#each activity as entry (entry.at)}
										<div class="activity-entry">
											<div class="activity-title">{entry.verb || entry.action}</div>
											<div class="activity-meta">
												{entry.time}{entry.user ? ` · ${entry.user}` : ''}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<EnrichmentDialog
	bind:open={enrichmentOpen}
	subject={enrichmentSubject}
	enrichment={enrichmentValue}
/>

{#if editedIoc}
	<AlertIocEditDialog
		bind:open={iocDialogOpen}
		ioc={editedIoc}
		saving={savingObservable}
		onClose={closeIocDialog}
		onSave={(changes) => editedIoc && saveIoc(editedIoc, changes)}
	/>
{/if}

{#if editedAsset}
	<AlertAssetEditDialog
		bind:open={assetDialogOpen}
		asset={editedAsset}
		saving={savingObservable}
		onClose={closeAssetDialog}
		onSave={(changes) => editedAsset && saveAsset(editedAsset, changes)}
	/>
{/if}

<style>
	/*
	 * The mockup's palette, transposed onto the app's light-first theming
	 * (`:root` is light, `.dark` swaps). Names are the mockup's own so the
	 * markup below can be read against the design file line for line.
	 */
	.iris-triage {
		--on-acc: #ffffff;
		--s-deep: #f1f3f6;
		--s-sunken: #f7f8fa;
		--s-card: #ffffff;
		--s-chip: #f4f6f9;
		--s-chip2: #f4f6f9;
		--s-sel: hsl(214 91% 95%);
		--s-cluster: hsl(214 91% 94%);
		--s-acc-tint: hsl(214 91% 96%);
		--s-red: #fdecec;
		--s-hover: #f2f5f9;
		--b-hair: #e8ebef;
		--b-sub: #e5e8ed;
		--b-line: #e5e8ed;
		--b-1: #e2e6ec;
		--b-2: #e2e6ec;
		--b-4: #dee3ea;
		--b-5: #d6dce4;
		--b-6: #ccd4de;
		--b-check: #b9c2cd;
		--b-cluster: hsl(214 91% 78%);
		--b-red: #f2b8b8;
		--t-max: #0b1220;
		--t-hi: #0b1220;
		--t-1: #131a24;
		--t-2: #1c2530;
		--t-4: #2f3946;
		--t-5: #465162;
		--t-6: #4b5563;
		--t-7: #5a6472;
		--t-8: #667081;
		--t-9: #78818f;
		--t-10: #8a93a1;
		--t-11: #9aa3b1;
		--t-mono: #3f5560;
		--acc: hsl(214 91% 22%);
		--acc-hi: hsl(214 91% 18%);
		--acc-soft: hsl(214 91% 30%);
		--crit: #d9302c;
		--crit-t: #c62828;
		--warn: #a8730a;
		--info: #1668b8;

		--mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

		display: grid;
		grid-template-columns: 640px 1fr;
		min-height: 0;
		min-width: 0;
		flex: 1;
		background: var(--s-card);
		color: var(--t-1);
		border-top: 1px solid var(--b-2);
	}

	:global(.dark) .iris-triage {
		--on-acc: #0c0e12;
		--s-deep: #0d1014;
		--s-sunken: #0f1217;
		--s-card: #12151b;
		--s-chip: #161b22;
		--s-chip2: #171b22;
		--s-sel: hsl(214 40% 14%);
		--s-cluster: hsl(214 35% 16%);
		--s-acc-tint: hsl(214 40% 12%);
		--s-red: #3a1418;
		--s-hover: #161b23;
		--b-hair: #1a1e26;
		--b-sub: #1d212a;
		--b-line: #1f242c;
		--b-1: #232830;
		--b-2: #23272f;
		--b-4: #262b34;
		--b-5: #2a2f3a;
		--b-6: #313742;
		--b-check: #3a4150;
		--b-cluster: hsl(214 40% 28%);
		--b-red: #5e1f26;
		--t-max: #f5f8fc;
		--t-hi: #f2f5f9;
		--t-1: #e6e9ef;
		--t-2: #dfe4eb;
		--t-4: #c8cfd9;
		--t-5: #b9c1cc;
		--t-6: #9aa3b1;
		--t-7: #8b93a1;
		--t-8: #7c8493;
		--t-9: #6b7280;
		--t-10: #5a616e;
		--t-11: #4b5261;
		--t-mono: #8fa3ad;
		--acc: hsl(214 91% 60%);
		--acc-hi: hsl(214 91% 72%);
		--acc-soft: hsl(214 91% 50%);
		--crit: #ff6b6b;
		--crit-t: #ff8f8f;
		--warn: #f0b429;
		--info: #5eb0ef;
	}

	.spacer {
		flex: 1;
	}
	.vrule {
		width: 1px;
		height: 11px;
		background: var(--b-5);
		flex-shrink: 0;
	}
	.hrule {
		height: 1px;
		background: var(--b-sub);
	}

	/* ---------------- queue ---------------- */

	.queue {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		border-right: 1px solid var(--b-2);
		background: var(--s-sunken);
	}

	/* Quick-filter tab strip — the mockup's segmented "My queue / Unassigned / …" bar */
	.queue-tabs {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0;
		border-bottom: 1px solid var(--b-2);
		background: var(--s-card);
		overflow-x: auto;
	}
	.qtab {
		padding: 7px 13px;
		font-size: 13px;
		color: var(--t-6);
		background: none;
		border: 0;
		border-left: 1px solid var(--b-5);
		cursor: pointer;
		font-family: inherit;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.qtab:first-child {
		border-left: 0;
	}
	.qtab-active {
		font-weight: 600;
		color: #ffffff;
		background: var(--acc);
	}
	.qtab-count {
		margin-left: 5px;
		opacity: 0.55;
		font-weight: 400;
	}
	.qtab-active .qtab-count {
		opacity: 0.55;
	}

	/* Filter chip bar */
	.filter-bar {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 7px 16px;
		border-bottom: 1px solid var(--b-sub);
		background: var(--s-card);
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		background: var(--s-acc-tint);
		border: 1px solid var(--b-cluster);
		border-radius: 5px;
		font-size: 12px;
		color: var(--acc);
	}
	.filter-chip-remove {
		background: none;
		border: 0;
		padding: 0;
		line-height: 1;
		font-size: 14px;
		color: var(--acc-soft);
		cursor: pointer;
		font-family: inherit;
	}
	.filter-chip-remove:hover {
		color: var(--acc-hi);
	}
	.btn-filter-add {
		padding: 3px 9px;
		font-size: 12px;
		color: var(--t-7);
		background: none;
		border: 1px dashed var(--b-4);
		border-radius: 5px;
		cursor: pointer;
		font-family: inherit;
		white-space: nowrap;
	}
	.btn-filter-add:hover,
	.btn-filter-active {
		color: var(--acc);
		border-color: var(--b-cluster);
		background: var(--s-acc-tint);
	}

	.queue-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 16px;
		border-bottom: 1px solid var(--b-sub);
		background: var(--s-card);
	}

	.queue-census {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--t-9);
	}

	/* Column labels sit where the value they order by appears in a row:
	   severity leads, event time and status trail on the right. The rows
	   are stacked rather than gridded — a clustered alert nests under its
	   cluster — so this is an alignment by eye, not a shared track. */
	.queue-cols {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		gap: 14px;
	}
	.queue-sort {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: inherit;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--t-9);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		white-space: nowrap;
	}
	.queue-sort:hover {
		color: var(--t-6);
	}
	.queue-sort:focus-visible {
		outline: 2px solid var(--acc);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.queue-sort-active {
		color: var(--t-4);
	}
	.queue-sort-arrow {
		font-size: 8px;
		line-height: 1;
	}
	/* Status and event time read off the right-hand end of a row. */
	.q-col-status {
		margin-left: auto;
	}

	.checkbox {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		border: 1.5px solid var(--b-check);
		border-radius: 3px;
		background: transparent;
		padding: 0;
		cursor: pointer;
	}
	.checkbox[data-checked='true'] {
		background: var(--acc);
		border-color: var(--acc);
	}
	/* Some-but-not-all: a bar rather than a fill, so it never reads as
	   "everything under here is picked". */
	.checkbox[data-partial='true'] {
		border-color: var(--acc);
		background: linear-gradient(
			to bottom,
			transparent 0 40%,
			var(--acc) 40% 60%,
			transparent 60% 100%
		);
	}
	.checkbox:disabled {
		cursor: default;
		opacity: 0.4;
	}

	/* Bulk-action strip. Only the frame lives here — the buttons come from
	   the page as a snippet so they are literally the list view's. */
	.selection-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--b-sub);
		background: var(--s-acc-tint);
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.selection-count {
		font-size: 12px;
		font-weight: 600;
		color: var(--acc);
		white-space: nowrap;
	}
	.selection-clear {
		padding: 0;
		font-size: 12px;
		color: var(--t-8);
		background: none;
		border: 0;
		cursor: pointer;
		font-family: inherit;
	}
	.selection-clear:hover {
		color: var(--t-4);
	}
	.selection-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.queue-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.queue-empty,
	.detail-empty {
		padding: 28px 16px;
		font-size: 13px;
		color: var(--t-9);
	}
	.detail-empty {
		display: grid;
		place-items: center;
		height: 100%;
	}

	/* ---------------- cluster groups ----------------
	   A cluster is one queue entry: a labelled header with its member
	   alerts nested under it. Three things carry that, in falling order
	   of how far you can scroll and still see them: the rail running down
	   the whole group, the tinted header band, and the badge on it. */
	.cluster-group {
		margin: 6px 0;
		border-top: 1px solid var(--b-cluster);
		border-bottom: 1px solid var(--b-cluster);
		border-left: 3px solid var(--acc);
		background: var(--s-sunken);
	}
	.cluster-group > .row {
		border-bottom: none;
		border-left: 2px solid var(--b-cluster);
		padding-left: 22px;
		background: var(--s-card);
	}
	.cluster-group > .row:hover {
		background: var(--s-hover);
	}
	.cluster-group > .row.row-focused {
		background: var(--s-sel);
	}

	.cluster-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px 0 8px;
		background: var(--s-cluster);
		border-bottom: 1px solid var(--b-cluster);
	}
	.cluster-badge {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 4px;
		padding: 1px 6px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--acc);
		background: var(--s-card);
		border: 1px solid var(--b-cluster);
		border-radius: 4px;
	}
	.cluster-toggle {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		gap: 7px;
		padding: 9px 4px;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}
	.cluster-caret {
		width: 9px;
		font-size: 9px;
		color: var(--t-9);
	}
	/* Scoped to the queue header: `.cluster-title` is also the member
	   title in the Cluster tab further down, and at equal specificity
	   that rule was winning here — the header was rendering at the
	   member list's lighter 13.5px/500 instead of this. */
	.cluster-toggle .cluster-title {
		overflow: hidden;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--t-2);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cluster-count {
		flex: none;
		padding: 1px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--t-4);
		background: var(--s-card);
		border: 1px solid var(--b-cluster);
		border-radius: 999px;
		white-space: nowrap;
	}
	.cluster-picked {
		flex: none;
		padding: 1px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--acc);
		background: var(--s-acc-tint);
		border: 1px solid var(--b-cluster);
		border-radius: 4px;
		white-space: nowrap;
	}
	.cluster-open {
		flex: none;
		padding: 2px 7px;
		font-size: 11.5px;
		color: var(--t-9);
		background: none;
		border: 1px solid transparent;
		border-radius: 5px;
		cursor: pointer;
	}
	.cluster-open:hover {
		color: var(--acc);
		border-color: var(--b-cluster);
	}
	.cluster-more {
		display: block;
		width: 100%;
		padding: 8px 16px 8px 22px;
		font-size: 11.5px;
		text-align: left;
		color: var(--acc-soft);
		background: none;
		border: none;
		border-left: 2px solid var(--b-cluster);
		cursor: pointer;
	}
	.cluster-more:hover {
		background: var(--s-hover);
	}

	.row {
		display: grid;
		grid-template-columns: 14px 1fr;
		gap: 11px;
		align-items: start;
		padding: 13px 16px;
		border-bottom: 1px solid var(--b-hair);
	}
	.row:hover {
		background: var(--s-hover);
	}
	.row-focused,
	.row-focused:hover {
		background: var(--s-sel);
	}
	.row .checkbox {
		margin-top: 3px;
	}

	/*
	 * The row body is the button (not the whole row) so the select
	 * checkbox stays a separate control instead of being nested inside
	 * another interactive element. The 3px severity bar keeps the
	 * mockup's column offsets because this inner grid re-creates them.
	 */
	.row-main {
		display: grid;
		grid-template-columns: 3px 1fr;
		gap: 11px;
		align-items: stretch;
		min-width: 0;
		text-align: left;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.sev-bar {
		width: 3px;
		min-height: 44px;
		border-radius: 2px;
		align-self: stretch;
	}

	.row-body {
		display: flex;
		flex-direction: column;
		gap: 7px;
		min-width: 0;
	}

	.row-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row-sev {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.row-client {
		font-size: 12px;
		color: var(--t-8);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-time {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-10);
		white-space: nowrap;
	}

	.row-title {
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.35;
		text-wrap: pretty;
	}

	.row-chips {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}
	.row-status {
		font-size: 11.5px;
		font-weight: 500;
	}

	.chip-cluster {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 7px 2px 5px;
		background: var(--s-cluster);
		border: 1px solid var(--b-cluster);
		border-radius: 5px;
		font-size: 11.5px;
		font-weight: 500;
		color: var(--acc-soft);
	}
	.chip-glyph {
		font-size: 10px;
		color: var(--acc);
	}
	.chip-mono {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-9);
		background: var(--s-chip2);
		border: 1px solid var(--b-1);
		border-radius: 4px;
		padding: 2px 6px;
	}
	.chip-lg {
		font-size: 12px;
		padding: 3px 9px;
		border-radius: 5px;
	}
	button.chip-cluster {
		cursor: pointer;
	}
	button.chip-cluster:hover {
		border-color: var(--acc);
	}
	.chip-cluster-strong {
		gap: 7px;
		padding-left: 4px;
		border-color: var(--acc);
		color: var(--t-2);
		font-weight: 600;
	}
	.chip-go {
		color: var(--acc);
	}

	.queue-foot {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 16px;
		border-top: 1px solid var(--b-sub);
		background: var(--s-card);
	}
	.key-hint {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-10);
	}
	.queue-range {
		font-size: 12px;
		color: var(--t-10);
	}
	.pager {
		font-size: 12px;
		color: var(--t-8);
		background: none;
		border: 0;
		padding: 0 2px;
		cursor: pointer;
	}
	.pager:disabled {
		color: var(--t-11);
		cursor: default;
	}

	/* ---------------- detail ---------------- */

	.detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		background: var(--s-card);
		overflow: hidden;
	}

	.detail-head {
		padding: 18px 22px 16px;
		border-bottom: 1px solid var(--b-2);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.detail-head-row {
		display: flex;
		align-items: center;
		gap: 9px;
		flex-wrap: wrap;
	}

	.sev-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 9px;
		background: var(--s-red);
		border: 1px solid var(--b-red);
		border-radius: 5px;
	}
	.sev-dot {
		font-size: 10px;
	}
	.sev-pill-label {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--crit-t);
	}

	.detail-ref {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--t-9);
	}
	.detail-sub {
		font-size: 12.5px;
		color: var(--t-7);
	}

	.detail-actions {
		display: flex;
		gap: 7px;
		/* Delete and Modules make six buttons in this row; on a narrow
		   detail pane they wrap rather than pushing the head out. */
		flex-wrap: wrap;
	}
	.btn-accent,
	.btn-outline {
		padding: 7px 12px;
		font-size: 13px;
		border-radius: 7px;
		cursor: pointer;
		font: inherit;
		font-size: 13px;
	}
	.btn-accent {
		font-weight: 600;
		color: var(--on-acc);
		background: var(--acc);
		border: 1px solid var(--acc);
	}
	.btn-accent:hover {
		background: var(--acc-hi);
		border-color: var(--acc-hi);
	}
	.btn-outline {
		color: var(--t-3, var(--t-4));
		background: none;
		border: 1px solid var(--b-6);
	}
	.btn-outline:hover {
		background: var(--s-hover);
	}
	.btn-muted {
		color: var(--t-6);
	}
	/* Reads as destructive at rest, not only on hover — it is the one
	   action in this row that cannot be undone. */
	.btn-danger {
		color: var(--crit-t);
		border-color: var(--b-red);
	}
	.btn-danger:hover {
		color: var(--on-acc);
		background: var(--crit);
		border-color: var(--crit);
	}

	/* Shared by the header's two dropdowns (Assign, Modules). */
	.menu-wrap {
		position: relative;
	}
	.menu-dropdown {
		position: absolute;
		top: calc(100% + 5px);
		right: 0;
		z-index: 200;
		min-width: 140px;
		/* Module hook names are arbitrary text; cap the width and let the
		   list scroll rather than let a chatty module stretch the header. */
		max-width: 280px;
		max-height: 320px;
		overflow: auto;
		background: var(--s-card);
		border: 1px solid var(--b-4);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		display: flex;
		flex-direction: column;
	}
	.menu-item {
		padding: 9px 13px;
		font-size: 13px;
		font-family: inherit;
		color: var(--t-1);
		background: none;
		border: 0;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.menu-item:hover {
		background: var(--s-hover);
		color: var(--t-1);
	}
	.menu-item + .menu-item {
		border-top: 1px solid var(--b-hair);
	}

	.detail-title {
		font-size: 22px;
		font-weight: 600;
		color: var(--t-hi);
		line-height: 1.3;
		text-wrap: pretty;
		margin: 0;
	}
	.detail-desc {
		font-size: 14px;
		color: var(--t-6);
		line-height: 1.6;
		max-width: 760px;
		text-wrap: pretty;
		margin: 0;
		white-space: pre-wrap;
	}
	.detail-chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.tabs {
		display: flex;
		gap: 2px;
		padding: 0 22px;
		border-bottom: 1px solid var(--b-2);
		background: var(--s-card);
		flex-shrink: 0;
	}
	.tab {
		padding: 11px 12px;
		font-size: 13px;
		color: var(--t-7);
		background: none;
		border: 0;
		cursor: pointer;
		font-family: inherit;
	}
	.tab-active {
		font-weight: 600;
		color: var(--t-1);
		box-shadow: inset 0 -2px 0 var(--acc);
	}
	.tab-count {
		margin-left: 5px;
		color: var(--t-10);
	}
	/* Stands in for a count on tabs whose content is only known after a
	   fetch: says "there is something here" without claiming how much. */
	.tab-dot {
		display: inline-block;
		width: 5px;
		height: 5px;
		margin-left: 5px;
		vertical-align: middle;
		background: var(--acc);
		border-radius: 50%;
	}

	.detail-body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 300px;
	}
	.detail-main {
		padding: 20px 22px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		border-right: 1px solid var(--b-sub);
		overflow-y: auto;
		min-width: 0;
	}
	.detail-side {
		padding: 20px 18px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background: var(--s-sunken);
		overflow-y: auto;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.section-title {
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--t-9);
		margin: 0;
	}
	.section-empty {
		font-size: 13px;
		color: var(--t-9);
		margin: 0;
	}

	.cluster-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--b-1);
		border-radius: 9px;
		overflow: hidden;
		background: var(--s-sunken);
	}
	.cluster-row {
		display: grid;
		grid-template-columns: 66px 3px 1fr 96px;
		gap: 12px;
		align-items: center;
		padding: 11px 13px;
		border-bottom: 1px solid var(--b-hair);
	}
	.cluster-time {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--t-8);
	}
	.cluster-bar {
		height: 26px;
		min-height: 0;
		align-self: center;
	}
	.cluster-body {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.cluster-body .cluster-title {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--t-2);
		line-height: 1.35;
	}
	.cluster-meta {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-9);
	}
	.cluster-link {
		font-size: 11.5px;
		color: var(--t-8);
		text-align: right;
	}
	.cluster-promote {
		padding: 10px 13px;
		font-size: 12.5px;
		color: var(--acc);
		background: var(--s-acc-tint);
		border: 0;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
	}
	.cluster-promote:hover {
		color: var(--acc-hi);
	}

	.ioc-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.ioc-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 9px;
		background: var(--s-chip);
		border: 1px solid var(--b-4);
		border-radius: 6px;
		max-width: 100%;
	}
	.ioc-kind {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--t-10);
		flex-shrink: 0;
	}
	.ioc-val {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--t-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ioc-flag {
		font-size: 11px;
		flex-shrink: 0;
	}

	.raw {
		font-family: var(--mono);
		font-size: 11.5px;
		line-height: 1.75;
		color: var(--t-mono);
		background: var(--s-deep);
		border: 1px solid var(--b-line);
		border-radius: 9px;
		padding: 13px 15px;
		white-space: pre;
		overflow: auto;
		margin: 0;
	}

	.graph-pane {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--s-sunken);
	}

	/* The checklist scrolls internally, so the pane must be a bounded
	   flex child — `min-height: 0` is what lets it be shorter than its
	   content instead of pushing the detail pane past the viewport. */
	.flow-pane {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--s-card);
	}

	/* Same bounded-flex-child deal as the flow pane: the thread owns its
	   own scroll so the composer stays pinned to the bottom. */
	.comments-pane {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--s-card);
	}

	.context-grid {
		display: grid;
		grid-template-columns: minmax(120px, max-content) 1fr;
		gap: 0;
		border: 1px solid var(--b-1);
		border-radius: 9px;
		overflow: hidden;
		background: var(--s-sunken);
	}
	.context-key,
	.context-val {
		padding: 7px 12px;
		font-size: 12.5px;
		border-bottom: 1px solid var(--b-hair);
	}
	.context-key {
		font-family: var(--mono);
		color: var(--t-8);
		background: var(--s-deep);
		border-right: 1px solid var(--b-hair);
		word-break: break-all;
	}
	.context-val {
		color: var(--t-2);
		word-break: break-all;
	}
	.context-key:last-of-type,
	.context-val:last-of-type {
		border-bottom: 0;
	}

	.detail-prose {
		font-size: 14px;
		color: var(--t-6);
		line-height: 1.65;
		white-space: pre-wrap;
		text-wrap: pretty;
	}

	.asset-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--b-1);
		border-radius: 9px;
		overflow: hidden;
		background: var(--s-sunken);
	}
	.asset-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--b-hair);
	}
	.asset-row:last-child {
		border-bottom: 0;
	}
	.asset-name {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--t-2);
		font-family: var(--mono);
	}
	.asset-meta {
		font-size: 12px;
		color: var(--t-8);
	}

	/* Observable detail rows — IOC and asset tabs. */
	.obs-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.obs-main {
		min-width: 0;
	}
	.obs-actions {
		display: flex;
		flex-shrink: 0;
		gap: 6px;
	}
	.obs-btn {
		padding: 3px 8px;
		font-size: 11px;
		color: var(--t-6);
		background: var(--s-chip);
		border: 1px solid var(--b-4);
		border-radius: 6px;
		cursor: pointer;
	}
	.obs-btn:hover:not(:disabled) {
		color: var(--t-2);
		border-color: var(--b-1);
	}
	.obs-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.obs-desc {
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--t-6);
		white-space: pre-wrap;
	}
	.obs-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 2px;
	}
	.obs-tag {
		padding: 2px 6px;
		font-size: 10.5px;
		color: var(--t-8);
		background: var(--s-chip);
		border: 1px solid var(--b-4);
		border-radius: 5px;
	}

	.note {
		font-size: 13px;
		color: var(--t-6);
		line-height: 1.6;
		white-space: pre-wrap;
		padding: 12px;
		background: var(--s-sunken);
		border: 1px solid var(--b-1);
		border-radius: 9px;
	}

	/* ---------------- sidebar ---------------- */

	.side-block {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.side-rows {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.side-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
	}
	.side-label {
		color: var(--t-8);
		flex-shrink: 0;
	}
	.side-value {
		color: var(--t-2);
		text-align: right;
	}
	.side-mono {
		font-family: var(--mono);
		font-weight: 600;
	}
	.side-asset {
		font-size: 13px;
		font-weight: 400;
		color: var(--t-2);
		word-break: break-all;
	}
	.side-dim {
		font-size: 12.5px;
		color: var(--t-8);
	}
	.side-prose {
		font-size: 13px;
		color: var(--t-6);
		line-height: 1.6;
		margin: 0;
	}
	.side-strong {
		color: var(--t-2);
	}
	.side-link {
		font-size: 12.5px;
		color: var(--acc);
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
	}
	.side-link:hover {
		color: var(--acc-hi);
	}

	.activity {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.activity-entry {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.activity-title {
		font-size: 12.5px;
		color: var(--t-2);
	}
	.activity-meta {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-10);
	}

	/* ---------------- timeline ---------------- */

	.tl-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.tl-row {
		display: grid;
		grid-template-columns: 140px 16px 1fr;
		gap: 0 10px;
		align-items: start;
		padding: 11px 0;
		border-bottom: 1px solid var(--b-hair);
	}
	.tl-row:last-child {
		border-bottom: 0;
	}
	.tl-left {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: right;
	}
	.tl-time {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--t-8);
	}
	.tl-user {
		font-size: 11px;
		color: var(--t-10);
	}
	.tl-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--b-6);
		margin-top: 3px;
		flex-shrink: 0;
	}
	.tl-right {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.tl-verb {
		font-size: 13px;
		font-weight: 600;
		color: var(--t-2);
	}
	.tl-changes {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tl-change {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 12px;
	}
	.tl-field {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		color: var(--t-7);
		background: var(--s-chip);
		border: 1px solid var(--b-1);
		border-radius: 3px;
		padding: 1px 5px;
		flex-shrink: 0;
	}
	.tl-from {
		color: var(--t-9);
		font-size: 12px;
		word-break: break-all;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tl-arrow {
		color: var(--t-10);
		font-size: 11px;
		flex-shrink: 0;
	}
	.tl-to {
		color: var(--t-2);
		font-size: 12px;
		word-break: break-all;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/*
	 * Below ~1200px the fixed 640px queue and 300px sidebar stop fitting
	 * together; the sidebar folds under the main column first, then the
	 * queue gives up its fixed width.
	 */
	@media (max-width: 1400px) {
		.detail-body {
			grid-template-columns: 1fr;
		}
		.detail-side {
			border-top: 1px solid var(--b-sub);
		}
	}
	@media (max-width: 1100px) {
		.iris-triage {
			grid-template-columns: 420px 1fr;
		}
	}

	/* Belongs to the stacked layout only; the wide split keeps both panes on
	   screen, so there is nothing to go back from. */
	.detail-back {
		display: none;
		align-self: flex-start;
		flex-shrink: 0;
		/* Matches `.detail-head`'s inline padding so it lines up with the
		   title beneath it. */
		padding: 12px 22px 0;
		border: 0;
		background: none;
		color: var(--t-2);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
	}
	.detail-back:hover {
		color: var(--t-1);
	}

	/*
	 * Below this width the queue's fixed 420px track leaves the detail too
	 * little room to be readable, so the two panes stop sharing the viewport
	 * and swap instead — queue until an alert is picked, then the detail with
	 * a way back. Matches the case queue's stacking breakpoint.
	 */
	@media (max-width: 63.9375rem) {
		.iris-triage {
			grid-template-columns: minmax(0, 1fr);
		}
		.iris-triage:not(.show-detail) .detail {
			display: none;
		}
		.iris-triage.show-detail .queue {
			display: none;
		}
		/* No pane beside it to divide from once stacked. */
		.queue {
			border-right: none;
		}
		.detail-back {
			display: inline-flex;
		}
	}
</style>
