<!--
  Incident detail. Mirrors the case-detail visual language: white
  workspace, tabs as an underline strip on top of a bordered content
  region, no card-in-card nesting. Sections use plain borders on the
  workspace background — the analyst sees one continuous canvas, not
  a stack of little cards.

  Tabs are content-only (no duplicate "Overview") — the header strip
  already summarises status/severity/owner, so the tabs cover the
  distinct evidence groups: Alerts, Assets, IOCs, Timeline, Activity.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		AlignLeftIcon,
		ArrowUpRightIcon,
		BookmarkIcon,
		BuildingIcon,
		CheckSquareIcon,
		ClockIcon,
		FingerprintIcon,
		FlameIcon,
		HardDriveIcon,
		HistoryIcon,
		LayersIcon,
		MessageSquareIcon,
		SendHorizonalIcon,
		ShieldAlertIcon,
		TrashIcon
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Loading } from '$lib/components/ui/loading';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import IncidentInvestigationFlowPanel from './IncidentInvestigationFlowPanel.svelte';
	import { IncidentsService } from '$lib/services/incidents.service';
	import { AlertService } from '$lib/services/alerts.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import {
		IncidentStatusService,
		type IncidentStatus
	} from '$lib/services/incident-status.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import type { Incident } from '$lib/types/resources/incident';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	const incidentId = Number(page.params.incident_id);

	let incident = $state<Incident | null>(null);
	let alerts = $state<Alert[]>([]);
	let comments = $state<Comment[]>([]);
	let statuses = $state<IncidentStatus[]>([]);
	let severities = $state<Severity[]>([]);
	let users = $state<User[]>([]);
	let loading = $state(true);
	let flowPanelOpen = $state(false);
	let commentDraft = $state('');
	let posting = $state(false);
	let activeTab = $state<'alerts' | 'assets' | 'iocs' | 'timeline' | 'activity'>('alerts');

	const isEscalated = $derived(!!incident?.incident_case_id);

	// Aggregated across every member alert.
	const iocs = $derived<Ioc[]>(dedupeIocs(alerts));
	const assets = $derived<Asset[]>(dedupeAssets(alerts));

	function dedupeIocs(list: Alert[]): Ioc[] {
		const seen = new Map<string, Ioc>();
		for (const alert of list) {
			for (const ioc of alert.iocs ?? []) {
				const key = `${ioc.ioc_value}|${ioc.ioc_type_id ?? ''}`;
				if (!seen.has(key)) seen.set(key, ioc);
			}
		}
		return Array.from(seen.values());
	}

	function dedupeAssets(list: Alert[]): Asset[] {
		const seen = new Map<number, Asset>();
		for (const alert of list) {
			for (const asset of alert.assets ?? []) {
				if (!seen.has(asset.asset_id)) seen.set(asset.asset_id, asset);
			}
		}
		return Array.from(seen.values());
	}

	const severityLabel = (id?: number | null) => {
		if (!id) return 'Unspecified';
		return severities.find((s) => s.severity_id === id)?.severity_name ?? 'Unspecified';
	};

	const severityChip = (name: string) => {
		switch (name.toLowerCase()) {
			case 'critical':
				return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
			case 'high':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
			case 'medium':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
			case 'low':
			case 'informational':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};

	const statusChip = (name: string) => {
		switch (name.toLowerCase()) {
			case 'open':
				return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300';
			case 'investigating':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
			case 'dismissed':
				return 'bg-muted text-muted-foreground';
			case 'escalated':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};

	const load = async () => {
		loading = true;
		try {
			const res = await IncidentsService.get(incidentId);
			incident =
				res.data && typeof res.data === 'object' ? (res.data as Incident) : null;
			if (incident && incident.alert_ids?.length) {
				const fetched = await Promise.all(
					incident.alert_ids.map(async (id) => {
						const r = await AlertService.get(id);
						return r.data && typeof r.data === 'object' ? (r.data as Alert) : null;
					})
				);
				alerts = fetched.filter((a): a is Alert => !!a);
			} else {
				alerts = [];
			}
			await loadComments();
		} finally {
			loading = false;
		}
	};

	const loadComments = async () => {
		const res = await CommentsService.list('incidents', incidentId, { per_page: 200 });
		const payload = res.data && typeof res.data === 'object' ? res.data : null;
		if (payload && Array.isArray((payload as { data?: Comment[] }).data)) {
			comments = ((payload as { data: Comment[] }).data ?? []).slice().sort((a, b) => {
				return new Date(a.comment_date).getTime() - new Date(b.comment_date).getTime();
			});
		} else {
			comments = [];
		}
	};

	const removeAlert = async (alertId: number) => {
		if (!incident) return;
		await IncidentsService.removeAlert(incident.incident_id, alertId);
		await load();
	};

	const escalate = async () => {
		if (!incident) return;
		const res = await IncidentsService.escalate(incident.incident_id, {
			case_title: incident.incident_title,
			note: incident.incident_description ?? undefined
		});
		const payload = res.data && typeof res.data === 'object' ? res.data : null;
		if (payload && 'case_id' in payload && payload.case_id) {
			goto(`/case/${payload.case_id}`);
		}
	};

	const updateField = async (patch: Record<string, unknown>) => {
		if (!incident) return;
		try {
			await IncidentsService.update(incident.incident_id, patch);
			await load();
		} catch {
			toast({ title: 'Update failed', variant: 'destructive' });
		}
	};

	const postComment = async () => {
		const text = commentDraft.trim();
		if (!text || posting) return;
		posting = true;
		try {
			await CommentsService.create('incidents', incidentId, { comment_text: text });
			commentDraft = '';
			await loadComments();
			await IncidentsService.get(incidentId).then((r) => {
				if (r.data && typeof r.data === 'object') incident = r.data as Incident;
			});
		} catch {
			toast({ title: 'Comment failed', variant: 'destructive' });
		} finally {
			posting = false;
		}
	};

	type TimelineEntry = {
		ts: number;
		kind: 'alert' | 'history' | 'comment';
		title: string;
		detail?: string;
		actor?: string;
	};
	const timeline = $derived<TimelineEntry[]>(buildTimeline());

	function buildTimeline(): TimelineEntry[] {
		const out: TimelineEntry[] = [];
		for (const alert of alerts) {
			out.push({
				ts: new Date(alert.alert_creation_time).getTime(),
				kind: 'alert',
				title: `Alert #${alert.alert_id} — ${alert.alert_title}`,
				detail: `${alert.severity?.severity_name ?? '?'} · ${alert.alert_source}`
			});
		}
		const history = incident?.modification_history ?? null;
		if (history) {
			for (const [key, entry] of Object.entries(history)) {
				const ts = Number(key);
				if (!Number.isFinite(ts)) continue;
				out.push({
					ts: ts * 1000,
					kind: 'history',
					title: entry.action,
					actor: entry.user
				});
			}
		}
		for (const c of comments) {
			out.push({
				ts: new Date(c.comment_date).getTime(),
				kind: 'comment',
				title: c.comment_text,
				actor: c.user?.user_name
			});
		}
		return out.sort((a, b) => a.ts - b.ts);
	}

	onMount(async () => {
		void IncidentStatusService.list().then((r) => {
			if (r.data && typeof r.data === 'object') {
				statuses = (r.data as { data?: IncidentStatus[] }).data ?? [];
			}
		});
		void SeveritiesService.list().then((r) => {
			if (r.data && typeof r.data === 'object') {
				severities = (r.data as { data?: Severity[] }).data ?? [];
			}
		});
		void UsersService.list().then((r) => {
			if (r.data && typeof r.data === 'object') {
				users = ((r.data as { data?: User[] }).data ?? []).filter(
					(u) => u.user_active !== false
				);
			}
		});
		await load();
	});
</script>

<svelte:head>
	<title>Incident #{incidentId}</title>
</svelte:head>

<!--
  Workspace layout — matches the case-detail chrome: an outer padded
  wrapper on the muted app background, and the actual workspace is a
  white `bg-card` rounded panel with a border and elevation shadow.
  Header/tabs stay pinned inside the workspace; the tab-content region
  owns its own scroll.
-->
<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
	>
		{#if loading}
			<div class="p-6">
				<Loading />
			</div>
		{:else if !incident}
			<p class="p-6">Not found.</p>
		{:else}
			<!-- ============================================================
				 Header strip — flat white area, no card. Title row, then a
				 thin metadata row, then a fields row (status/severity/owner).
				 ============================================================ -->
			<header class="shrink-0 border-b bg-card px-6 pt-5 pb-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="flex min-w-0 items-start gap-3">
						<div class="mt-0.5 rounded-md bg-red-50 p-2 text-red-500 dark:bg-red-900/20">
							<ShieldAlertIcon class="h-5 w-5" />
						</div>
						<div class="min-w-0">
							<h1 class="truncate text-xl font-semibold tracking-tight">
								<span class="text-muted-foreground">#{incident.incident_id}</span>
								— {incident.incident_title}
							</h1>
							<p
								class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
							>
								<span class="inline-flex items-center gap-1">
									<ClockIcon class="h-3 w-3" />
									Opened {mediumDateTimeFormatter(new Date(incident.incident_creation_time))}
								</span>
								{#if incident.customer?.customer_name}
									<span class="inline-flex items-center gap-1">
										<BuildingIcon class="h-3 w-3" />
										{incident.customer.customer_name}
									</span>
								{/if}
								{#if incident.source_rule}
									<a
										class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
										href="/settings/incident-rules"
										title="Created by rule"
									>
										<BookmarkIcon class="h-3 w-3" />
										Rule: {incident.source_rule.rule_name}
									</a>
								{/if}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						{#if incident.investigation_flow}
							<Button
								variant="outline"
								size="sm"
								onclick={() => (flowPanelOpen = !flowPanelOpen)}
							>
								<CheckSquareIcon class="mr-2 h-4 w-4" />
								Flow: {incident.investigation_flow.flow_name}
							</Button>
						{/if}
						{#if !isEscalated}
							<Button onclick={escalate} disabled={alerts.length === 0}>
								<ArrowUpRightIcon class="mr-2 h-4 w-4" /> Escalate to case
							</Button>
						{:else}
							<Button variant="outline" onclick={() => goto(`/case/${incident?.incident_case_id}`)}>
								Open linked case #{incident.incident_case_id}
							</Button>
						{/if}
					</div>
				</div>

				<!-- Inline editors row: status, severity, owner. Kept flat
					 (no boxes) — labels above values, aligned in a 3-column
					 grid so the eye lands on the current value first. -->
				<div class="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
					<div class="flex flex-col gap-1.5">
						<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
							Status
						</span>
						<div class="flex items-center gap-2">
							<span
								class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusChip(
									incident.status?.status_name ?? ''
								)}"
							>
								{incident.status?.status_name ?? '—'}
							</span>
							{#if !isEscalated}
								<Select
									value={String(incident.incident_status_id)}
									onValueChange={(v) => updateField({ incident_status_id: Number(v) })}
									type="single"
								>
									<SelectTrigger class="h-7 w-auto min-w-[130px] text-xs">
										Change
									</SelectTrigger>
									<SelectContent>
										{#each statuses as s (s.status_id)}
											<SelectItem value={String(s.status_id)}>{s.status_name}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
							{/if}
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
							Severity
						</span>
						<div class="flex items-center gap-2">
							<span
								class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium {severityChip(
									severityLabel(incident.incident_severity_id)
								)}"
							>
								<FlameIcon class="h-3 w-3" />
								{severityLabel(incident.incident_severity_id)}
							</span>
							{#if !isEscalated}
								<Select
									value={String(incident.incident_severity_id ?? '')}
									onValueChange={(v) =>
										updateField({ incident_severity_id: v === '' ? null : Number(v) })}
									type="single"
								>
									<SelectTrigger class="h-7 w-auto min-w-[130px] text-xs">
										Change
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">Unspecified</SelectItem>
										{#each severities as s (s.severity_id)}
											<SelectItem value={String(s.severity_id)}>{s.severity_name}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
							{/if}
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
							Owner
						</span>
						<div class="flex items-center gap-2">
							{#if incident.owner}
								<UserAvatar
									userId={incident.owner.id}
									name={incident.owner.user_name}
									size="size-6"
								/>
								<span class="text-sm">{incident.owner.user_name}</span>
							{:else}
								<span class="text-sm italic text-muted-foreground">Unassigned</span>
							{/if}
							{#if !isEscalated}
								<Select
									value={String(incident.incident_owner_id ?? '')}
									onValueChange={(v) =>
										updateField({ incident_owner_id: v === '' ? null : Number(v) })}
									type="single"
								>
									<SelectTrigger class="h-7 w-auto min-w-[130px] text-xs">
										Assign
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">Unassigned</SelectItem>
										{#each users as u (u.user_id)}
											<SelectItem value={String(u.user_id)}
												>{u.user_name} ({u.user_login})</SelectItem
											>
										{/each}
									</SelectContent>
								</Select>
							{/if}
						</div>
					</div>
				</div>

				<!-- Description sits under the fields row in the same
					 header block — one continuous strip, no card nesting.
					 Kept subdued (muted foreground) so the title still
					 dominates. -->
				{#if incident.incident_description}
					<div class="mt-4 flex items-start gap-2 text-sm text-foreground/80">
						<AlignLeftIcon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						<p class="whitespace-pre-wrap">{incident.incident_description}</p>
					</div>
				{/if}
			</header>

			<!-- ============================================================
				 Tabs — case-style: underline strip, no rounded chrome, sits
				 flush against the header separator.
				 ============================================================ -->
			<Tabs
				value={activeTab}
				onValueChange={(v) => (activeTab = v as typeof activeTab)}
				class="flex min-h-0 flex-1 flex-col"
			>
				<div class="shrink-0 border-b bg-card px-6">
					<TabsList class="h-auto rounded-none border-0 bg-transparent p-0">
						<TabsTrigger
							value="alerts"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<LayersIcon class="h-4 w-4" />
							Alerts
							<span
								class="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
							>
								{alerts.length}
							</span>
						</TabsTrigger>
						<TabsTrigger
							value="assets"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<HardDriveIcon class="h-4 w-4" />
							Assets
							<span
								class="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
							>
								{assets.length}
							</span>
						</TabsTrigger>
						<TabsTrigger
							value="iocs"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<FingerprintIcon class="h-4 w-4" />
							IOCs
							<span
								class="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
							>
								{iocs.length}
							</span>
						</TabsTrigger>
						<TabsTrigger
							value="timeline"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<HistoryIcon class="h-4 w-4" />
							Timeline
						</TabsTrigger>
						<TabsTrigger
							value="activity"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<MessageSquareIcon class="h-4 w-4" />
							Activity
							{#if comments.length}
								<span
									class="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
								>
									{comments.length}
								</span>
							{/if}
						</TabsTrigger>
					</TabsList>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					<!-- ============ Alerts ============ -->
					<TabsContent value="alerts">
						{#if alerts.length === 0}
							<p class="text-sm text-muted-foreground">No alerts attached.</p>
						{:else}
							<div class="overflow-hidden rounded-md border">
								<table class="w-full text-sm">
									<thead class="bg-muted/30 text-left text-2xs uppercase tracking-wide text-muted-foreground">
										<tr>
											<th class="px-3 py-2 font-medium">Alert</th>
											<th class="px-3 py-2 font-medium">Severity</th>
											<th class="px-3 py-2 font-medium">Source</th>
											<th class="px-3 py-2 font-medium">Status</th>
											<th class="px-3 py-2 font-medium">Event time</th>
											<th class="px-3 py-2"></th>
										</tr>
									</thead>
									<tbody>
										{#each alerts as alert (alert.alert_id)}
											<tr class="border-t hover:bg-muted/20">
												<td class="px-3 py-2">
													<a
														class="font-medium hover:underline"
														href={`/alerts/${alert.alert_id}`}
													>
														#{alert.alert_id} — {alert.alert_title}
													</a>
													{#if alert.alert_tags}
														<div class="mt-1 flex flex-wrap gap-1">
															{#each alert.alert_tags
																.split(',')
																.map((t) => t.trim())
																.filter(Boolean) as tag (tag)}
																<span
																	class="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
																	>{tag}</span
																>
															{/each}
														</div>
													{/if}
												</td>
												<td class="px-3 py-2">
													<span
														class="rounded-full px-2 py-0.5 text-2xs font-medium {severityChip(
															alert.severity?.severity_name ?? ''
														)}"
													>
														{alert.severity?.severity_name ?? '—'}
													</span>
												</td>
												<td class="px-3 py-2 text-xs">{alert.alert_source}</td>
												<td class="px-3 py-2 text-xs">
													{alert.status?.status_name ?? '—'}
												</td>
												<td class="px-3 py-2 text-xs text-muted-foreground">
													{alert.alert_source_event_time
														? mediumDateTimeFormatter(new Date(alert.alert_source_event_time))
														: '—'}
												</td>
												<td class="px-3 py-2 text-right">
													{#if !isEscalated}
														<Button
															variant="ghost"
															size="icon"
															aria-label="Remove from incident"
															onclick={() => removeAlert(alert.alert_id)}
														>
															<TrashIcon class="h-4 w-4" />
														</Button>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</TabsContent>

					<!-- ============ Assets ============ -->
					<TabsContent value="assets">
						{#if assets.length === 0}
							<p class="text-sm text-muted-foreground">
								No assets attached to the member alerts.
							</p>
						{:else}
							<div class="overflow-hidden rounded-md border">
								<table class="w-full text-sm">
									<thead class="bg-muted/30 text-left text-2xs uppercase tracking-wide text-muted-foreground">
										<tr>
											<th class="px-3 py-2 font-medium">Asset</th>
											<th class="px-3 py-2 font-medium">Type</th>
											<th class="px-3 py-2 font-medium">IP / Domain</th>
											<th class="px-3 py-2 font-medium">Compromise</th>
										</tr>
									</thead>
									<tbody>
										{#each assets as a (a.asset_id)}
											<tr class="border-t hover:bg-muted/20">
												<td class="px-3 py-2">
													<div class="flex items-center gap-2">
														<HardDriveIcon class="h-3.5 w-3.5 text-muted-foreground" />
														<span class="font-medium">{a.asset_name}</span>
													</div>
													{#if a.asset_description}
														<p class="mt-0.5 truncate text-xs text-muted-foreground">
															{a.asset_description}
														</p>
													{/if}
												</td>
												<td class="px-3 py-2 text-xs">
													{a.asset_type?.asset_name ?? '—'}
												</td>
												<td class="px-3 py-2 font-mono text-xs">
													{a.asset_ip || a.asset_domain || '—'}
												</td>
												<td class="px-3 py-2 text-xs">
													{a.analysis_status?.name ?? '—'}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</TabsContent>

					<!-- ============ IOCs ============ -->
					<TabsContent value="iocs">
						{#if iocs.length === 0}
							<p class="text-sm text-muted-foreground">No IOCs on the member alerts.</p>
						{:else}
							<div class="overflow-hidden rounded-md border">
								<table class="w-full text-sm">
									<thead class="bg-muted/30 text-left text-2xs uppercase tracking-wide text-muted-foreground">
										<tr>
											<th class="px-3 py-2 font-medium">Value</th>
											<th class="px-3 py-2 font-medium">Type</th>
											<th class="px-3 py-2 font-medium">TLP</th>
											<th class="px-3 py-2 font-medium">Tags</th>
										</tr>
									</thead>
									<tbody>
										{#each iocs as i (i.ioc_id)}
											<tr class="border-t hover:bg-muted/20">
												<td class="px-3 py-2">
													<div class="flex items-center gap-2">
														<FingerprintIcon class="h-3.5 w-3.5 text-muted-foreground" />
														<span class="font-mono text-xs">{i.ioc_value}</span>
													</div>
													{#if i.ioc_description}
														<p class="mt-0.5 truncate text-xs text-muted-foreground">
															{i.ioc_description}
														</p>
													{/if}
												</td>
												<td class="px-3 py-2 text-xs">{i.ioc_type?.type_name ?? '—'}</td>
												<td class="px-3 py-2 text-xs">{i.tlp?.tlp_name ?? '—'}</td>
												<td class="px-3 py-2 text-xs text-muted-foreground">
													{Array.isArray(i.ioc_tags) ? i.ioc_tags.join(', ') : i.ioc_tags ?? ''}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</TabsContent>

					<!-- ============ Timeline ============ -->
					<TabsContent value="timeline">
						{#if timeline.length === 0}
							<p class="text-sm text-muted-foreground">No events recorded yet.</p>
						{:else}
							<ol class="relative ml-1 border-l border-border/60 pl-5">
								{#each timeline as entry (entry.ts + ':' + entry.kind + ':' + entry.title)}
									<li class="mb-5">
										<span
											class="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background {entry.kind ===
											'alert'
												? 'bg-red-500'
												: entry.kind === 'history'
													? 'bg-blue-500'
													: 'bg-green-500'}"
										></span>
										<div class="flex flex-wrap items-baseline gap-2">
											<span class="text-xs text-muted-foreground">
												{mediumDateTimeFormatter(new Date(entry.ts))}
											</span>
											<span
												class="rounded-full px-2 py-0.5 text-2xs uppercase tracking-wide {entry.kind ===
												'alert'
													? 'bg-red-500/10 text-red-600'
													: entry.kind === 'history'
														? 'bg-blue-500/10 text-blue-600'
														: 'bg-green-500/10 text-green-600'}"
											>
												{entry.kind}
											</span>
											{#if entry.actor}
												<span class="text-xs text-muted-foreground">
													by {entry.actor}
												</span>
											{/if}
										</div>
										<p class="mt-1 text-sm">{entry.title}</p>
										{#if entry.detail}
											<p class="text-xs text-muted-foreground">{entry.detail}</p>
										{/if}
									</li>
								{/each}
							</ol>
						{/if}
					</TabsContent>

					<!-- ============ Activity ============ -->
					<TabsContent value="activity">
						<div class="mx-auto flex max-w-3xl flex-col gap-4">
							<div class="rounded-md border p-3">
								<Textarea
									placeholder="Add a note or update on this incident…"
									rows={3}
									bind:value={commentDraft}
								/>
								<div class="mt-2 flex justify-end">
									<Button onclick={postComment} disabled={posting || !commentDraft.trim()}>
										<SendHorizonalIcon class="mr-2 h-4 w-4" />
										{posting ? 'Posting…' : 'Post'}
									</Button>
								</div>
							</div>
							{#if comments.length === 0}
								<p class="text-sm text-muted-foreground">No analyst comments yet.</p>
							{:else}
								<ul class="space-y-3">
									{#each comments as c (c.comment_id)}
										<li class="rounded-md border p-3">
											<div class="flex items-center gap-2">
												<UserAvatar
													userId={c.user?.user_id ?? null}
													name={c.user?.user_name ?? ''}
													size="size-6"
												/>
												<span class="text-xs font-medium">{c.user?.user_name ?? 'Analyst'}</span>
												<span class="text-2xs text-muted-foreground">
													{mediumDateTimeFormatter(new Date(c.comment_date))}
												</span>
											</div>
											<p class="mt-2 whitespace-pre-wrap text-sm">{c.comment_text}</p>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</TabsContent>
				</div>
			</Tabs>
		{/if}
	</div>

	<!--
	  Right-side investigation-flow pane — placement matches the
	  alert-scoped pane so alerts and incidents share the same spatial
	  convention.
	-->
	{#if flowPanelOpen && incident}
		<aside
			class="my-3 mr-3 h-[calc(100%-1.5rem)] w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 sm:my-4 sm:mr-4 sm:h-[calc(100%-2rem)]"
			aria-label="Investigation flow"
		>
			<IncidentInvestigationFlowPanel
				incident={incident}
				onClose={() => (flowPanelOpen = false)}
			/>
		</aside>
	{/if}
</div>
