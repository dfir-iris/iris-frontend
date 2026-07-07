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
		ArrowUpRightIcon,
		BookmarkIcon,
		BuildingIcon,
		CheckCircle2Icon,
		CheckSquareIcon,
		CircleAlertIcon,
		CircleDotIcon,
		ClockIcon,
		FileTextIcon,
		FingerprintIcon,
		FlameIcon,
		GitForkIcon,
		HardDriveIcon,
		HistoryIcon,
		LayersIcon,
		LoaderIcon,
		MessageSquareIcon,
		RefreshCwIcon,
		SaveIcon,
		SendHorizonalIcon,
		ShieldAlertIcon,
		TrashIcon
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Loading } from '$lib/components/ui/loading';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import IncidentInvestigationFlowPanel from './IncidentInvestigationFlowPanel.svelte';
	import IncidentEscalateDialog, {
		type IncidentEscalatePayload
	} from './IncidentEscalateDialog.svelte';
	import IncidentCorrelationGraph from './IncidentCorrelationGraph.svelte';
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
	let activeTab = $state<'summary' | 'alerts' | 'assets' | 'iocs' | 'graph' | 'timeline' | 'activity'>('summary');

	// Summary editor state — mirrors the CaseSummary card pattern.
	// `incident_description` is loaded via load() and persisted through
	// updateField. Real-time collab isn't wired for incidents yet (no
	// `incident-summary:<id>` doc kind on the backend), so this is a
	// plain save-on-click editor with dirty/saving/synced chrome.
	let incidentSummary = $state('');
	let baseIncidentSummary = $state('');
	let summarySaving = $state(false);
	let summaryError = $state<string | null>(null);
	let summarySavedAt = $state(0);
	let summaryLoadedAt = $state(new Date());
	let summaryNow = $state(new Date());
	const summaryDirty = $derived(incidentSummary !== baseIncidentSummary);

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
			if (incident) {
				// Seed the summary editor from the freshly loaded incident.
				// Preserve unsaved local edits: if the user is mid-edit and a
				// background reload happens, only overwrite when the description
				// has actually changed on the server (i.e. base moved).
				const remote = incident.incident_description ?? '';
				if (remote !== baseIncidentSummary) {
					baseIncidentSummary = remote;
					if (!summaryDirty) incidentSummary = remote;
				}
				summaryLoadedAt = new Date();
			}
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

	const saveSummary = async () => {
		if (!incident || summarySaving) return;
		summarySaving = true;
		summaryError = null;
		try {
			const res = await IncidentsService.update(incident.incident_id, {
				incident_description: incidentSummary
			});
			if (!res.ok) {
				const message =
					(res.data as { message?: string } | null)?.message ??
					res.error?.message ??
					`Save failed (HTTP ${res.status})`;
				summaryError = message;
				return;
			}
			baseIncidentSummary = incidentSummary;
			summarySavedAt = Date.now();
			summaryLoadedAt = new Date();
			// Reflect the new value in the in-memory incident so the
			// next background reload doesn't clobber it.
			if (incident) incident.incident_description = incidentSummary;
		} catch (err) {
			summaryError = (err as Error).message;
		} finally {
			summarySaving = false;
		}
	};

	const refreshSummary = async () => {
		if (!incident) return;
		const res = await IncidentsService.get(incident.incident_id);
		if (res.ok && res.data && typeof res.data === 'object') {
			const remote = (res.data as Incident).incident_description ?? '';
			baseIncidentSummary = remote;
			incidentSummary = remote;
			summaryLoadedAt = new Date();
			summaryError = null;
		}
	};

	const summaryRelativeTime = (from: Date, to: Date): string => {
		const diff = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
		if (diff < 5) return 'just now';
		if (diff < 60) return `${diff}s ago`;
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return from.toLocaleDateString();
	};

	const summarySyncedRelative = $derived(summaryRelativeTime(summaryLoadedAt, summaryNow));
	const summarySyncedAbsolute = $derived(summaryLoadedAt.toLocaleTimeString());

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

	let escalating = $state(false);
	let escalateDialogOpen = $state(false);
	let showConfirmUnlinkCase = $state(false);
	let unlinking = $state(false);

	const unlinkFromCase = async () => {
		if (!incident || unlinking) return;
		unlinking = true;
		try {
			const res = await IncidentsService.unlinkCase(incident.incident_id);
			if (!res.ok) {
				const msg =
					(res.data as { message?: string } | null)?.message ??
					res.error?.message ??
					`Unlink failed (HTTP ${res.status})`;
				toast({ title: 'Unlink failed', description: msg, variant: 'destructive' });
				return;
			}
			toast({ title: 'Incident unlinked from case' });
			await load();
		} catch (err) {
			toast({
				title: 'Unlink failed',
				description: (err as Error).message,
				variant: 'destructive'
			});
		} finally {
			unlinking = false;
		}
	};

	const submitEscalateOrMerge = async (payload: IncidentEscalatePayload) => {
		if (!incident || escalating) return;
		escalating = true;
		try {
			const res =
				payload.mode === 'new'
					? await IncidentsService.escalate(incident.incident_id, {
							case_title: payload.case_title,
							note: payload.note || undefined,
							import_as_event: payload.import_as_event,
							case_tags: payload.case_tags || undefined
						})
					: await IncidentsService.merge(incident.incident_id, {
							target_case_id: payload.target_case_id,
							note: payload.note || undefined,
							import_as_event: payload.import_as_event,
							case_tags: payload.case_tags || undefined
						});
			const body = res.data && typeof res.data === 'object' ? res.data : null;
			if (res.ok && body && 'case_id' in body && body.case_id) {
				escalateDialogOpen = false;
				goto(`/case/${body.case_id}`);
				return;
			}
			const message =
				(body as { message?: string } | null)?.message ??
				res.error?.message ??
				`${payload.mode === 'new' ? 'Escalation' : 'Merge'} failed (HTTP ${res.status})`;
			toast({
				title: payload.mode === 'new' ? 'Escalation failed' : 'Merge failed',
				description: message,
				variant: 'destructive'
			});
		} catch (err) {
			toast({
				title: payload.mode === 'new' ? 'Escalation failed' : 'Merge failed',
				description: (err as Error).message,
				variant: 'destructive'
			});
		} finally {
			escalating = false;
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
		// Tick a "now" state every 30s so the "Synced X ago" chip in the
		// summary header stays reasonably fresh. 30s is coarse enough not
		// to churn the DOM; the value is only shown as a hint anyway.
		const tick = setInterval(() => (summaryNow = new Date()), 30_000);
		await load();
		return () => clearInterval(tick);
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
							<Button
								onclick={() => (escalateDialogOpen = true)}
								disabled={alerts.length === 0 || escalating}
							>
								<ArrowUpRightIcon class="mr-2 h-4 w-4" />
								{escalating ? 'Working…' : 'Escalate or merge…'}
							</Button>
						{:else}
							<DropdownMenu>
								<DropdownMenuTrigger>
									<Button variant="outline" disabled={unlinking}>
										{unlinking
											? 'Unlinking…'
											: `Linked case #${incident.incident_case_id}`}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" class="min-w-[220px]">
									<DropdownMenuLabel>Linked case</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onclick={() => goto(`/case/${incident?.incident_case_id}`)}
									>
										Open case #{incident.incident_case_id}
									</DropdownMenuItem>
									<DropdownMenuItem
										class="text-destructive focus:text-destructive"
										onclick={() => (showConfirmUnlinkCase = true)}
									>
										Unlink from case
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
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
							{#if isEscalated}
								<span
									class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusChip(
										incident.status?.status_name ?? ''
									)}"
								>
									{incident.status?.status_name ?? '—'}
								</span>
							{:else}
								<Popover.Root>
									<Popover.Trigger>
										<span
											class="cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:brightness-95 {statusChip(
												incident.status?.status_name ?? ''
											)}"
											title="Change status"
										>
											{incident.status?.status_name ?? '—'}
										</span>
									</Popover.Trigger>
									<Popover.Content align="start" class="w-56 p-0">
										<Command.Root>
											<Command.Input placeholder="Search status..." class="h-9" />
											<Command.Empty>No status found.</Command.Empty>
											<Command.List class="max-h-[240px] overflow-y-auto">
												<Command.Group>
													{#each statuses as s (s.status_id)}
														{@const isCurrent = incident.incident_status_id === s.status_id}
														<Command.Item
															value={s.status_name}
															onSelect={() =>
																!isCurrent && updateField({ incident_status_id: s.status_id })}
														>
															<span class="flex w-full items-center justify-between gap-2">
																<span class="truncate">{s.status_name}</span>
																{#if isCurrent}
																	<CheckCircle2Icon size={12} class="shrink-0 text-emerald-500" />
																{/if}
															</span>
														</Command.Item>
													{/each}
												</Command.Group>
											</Command.List>
										</Command.Root>
									</Popover.Content>
								</Popover.Root>
							{/if}
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
							Severity
						</span>
						<div class="flex items-center gap-2">
							{#if isEscalated}
								<span
									class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium {severityChip(
										severityLabel(incident.incident_severity_id)
									)}"
								>
									<FlameIcon class="h-3 w-3" />
									{severityLabel(incident.incident_severity_id)}
								</span>
							{:else}
								<Popover.Root>
									<Popover.Trigger>
										<span
											class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:brightness-95 {severityChip(
												severityLabel(incident.incident_severity_id)
											)}"
											title="Change severity"
										>
											<FlameIcon class="h-3 w-3" />
											{severityLabel(incident.incident_severity_id)}
										</span>
									</Popover.Trigger>
									<Popover.Content align="start" class="w-56 p-0">
										{@const currentSevId = incident.incident_severity_id ?? null}
										<Command.Root>
											<Command.Input placeholder="Search severity..." class="h-9" />
											<Command.Empty>No severity found.</Command.Empty>
											<Command.List class="max-h-[240px] overflow-y-auto">
												<Command.Group>
													{#each severities as s (s.severity_id)}
														{@const isCurrent = currentSevId === s.severity_id}
														<Command.Item
															value={s.severity_name}
															onSelect={() =>
																!isCurrent &&
																updateField({ incident_severity_id: s.severity_id })}
														>
															<span class="flex w-full items-center justify-between gap-2">
																<span class="truncate">{s.severity_name}</span>
																{#if isCurrent}
																	<CheckCircle2Icon size={12} class="shrink-0 text-emerald-500" />
																{/if}
															</span>
														</Command.Item>
													{/each}
												</Command.Group>
											</Command.List>
										</Command.Root>
									</Popover.Content>
								</Popover.Root>
							{/if}
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
							Owner
						</span>
						<div class="flex items-center gap-2">
							{#if isEscalated}
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
							{:else}
								<Popover.Root>
									<Popover.Trigger>
										<span
											class="inline-flex cursor-pointer items-center gap-2 rounded-full px-1 py-0.5 text-sm transition-colors hover:bg-muted"
											title={incident.owner ? 'Reassign owner' : 'Assign owner'}
										>
											{#if incident.owner}
												<UserAvatar
													userId={incident.owner.id}
													name={incident.owner.user_name}
													size="size-6"
												/>
												<span>{incident.owner.user_name}</span>
											{:else}
												<span class="italic text-muted-foreground">Unassigned</span>
											{/if}
										</span>
									</Popover.Trigger>
									<Popover.Content align="start" class="w-64 p-0">
										{@const currentOwnerId = incident.incident_owner_id ?? null}
										<Command.Root>
											<Command.Input placeholder="Search user..." class="h-9" />
											<Command.Empty>No user found.</Command.Empty>
											<Command.List class="max-h-[280px] overflow-y-auto">
												<Command.Group>
													<Command.Item
														value="Unassigned"
														onSelect={() =>
															currentOwnerId != null && updateField({ incident_owner_id: null })}
													>
														<span class="flex w-full items-center justify-between gap-2">
															<span class="truncate italic text-muted-foreground">Unassigned</span>
															{#if currentOwnerId == null}
																<CheckCircle2Icon size={12} class="shrink-0 text-emerald-500" />
															{/if}
														</span>
													</Command.Item>
													{#each users as u (u.user_id)}
														{@const isCurrent = currentOwnerId === u.user_id}
														<Command.Item
															value={`${u.user_name} ${u.user_login}`}
															onSelect={() =>
																!isCurrent && updateField({ incident_owner_id: u.user_id })}
														>
															<span class="flex w-full items-center justify-between gap-2">
																<span class="min-w-0 truncate">
																	{u.user_name} <span class="text-muted-foreground">({u.user_login})</span>
																</span>
																{#if isCurrent}
																	<CheckCircle2Icon size={12} class="shrink-0 text-emerald-500" />
																{/if}
															</span>
														</Command.Item>
													{/each}
												</Command.Group>
											</Command.List>
										</Command.Root>
									</Popover.Content>
								</Popover.Root>
							{/if}
						</div>
					</div>
				</div>

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
							value="summary"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<FileTextIcon class="h-4 w-4" />
							Summary
							{#if summaryDirty}
								<span
									class="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-400"
									title="Unsaved changes"
								>
									•
								</span>
							{/if}
						</TabsTrigger>
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
							value="graph"
							class="flex items-center gap-2 rounded-none px-4 py-3 text-sm transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
						>
							<GitForkIcon class="h-4 w-4" />
							Correlation
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

				<!--
					Padding / scroll live on the outer wrapper for text-heavy
					tabs. The graph tab renders edge-to-edge and manages its
					own overflow, so we drop padding + scroll when it's
					active — otherwise the graph would sit inside a padded
					scroll box and never reach the panel's full height.
				-->
				<div
					class="min-h-0 flex-1 {activeTab === 'graph'
						? 'overflow-hidden'
						: 'overflow-y-auto px-6 py-5'}"
				>
					<!-- ============ Summary ============
						 Markdown editor bound to `incident_description` with
						 dirty/saving/synced chrome, refresh + save. Real-time
						 collab isn't wired for incidents yet: saves go through
						 the normal PUT and refresh pulls the latest. -->
					<TabsContent value="summary">
						<div class="flex flex-wrap items-center justify-between gap-3 pb-3">
							<div class="flex flex-wrap items-center gap-2">
								{#if summaryError}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
									>
										<CircleAlertIcon size={12} />
										Error
									</span>
								{:else if summarySaving}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
									>
										<LoaderIcon size={12} class="animate-spin" />
										Saving…
									</span>
								{:else if summaryDirty}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
									>
										<CircleDotIcon size={12} />
										Unsaved changes
									</span>
								{:else}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
									>
										<CheckCircle2Icon size={12} />
										All changes saved
									</span>
								{/if}
								<span
									class="hidden text-xs text-muted-foreground sm:inline"
									title={`Last synced at ${summarySyncedAbsolute}`}
								>
									Synced {summarySyncedRelative}
								</span>
							</div>

							<div class="flex items-center gap-1">
								<Button
									variant="ghost"
									size="xs"
									disabled={loading}
									onclick={refreshSummary}
									title="Refresh"
								>
									<RefreshCwIcon size={12} class={loading ? 'animate-spin' : ''} />
									<span class="ml-1 hidden sm:inline">Refresh</span>
								</Button>

								{#if !isEscalated}
									<Button
										variant="default"
										size="xs"
										disabled={summarySaving || !summaryDirty}
										onclick={saveSummary}
										title="Save"
									>
										<SaveIcon size={12} />
										<span class="ml-1 hidden sm:inline">Save</span>
									</Button>
								{/if}
							</div>
						</div>

						{#if summaryError}
							<div
								class="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
							>
								{summaryError}
							</div>
						{/if}

						<div class="rounded-md border bg-muted/20 p-4">
							<MarkDownEditor
								value={incidentSummary}
								onChange={(v) => (incidentSummary = v)}
								onSave={() => saveSummary()}
								readOnly={isEscalated}
							/>
						</div>
					</TabsContent>

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

					<!-- ============ Correlation graph ============
						 Node/edge network built server-side from every member
						 alert's IOCs and assets. Loaded lazily on first tab
						 activation so a large incident doesn't pay the fetch
						 cost until the analyst asks for it. Uses `mt-0` so it
						 sits flush against the tabs strip; the graph owns the
						 whole panel below that.

						 IMPORTANT: `data-[state=active]:flex` is required —
						 plain `flex` overrides the `[hidden]` attribute
						 bits-ui sets on inactive panels (utility class
						 specificity beats the user-agent stylesheet), which
						 leaves the graph visible on top of Timeline/Activity.
						 The state-scoped variant only applies flex when
						 active. -->
					<TabsContent
						value="graph"
						class="mt-0 h-full flex-col data-[state=active]:flex"
					>
						<IncidentCorrelationGraph
							incidentId={incident.incident_id}
							active={activeTab === 'graph'}
						/>
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

{#if incident}
	<IncidentEscalateDialog
		bind:open={escalateDialogOpen}
		incidentTitle={incident.incident_title}
		incidentDescription={incident.incident_description ?? ''}
		incidentCustomerId={incident.incident_customer_id ?? null}
		onClose={() => (escalateDialogOpen = false)}
		onConfirm={submitEscalateOrMerge}
	/>

	<ConfirmationDialog
		bind:open={showConfirmUnlinkCase}
		title="Unlink incident from case?"
		message={`Incident #${incident.incident_id} will go back to Investigating and its ${alerts.length} alert${alerts.length === 1 ? '' : 's'} will be detached from case #${incident.incident_case_id} (status reset to Assigned). The case itself remains.`}
		onConfirm={unlinkFromCase}
	/>
{/if}
