<!--
  War-room "Board" tab: one-glance status of every attached case.

  KPIs (each a link into its section), the status flags over every
  asset the caller can see, one card per attached case with its flag
  counts, the open decisions and the computed "Needs attention"
  list. Cases the caller cannot read are shown as
  locked cards (the backend only sends their id). Refreshes every 60 s
  while the tab is visible.
-->
<script lang="ts">
	import { AiSuggestionsChip, AiSuggestionsPanel } from '$lib/components/ai-suggestions';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { canReadVulnerabilities } from '$lib/components/vulnerabilities/permissions';
	import { page } from '$app/state';
	import {
		ArrowRight,
		BadgeAlert,
		Building2,
		CalendarClock,
		CircleAlert,
		Flame,
		Gavel,
		LayoutDashboard,
		ListChecks,
		Lock,
		RefreshCw,
		Server,
		ShieldOff,
		ShieldX,
		Siren,
		Timer,
		Unplug,
		UserRound
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime, formatTime } from '$lib/utils/time-formatter';
	import { assetFlagDotClass, sortAssetFlags } from '$lib/services/asset-flags.service';
	import {
		WarRoomBoardService,
		boardFlagCounts,
		type BoardFlagCount,
		boardVulnerabilityHrefFor,
		boardVulnerabilityKpis,
		type WarRoomBoard,
		type WarRoomBoardAttention,
		type WarRoomBoardCase
	} from '$lib/services/war-room-board.service';
	import { formatDecisionTarget } from '$lib/services/war-room-decisions.service';

	const REFRESH_MS = 60_000;

	const warRoomId = $derived(Number(page.params.war_room_id));

	let board = $state<WarRoomBoard | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const load = async (silent = false) => {
		if (refreshing) return;
		refreshing = true;
		if (!silent) loading = board === null;
		const res = await WarRoomBoardService.get(warRoomId);
		refreshing = false;
		loading = false;
		if (res.ok && res.data && typeof res.data === 'object') {
			board = res.data as WarRoomBoard;
		} else if (!silent) {
			const data = res.data as { message?: unknown } | string | null;
			toast({
				title: 'Could not load the board',
				description:
					data && typeof data === 'object' && typeof data.message === 'string'
						? data.message
						: (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
	};

	const onVisibility = () => {
		if (document.visibilityState === 'visible') void load(true);
	};

	onMount(() => {
		void load();
		timer = setInterval(() => {
			if (document.visibilityState === 'visible') void load(true);
		}, REFRESH_MS);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibility);
		}
	});

	const flags = $derived(sortAssetFlags(board?.flags ?? []));

	// Flags over every visible asset: sum of the per-case maps.
	const totalByFlag = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const c of board?.cases ?? []) {
			if (!c.accessible || !c.by_flag) continue;
			for (const [k, v] of Object.entries(c.by_flag)) out[k] = (out[k] ?? 0) + (Number(v) || 0);
		}
		return out;
	});
	const kpis = $derived(board?.kpis ?? null);
	const flagTotals = $derived(boardFlagCounts(totalByFlag, flags, kpis?.assets ?? 0));
	// The backend omits the vulnerability KPIs and attention items without
	// `vulnerabilities_read`; the UI gate also keeps the links to the scope
	// Vulnerabilities tab away from those users.
	const userCtx = getContext<UserCtx>(USER_CTX);
	const canReadVulns = $derived(canReadVulnerabilities(userCtx));
	const vulnKpis = $derived(boardVulnerabilityKpis(kpis, canReadVulns));
	const decisions = $derived(board?.decisions ?? []);
	// Re-evaluated on each refresh so "in 3 h" / "overdue by" stay current.
	const now = $derived(board?.generated_at ? Date.now() : 0);
	const donePct = $derived(
		kpis && kpis.assets > 0 ? Math.round((kpis.done / kpis.assets) * 100) : 0
	);

	const sortedCases = $derived.by<WarRoomBoardCase[]>(() => {
		const list = [...(board?.cases ?? [])];
		// Readable cases first (most compromised first), locked ones last.
		return list.sort((a, b) => {
			if (a.accessible !== b.accessible) return a.accessible ? -1 : 1;
			return (b.assets_compromised ?? 0) - (a.assets_compromised ?? 0) || a.case_id - b.case_id;
		});
	});

	const attentionDot: Record<string, string> = {
		high: 'bg-red-500',
		medium: 'bg-amber-500',
		low: 'bg-slate-400'
	};

	const attentionIcon = (type: string) => {
		switch (type) {
			case 'compromised_unflagged':
				return Unplug;
			case 'exception_without_decision':
				return ShieldOff;
			case 'decision_overdue':
			case 'decision_due_soon':
				return Timer;
			case 'decision_pending_vote':
			case 'decision_pending_approval':
			case 'decision_pending_implementation':
				return Gavel;
			case 'vulnerability_exploited_open':
				return Flame;
			case 'vulnerability_overdue':
				return CalendarClock;
			default:
				return CircleAlert;
		}
	};

	const attentionLink = (a: WarRoomBoardAttention): { href: string; label: string } | null => {
		const vulnerabilityHref = boardVulnerabilityHrefFor(a, canReadVulns);
		if (vulnerabilityHref) return { href: vulnerabilityHref, label: 'Review' };
		if (a.decision_id != null) {
			return { href: `/war-rooms/${warRoomId}/decisions?d=${a.decision_id}`, label: 'Review' };
		}
		if (a.case_id != null && a.asset_id != null) {
			return { href: `/case/${a.case_id}/assets/${a.asset_id}`, label: 'Open' };
		}
		if (a.task_id != null) return { href: `/war-rooms/${warRoomId}/tasks`, label: 'Open' };
		if (a.case_id != null) return { href: `/case/${a.case_id}`, label: 'Open' };
		return null;
	};

	const section = (path: string, query = '') =>
		`/war-rooms/${warRoomId}/${path}${query ? `?${query}` : ''}`;

	const flagHref = (key: string): string | null =>
		key === 'other' ? null : section('scope', `flag=${key}`);

	const flagDot = (f: BoardFlagCount): string =>
		f.key === 'none' ? 'bg-muted-foreground/25' : assetFlagDotClass(f.color);

	const decisionStatusCls = (status: string): string =>
		status === 'approved'
			? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
			: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';

	const caseStateCls = (c: WarRoomBoardCase): string =>
		(c.state_name ?? '').toLowerCase() === 'closed'
			? 'border-muted bg-muted/60 text-muted-foreground'
			: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200';
</script>

{#snippet doneBar(done: number, total: number, height: string)}
	{@const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0}
	<div
		class={['flex w-full overflow-hidden rounded-full bg-muted', height]}
		role="img"
		aria-label={total > 0 ? `${done} of ${total} assets done` : 'No assets'}
	>
		<span class="h-full bg-emerald-500" style:width={`${pct}%`}></span>
	</div>
{/snippet}

<div class="h-full w-full overflow-y-auto bg-background">
	<div class="mx-auto flex max-w-[1680px] flex-col gap-4 p-4 sm:p-5">
		<div class="flex flex-wrap items-center gap-3">
			<div>
				<h1 class="text-lg font-semibold leading-tight">Board</h1>
				<p class="text-xs text-muted-foreground">
					{#if kpis}
						{kpis.cases}
						{kpis.cases === 1 ? 'case' : 'cases'}
						{#if kpis.cases_accessible !== kpis.cases}
							({kpis.cases_accessible} visible to you)
						{/if}
						·
					{/if}
					{#if board?.generated_at}
						updated {formatTime(board.generated_at)} · refreshes every minute
					{:else}
						refreshes every minute
					{/if}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<AiSuggestionsChip entityType="war_room" entityId={warRoomId} />
				<Button
					size="sm"
					variant="outline"
					onclick={() => load()}
					disabled={refreshing}
					aria-label="Refresh board"
				>
					<RefreshCw class={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
				</Button>
			</div>
		</div>

		<AiSuggestionsPanel
			entityType="war_room"
			entityId={warRoomId}
			class="bg-card"
			hideWhenNoneOpen
		/>

		{#if loading}
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				{#each Array(5) as _}
					<Skeleton class="h-24 w-full" />
				{/each}
			</div>
			<Skeleton class="h-64 w-full" />
		{:else if !board || !kpis}
			<div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
				<p class="text-sm text-muted-foreground">The board could not be loaded.</p>
				<Button variant="outline" size="sm" onclick={() => load()}>Retry</Button>
			</div>
		{:else}
			<!-- KPIs -->
			<div
				class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]"
				data-testid="board-kpis"
			>
				{@render kpi(
					'Compromised',
					kpis.compromised,
					`${kpis.unflagged} ${kpis.unflagged === 1 ? 'asset' : 'assets'} without a flag`,
					Unplug,
					kpis.compromised > 0 ? 'text-red-600 dark:text-red-400' : '',
					section('scope', 'compromised=1')
				)}
				{@render kpi(
					'Open decisions',
					kpis.decisions_open,
					kpis.decisions_overdue > 0
						? `${kpis.decisions_overdue} overdue · ${kpis.decisions_due_24h} due in 24 h`
						: `${kpis.decisions_due_24h} due in 24 h`,
					Gavel,
					kpis.decisions_overdue > 0
						? 'text-red-600 dark:text-red-400'
						: kpis.decisions_open > 0
							? 'text-amber-600 dark:text-amber-400'
							: '',
					section('decisions')
				)}
				{@render kpi(
					'Exceptions',
					kpis.exceptions,
					kpis.exceptions > 0 ? 'Assets with an exception flag' : 'None',
					ShieldOff,
					kpis.exceptions > 0 ? 'text-amber-600 dark:text-amber-400' : '',
					section('scope', 'view=board')
				)}
				{@render kpi(
					'Open tasks',
					kpis.tasks_open,
					'War-room tasks',
					ListChecks,
					'',
					section('tasks')
				)}
				<div
					class="shadow-elevation-1 rounded-xl border border-border/60 bg-card p-4 sm:col-span-2 xl:col-span-1"
				>
					<div class="flex items-center justify-between text-xs font-medium text-muted-foreground">
						Flags · {kpis.assets}
						{kpis.assets === 1 ? 'asset' : 'assets'}
						<a
							href={section('scope', 'view=board')}
							class="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Scope <ArrowRight class="h-3 w-3" />
						</a>
					</div>
					<div class="mt-1.5 flex items-baseline gap-2">
						<span class="text-2xl font-semibold tabular-nums">{donePct}%</span>
						<span class="text-2xs text-muted-foreground">done</span>
					</div>
					<div class="mt-2">{@render doneBar(kpis.done, kpis.assets, 'h-2')}</div>
					{#if flagTotals.length}
						<ul
							class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground"
							data-testid="board-flag-totals"
						>
							{#each flagTotals as s (s.key)}
								{@const href = flagHref(s.key)}
								<li>
									<svelte:element
										this={href ? 'a' : 'span'}
										{href}
										class={[
											'inline-flex items-center gap-1 rounded',
											href && 'hover:text-foreground hover:underline'
										]}
										title={`${s.label}: ${s.count} (${Math.round(s.pct)}% of the assets)`}
									>
										<span class={['h-2 w-2 rounded-full', flagDot(s)]}></span>
										{s.label}
										<span class="tabular-nums text-foreground">{s.count}</span>
									</svelte:element>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			{#if vulnKpis}
				<!-- Vulnerability KPIs -->
				<div
					class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
					data-testid="board-vuln-kpis"
				>
					{@render kpi(
						'Open vulnerabilities',
						vulnKpis.open,
						'Open findings on case assets',
						ShieldX,
						vulnKpis.open > 0 ? 'text-amber-600 dark:text-amber-400' : '',
						section('scope', 'tab=vulnerabilities')
					)}
					{@render kpi(
						'Exploited & open',
						vulnKpis.exploitedOpen,
						vulnKpis.exploitedOpen > 0
							? 'Exploited and not fixed yet'
							: 'No exploited finding left open',
						Flame,
						vulnKpis.exploitedOpen > 0 ? 'text-red-600 dark:text-red-400' : '',
						section('scope', 'vulnerable=exploited'),
						vulnKpis.exploitedOpen > 0
					)}
					{@render kpi(
						'Overdue',
						vulnKpis.overdue,
						'Open findings past their due date',
						CalendarClock,
						vulnKpis.overdue > 0 ? 'text-amber-600 dark:text-amber-400' : '',
						section('scope', 'tab=vulnerabilities')
					)}
					{@render kpi(
						'KEV open',
						vulnKpis.kevOpen,
						'Open findings listed in CISA KEV',
						BadgeAlert,
						vulnKpis.kevOpen > 0 ? 'text-red-600 dark:text-red-400' : '',
						section('scope', 'tab=vulnerabilities')
					)}
					{@render kpi(
						'Vulnerable assets',
						vulnKpis.vulnerableAssets,
						'Assets with an open finding',
						Server,
						'',
						section('scope', 'vulnerable=open')
					)}
				</div>
			{/if}

			<div class="grid gap-4 xl:grid-cols-3">
				<!-- Cases -->
				<section
					class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card xl:col-span-2"
					aria-labelledby="board-cases-title"
				>
					<header class="flex items-center gap-2 border-b px-4 py-2.5">
						<LayoutDashboard class="h-4 w-4 text-muted-foreground" />
						<h3 id="board-cases-title" class="text-sm font-semibold">Cases</h3>
						<span class="ml-auto text-2xs text-muted-foreground">Assets by flag</span>
					</header>
					{#if sortedCases.length === 0}
						<p class="py-8 text-center text-xs text-muted-foreground">
							No case attached to this war room yet.
						</p>
					{:else}
						<div class="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
							{#each sortedCases as c (c.case_id)}
								{#if !c.accessible}
									<article
										class="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground"
										data-testid="board-case-locked"
									>
										<Lock class="h-4 w-4 shrink-0" />
										<span class="font-mono text-xs">#{c.case_id}</span>
										<span class="truncate">Restricted case — you don't have access</span>
									</article>
								{:else}
									{@const caseFlags = boardFlagCounts(c.by_flag, flags, c.assets_total ?? 0)}
									<article
										class="hover:shadow-elevation-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow"
										data-testid="board-case"
									>
										<div class="flex items-start gap-2">
											<div class="min-w-0 flex-1">
												<a
													href={`/case/${c.case_id}`}
													class="block truncate text-sm font-semibold leading-tight hover:underline"
												>
													<span class="font-mono text-xs font-normal text-muted-foreground"
														>#{c.case_id}</span
													>
													{c.case_name ?? ''}
												</a>
												<p
													class="mt-0.5 flex items-center gap-1 truncate text-2xs text-muted-foreground"
												>
													{#if c.customer_name}
														<Building2 class="h-3 w-3" />{c.customer_name}
													{/if}
													{#if c.owner_name}
														<span>·</span><UserRound class="h-3 w-3" />{c.owner_name}
													{/if}
												</p>
											</div>
											<div class="flex shrink-0 flex-col items-end gap-1">
												{#if c.state_name}
													<span
														class={[
															'rounded-md border px-1.5 py-0.5 text-2xs font-medium',
															caseStateCls(c)
														]}>{c.state_name}</span
													>
												{/if}
												{#if c.severity_name}
													<span class="text-2xs text-muted-foreground">{c.severity_name}</span>
												{/if}
											</div>
										</div>
										<div class="mt-3">
											{@render doneBar(c.by_kind?.done ?? 0, c.assets_total ?? 0, 'h-1.5')}
											<div class="mt-1 flex justify-between text-2xs text-muted-foreground">
												<span>
													<span class="font-medium tabular-nums text-foreground"
														>{c.by_kind?.done ?? 0}/{c.assets_total ?? 0}</span
													>
													done
												</span>
												<span>{c.assets_compromised ?? 0} compromised</span>
											</div>
										</div>
										<div class="mt-2.5 flex items-center gap-3 text-2xs text-muted-foreground">
											<a
												href={`/case/${c.case_id}/assets`}
												class="inline-flex items-center gap-1 hover:text-foreground"
												title="Assets"
											>
												<Server class="h-3 w-3" />{c.assets_total ?? 0}
											</a>
											<span class="inline-flex items-center gap-1" title="Open tasks">
												<ListChecks class="h-3 w-3" />{c.tasks_open ?? 0} open
											</span>
											{#if (c.by_kind?.exception ?? 0) > 0}
												<span
													class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
													title="Assets with an exception flag"
												>
													<ShieldOff class="h-3 w-3" />{c.by_kind?.exception}
												</span>
											{/if}
										</div>
										{#if caseFlags.length}
											<ul
												class="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 text-2xs text-muted-foreground"
											>
												{#each caseFlags as s (s.key)}
													<li class="inline-flex items-center gap-1">
														<span class={['h-1.5 w-1.5 rounded-full', flagDot(s)]}></span>
														{s.label}
														{s.count}
													</li>
												{/each}
											</ul>
										{/if}
									</article>
								{/if}
							{/each}
						</div>
					{/if}
				</section>

				<div class="flex min-w-0 flex-col gap-4">
					<!-- Open decisions -->
					<section
						class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
						aria-labelledby="board-decisions-title"
						data-testid="board-decisions"
					>
						<header class="flex items-center gap-2 border-b px-4 py-2.5">
							<Gavel class="h-4 w-4 text-muted-foreground" />
							<h3 id="board-decisions-title" class="text-sm font-semibold">Open decisions</h3>
							<span
								class="rounded-full bg-amber-500/15 px-1.5 text-2xs font-medium tabular-nums text-amber-700 dark:text-amber-300"
								>{decisions.length}</span
							>
							<a
								href={section('decisions')}
								class="ml-auto inline-flex items-center gap-1 text-2xs text-primary hover:underline"
							>
								All decisions <ArrowRight class="h-3 w-3" />
							</a>
						</header>
						{#if decisions.length === 0}
							<p class="py-6 text-center text-xs text-muted-foreground">No open decision.</p>
						{:else}
							<ul class="max-h-80 divide-y overflow-y-auto">
								{#each decisions as d (d.decision_id)}
									<li>
										<a
											href={section('decisions', `d=${d.decision_id}`)}
											class="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50"
											data-testid="board-decision"
										>
											<span class="mt-0.5 shrink-0 font-mono text-2xs text-muted-foreground"
												>{d.ref}</span
											>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-medium" title={d.title}>{d.title}</p>
												<p
													class="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground"
												>
													{#if d.target_at}
														<span
															class={[
																'inline-flex items-center gap-1',
																d.overdue && 'font-medium text-red-600 dark:text-red-400',
																d.due_soon && 'text-amber-700 dark:text-amber-300'
															]}
															title={formatDateTime(d.target_at)}
														>
															<Timer class="h-3 w-3" />{formatDecisionTarget(d.target_at, now)}
														</span>
													{:else}
														<span>No target date</span>
													{/if}
													{#if d.status === 'proposed' && d.pending_approvers > 0}
														<span>· {d.pending_approvers} vote(s) pending</span>
													{/if}
												</p>
											</div>
											<span
												class={[
													'shrink-0 rounded-md border px-1.5 py-0.5 text-2xs font-medium capitalize',
													decisionStatusCls(d.status)
												]}>{d.status}</span
											>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</section>

					<!-- Needs attention -->
					<section
						class="shadow-elevation-1 flex min-h-0 flex-col rounded-xl border border-border/60 bg-card"
						aria-labelledby="board-attention-title"
						data-testid="board-attention"
					>
						<header class="flex items-center gap-2 border-b px-4 py-2.5">
							<Siren class="h-4 w-4 text-muted-foreground" />
							<h3 id="board-attention-title" class="text-sm font-semibold">Needs attention</h3>
							<span
								class="ml-auto rounded-full bg-red-500/15 px-1.5 text-2xs font-medium tabular-nums text-red-700 dark:text-red-300"
								>{board.attention.length}</span
							>
						</header>
						{#if board.attention.length === 0}
							<p class="py-8 text-center text-xs text-muted-foreground">Nothing needs attention.</p>
						{:else}
							<ul class="divide-y">
								{#each board.attention as a, i (`${a.type}:${a.case_id ?? ''}:${a.asset_id ?? ''}:${a.decision_id ?? ''}:${a.task_id ?? ''}:${i}`)}
									{@const Icon = attentionIcon(a.type)}
									{@const link = attentionLink(a)}
									<li class="flex items-start gap-3 px-4 py-2.5" data-testid="board-attention-item">
										<span
											class={[
												'mt-1.5 h-2 w-2 shrink-0 rounded-full',
												attentionDot[a.severity] ?? 'bg-slate-400'
											]}
											aria-label={`${a.severity} priority`}
										></span>
										<div class="min-w-0 flex-1">
											<p class="flex items-center gap-1.5 text-sm font-medium">
												<Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
												<span class="min-w-0 break-words">{a.label}</span>
											</p>
											{#if a.case_id != null}
												<p class="truncate text-xs text-muted-foreground">Case #{a.case_id}</p>
											{/if}
										</div>
										{#if link}
											<a
												href={link.href}
												class="shrink-0 rounded-md border px-2 py-1 text-2xs font-medium hover:bg-muted"
												>{link.label}</a
											>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						{#if board.generated_at}
							<p class="border-t px-4 py-2 text-2xs text-muted-foreground">
								Computed {formatDateTime(board.generated_at)}
							</p>
						{/if}
					</section>
				</div>
			</div>
		{/if}
		<div class="h-12"></div>
	</div>
</div>

{#snippet kpi(
	label: string,
	value: number,
	sub: string,
	Icon: typeof Unplug,
	tone: string,
	href: string,
	alert: boolean = false
)}
	<a
		{href}
		class={[
			'shadow-elevation-1 hover:shadow-elevation-2 group block rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			alert
				? 'border-red-500/50 bg-red-500/10 hover:border-red-500/80 dark:bg-red-500/15'
				: 'border-border/60 bg-card hover:border-ring/40'
		]}
		aria-label={`${label}: ${value}. ${sub}. Open`}
		data-testid="board-kpi"
	>
		<div class="flex items-center justify-between text-xs font-medium text-muted-foreground">
			{label}
			<Icon class={`h-4 w-4 ${tone}`} />
		</div>
		<div class={['mt-1.5 text-2xl font-semibold tabular-nums', tone]}>{value}</div>
		<div class="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
			<span class="min-w-0 flex-1 truncate" title={sub}>{sub}</span>
			<ArrowRight
				class="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
				aria-hidden="true"
			/>
		</div>
	</a>
{/snippet}
