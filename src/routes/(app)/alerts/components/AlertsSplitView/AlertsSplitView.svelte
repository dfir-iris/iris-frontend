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
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { AlertClustersService } from '$lib/services/alert-clusters.service';
	import AlertRelatedGraph from '../AlertRelatedGraph/AlertRelatedGraph.svelte';
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
		alerts: Alert[];
		loading?: boolean;
		total: number;
		page: number;
		perPage: number;
		selected: Record<number, boolean>;
		sortLabel: string;
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
		/** Whether the filter panel is currently open (used to toggle the button label). */
		filterPanelOpen?: boolean;
		/** Called when the user clicks the "+ Filter" button. */
		onOpenFilters?: () => void;
		/** Suspends the keyboard bindings while a dialog or panel owns focus. */
		shortcutsEnabled?: boolean;
		onToggleSort: () => void;
		onSelect: (alertId: number, checked: boolean) => void;
		onSelectAll: (checked: boolean) => void;
		onAssignToMe: (alert: Alert) => void;
		onAssign: (alert: Alert) => void;
		onEscalate: (alert: Alert) => void;
		onMerge: (alert: Alert) => void;
		onClose: (alert: Alert) => void;
		onOpenCluster: (clusterId: number) => void;
		onPageChange: (page: number) => void;
		onQueueTabChange: (tab: 'mine' | 'unassigned' | 'escalated' | null) => void;
	}

	const alertsCtx = getContext<AlertsContext>(ALERTS_CTX);

	let {
		class: className = '',
		alerts,
		loading = false,
		total,
		page,
		perPage,
		selected,
		sortLabel,
		queueTab,
		queueCounts,
		filterBar,
		filterPanelOpen = false,
		onOpenFilters,
		shortcutsEnabled = true,
		onToggleSort,
		onSelect,
		onSelectAll,
		onAssignToMe,
		onAssign,
		onEscalate,
		onMerge,
		onClose,
		onOpenCluster,
		onPageChange,
		onQueueTabChange
	}: Props = $props();

	type Tab = 'overview' | 'assets' | 'cluster' | 'iocs' | 'raw' | 'timeline' | 'notes' | 'graph';

	let focusedId = $state<number | null>(null);
	let activeTab = $state<Tab>('overview');
	let rowEls = $state<Record<number, HTMLElement | undefined>>({});
	let showAssignMenu = $state<boolean>(false);

	/**
	 * `now` is sampled once on mount and ticked every 30s rather than read
	 * during render: age labels are used in a dozen places and reading
	 * Date.now() inline would make every one of them a fresh value on any
	 * unrelated re-render (and would differ between SSR and hydration).
	 */
	let now = $state(0);
	onMount(() => {
		now = Date.now();
		const id = setInterval(() => (now = Date.now()), 30_000);
		const onDocClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null;
			if (!target?.closest('.assign-menu-wrap')) {
				showAssignMenu = false;
			}
		};
		document.addEventListener('click', onDocClick, true);
		return () => {
			clearInterval(id);
			document.removeEventListener('click', onDocClick, true);
		};
	});

	// Keep the cursor on a row that still exists after a refresh / page
	// change, but never yank it off a row the analyst deliberately moved to.
	const focusedIndex = $derived(alerts.findIndex((a) => a.alert_id === focusedId));
	const focused = $derived(focusedIndex >= 0 ? alerts[focusedIndex] : undefined);

	$effect(() => {
		if (alerts.length === 0) {
			focusedId = null;
		} else if (!alerts.some((a) => a.alert_id === focusedId)) {
			focusedId = alerts[0].alert_id;
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
	const activity = $derived(activityEntries(focused?.modification_history, 3));
	const techniques = $derived(focused ? techniqueLabels(focused) : []);
	const notes = $derived((focused?.alert_note ?? '').trim());

	const tabs = $derived([
		{ id: 'overview' as Tab, label: 'Overview', count: undefined as number | undefined },
		{ id: 'assets' as Tab, label: 'Assets', count: (focused?.assets?.length ?? 0) > 0 ? focused?.assets?.length : undefined },
		{ id: 'cluster' as Tab, label: 'Cluster', count: cluster?.alert_ids?.length },
		{ id: 'iocs' as Tab, label: 'IOCs', count: iocs.length },
		{ id: 'raw' as Tab, label: 'Raw event', count: undefined },
		{ id: 'timeline' as Tab, label: 'Timeline', count: undefined },
		{ id: 'notes' as Tab, label: 'Notes', count: notes ? 1 : undefined },
		{ id: 'graph' as Tab, label: 'Graph', count: undefined }
	]);

	const allSelected = $derived(
		alerts.length > 0 && alerts.every((a) => selected[a.alert_id] === true)
	);

	// ---- keyboard ----------------------------------------------------

	const move = (delta: number) => {
		if (alerts.length === 0) return;
		const from = focusedIndex >= 0 ? focusedIndex : 0;
		const next = Math.min(alerts.length - 1, Math.max(0, from + delta));
		focusedId = alerts[next].alert_id;
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
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			el.isContentEditable === true
		);
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (!shortcutsEnabled) return;
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

<div class="iris-triage {className}" role="region" aria-label="Alert triage cockpit">
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
				My queue{#if queueCounts?.mine != null}<span class="qtab-count">{queueCounts.mine}</span>{/if}
			</button>
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === 'unassigned'}
				aria-selected={queueTab === 'unassigned'}
				onclick={() => onQueueTabChange('unassigned')}
			>
				Unassigned{#if queueCounts?.unassigned != null}<span class="qtab-count">{queueCounts.unassigned}</span>{/if}
			</button>
			<button
				type="button"
				role="tab"
				class="qtab"
				class:qtab-active={queueTab === 'escalated'}
				aria-selected={queueTab === 'escalated'}
				onclick={() => onQueueTabChange('escalated')}
			>
				Escalated{#if queueCounts?.escalated != null}<span class="qtab-count">{queueCounts.escalated}</span>{/if}
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
					<button type="button" class="btn-filter-add" class:btn-filter-active={filterPanelOpen} onclick={onOpenFilters}>{filterPanelOpen ? 'Hide filters ×' : '+ Filter'}</button>
				{/if}
			</div>
		{/if}

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
			<div class="spacer"></div>
			<button type="button" class="queue-sort" onclick={onToggleSort}>Sort: {sortLabel} ▾</button>
		</div>

		<div class="queue-scroll" role="listbox" aria-label="Alerts" tabindex="-1">
			{#if loading && alerts.length === 0}
				<div class="queue-empty">Loading alerts…</div>
			{:else if alerts.length === 0}
				<div class="queue-empty">No alerts match the current filters.</div>
			{:else}
				{#each alerts as alert (alert.alert_id)}
					{@const isFocused = alert.alert_id === focusedId}
					{@const sev = severityVar(alert.severity?.severity_name)}
					<div
						class="row"
						class:row-focused={isFocused}
						bind:this={rowEls[alert.alert_id]}
					>
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
							onclick={() => (focusedId = alert.alert_id)}
						>
							<span class="sev-bar" style="background:{sev}"></span>

							<span class="row-body">
								<span class="row-meta">
									<span class="row-sev" style="color:{sev}"
										>{alert.severity?.severity_name ?? '—'}</span
									>
									<span class="vrule"></span>
									<span class="row-client">{alert.customer?.customer_name ?? ''}</span>
									<span class="spacer"></span>
									<span class="row-time">{relativeDate(alert.alert_source_event_time, now)}</span>
								</span>

								<span
									class="row-title"
									style="color:{titleVar(alert.status?.status_name, isFocused)}"
									>{alert.alert_title}</span
								>

								<span class="row-chips">
									{#if (alert.clusters?.length ?? 0) > 0}
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
						<div class="assign-menu-wrap">
							<button
								type="button"
								class="btn-outline"
								onclick={() => (showAssignMenu = !showAssignMenu)}
								aria-haspopup="true"
								aria-expanded={showAssignMenu}
							>Assign ▾</button>
							{#if showAssignMenu}
								<div class="assign-dropdown" role="menu">
									<button
										type="button"
										class="assign-item"
										role="menuitem"
										onclick={() => { onAssignToMe(f); showAssignMenu = false; }}
									>Assign to me</button>
									<button
										type="button"
										class="assign-item"
										role="menuitem"
										onclick={() => { onAssign(f); showAssignMenu = false; }}
									>Assign to…</button>
								</div>
							{/if}
						</div>
						<button type="button" class="btn-outline btn-muted" onclick={() => onClose(f)}
							>Close</button
						>
					</div>
				</div>

				<h2 class="detail-title">{f.alert_title}</h2>

				<div class="detail-chips">
					{#if cluster}
						<button type="button" class="chip-cluster chip-lg" onclick={() => cluster && onOpenCluster(cluster.cluster_id)}>
							<span class="chip-glyph">◈</span>
							<span>Cluster: {clusterLabel}</span>
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
						onclick={() => (activeTab = tab.id)}
					>
						{tab.label}{#if tab.count !== undefined}<span class="tab-count">{tab.count}</span>{/if}
					</button>
				{/each}
			</div>

			{#if activeTab === 'graph'}
				<div class="graph-pane">
					<AlertRelatedGraph alertId={f.alert_id} />
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
													{[a.asset_type?.asset_name, a.asset_ip, a.asset_domain].filter(Boolean).join(' · ')}
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
											<div class="asset-name">{a.asset_name}</div>
											<div class="asset-meta">
												{[a.asset_type?.asset_name, a.asset_ip, a.asset_domain]
													.filter(Boolean)
													.join(' · ')}
											</div>
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
											<span class="cluster-time">{clockTime(member.alert_source_event_time)}</span>
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
											>Promote all {cluster.alert_ids?.length ?? clusterMembers.length} to one case →</button
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
											<span class="tl-time">{new Date(entry.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
								<span
									class="side-mono"
									style="color:{ageVar(f.alert_source_event_time, now)}"
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
								Clustered with {(cluster.alert_ids?.length ?? 1) - 1} other alert{(cluster.alert_ids
									?.length ?? 1) -
									1 ===
								1
									? ''
									: 's'} by <span class="side-strong">{cluster.source_rule?.rule_name ?? 'a correlation rule'}</span>.
							</p>
							<button type="button" class="side-link" onclick={() => cluster && onOpenCluster(cluster.cluster_id)}
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

	.queue-sort {
		font-size: 12px;
		color: var(--t-9);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.queue-sort:hover {
		color: var(--t-6);
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

	.assign-menu-wrap {
		position: relative;
	}
	.assign-dropdown {
		position: absolute;
		top: calc(100% + 5px);
		right: 0;
		z-index: 200;
		min-width: 140px;
		background: var(--s-card);
		border: 1px solid var(--b-4);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.assign-item {
		padding: 9px 13px;
		font-size: 13px;
		font-family: inherit;
		color: var(--t-1);
		background: none;
		border: 0;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}
	.assign-item:hover {
		background: var(--s-hover);
		color: var(--t-1);
	}
	.assign-item + .assign-item {
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
	.cluster-title {
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
</style>
