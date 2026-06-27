<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Activity,
		AlertTriangleIcon,
		BellIcon,
		Building2,
		CheckCircle2Icon,
		ChevronRightIcon,
		Clock,
		DatabaseIcon,
		EyeIcon,
		FileDigit,
		InfoIcon,
		LockIcon,
		MoreHorizontal,
		Shield,
		ShieldAlert,
		Star,
		Tag,
		UserRound
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { AlertService } from '$lib/services/alerts.service';
	import { FollowedCasesService, type CaseFollower } from '$lib/services/followed-cases.service';
	import {
		WarRoomsService,
		type WarRoomCaseSummary
	} from '$lib/services/war-rooms.service';
	import { current_user } from '$lib/stores/auth.store';
	import type { Alert } from '$lib/types/resources/alert';
	import { toast } from '$lib/stores/toast.store';
	import * as Popover from '$lib/components/ui/popover';
	import type { Case } from '$lib/types/resources/case';
	import type { CaseStatus, Severity } from '$lib/components/ui/badge/types';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import {
		ACTIVITY_PANEL_CTX,
		type ActivityPanelContext
	} from '$lib/contexts/activity-panel.context.svelte';
	import {
		DATASTORE_PANEL_CTX,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import CaseAddDropdown from './CaseAddDropdown.svelte';
	import CaseQuickAddButton from './CaseQuickAddButton.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		menuItems?: Snippet;
	};

	let { menuItems }: Props = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const activityPanel = getContext<ActivityPanelContext | undefined>(ACTIVITY_PANEL_CTX);
	const datastorePanel = getContext<DatastorePanelContext | undefined>(DATASTORE_PANEL_CTX);

	type IconComponent = typeof Shield | typeof Activity;

	type IconState = {
		Icon: IconComponent;
		iconColor: string;
		iconBg: string;
		ring: string;
		glow: boolean;
	};

	let caseData = $state<Case | null>(null);
	let severity = $state<Severity>('Unspecified' as Severity);
	let status = $state<CaseStatus>('Unspecified' as CaseStatus);
	let formattedDate = $state('');
	let isClosed = $state(false);

	// Review chip metadata. Three visible states (none/in-progress/complete);
	// "Not reviewed" and "No review required" intentionally produce no chip
	// because surfacing them clutters the topbar without signal.
	type ReviewVariant = 'complete' | 'pending' | null;
	const reviewMeta = $derived.by<{
		variant: ReviewVariant;
		label: string;
		shortLabel: string;
		reviewerName: string | null;
	}>(() => {
		const status = caseData?.review_status?.status_name ?? null;
		const reviewerName = caseData?.reviewer?.user_name ?? null;

		if (!status || status === 'Not reviewed') {
			return { variant: null, label: '', shortLabel: '', reviewerName: null };
		}
		if (status === 'No review required') {
			return { variant: null, label: '', shortLabel: '', reviewerName: null };
		}
		if (status === 'Reviewed') {
			return { variant: 'complete', label: 'Reviewed', shortLabel: 'Reviewed', reviewerName };
		}
		// Pending review / Review in progress / anything else custom
		return {
			variant: 'pending',
			label: status,
			shortLabel: status === 'Review in progress' ? 'In review' : 'Pending',
			reviewerName
		};
	});

	let tagsContainerEl = $state<HTMLDivElement | null>(null);
	let visibleTagCount = $state(0);

	const measureVisibleTags = () => {
		const el = tagsContainerEl;
		const total = caseData?.tags?.length ?? 0;

		if (!el || total === 0) {
			visibleTagCount = total;
			return;
		}

		const containerWidth = el.clientWidth;
		const gapPx = 4;
		const overflowChipPx = 36;

		const tagChips = Array.from(
			el.querySelectorAll<HTMLElement>('[data-tag-chip]')
		);

		let used = 0;
		let fit = 0;

		for (let i = 0; i < tagChips.length; i++) {
			const chip = tagChips[i];

			const prevHidden = chip.classList.contains('hidden');
			if (prevHidden) chip.classList.remove('hidden');
			const chipWidth = chip.scrollWidth;
			if (prevHidden) chip.classList.add('hidden');

			const remaining = total - (fit + 1);
			const reserve = remaining > 0 ? overflowChipPx + gapPx : 0;
			const additional = (fit > 0 ? gapPx : 0) + chipWidth + reserve;

			if (used + additional <= containerWidth) {
				used += (fit > 0 ? gapPx : 0) + chipWidth;
				fit += 1;
			} else {
				break;
			}
		}

		visibleTagCount = fit;
	};

	$effect(() => {
		void caseData?.tags;

		if (!tagsContainerEl) {
			visibleTagCount = caseData?.tags?.length ?? 0;
			return;
		}

		const ro = new ResizeObserver(() => measureVisibleTags());
		ro.observe(tagsContainerEl);
		measureVisibleTags();

		return () => ro.disconnect();
	});

	let icon = $state<IconState>({
		Icon: Shield,
		iconColor: 'text-blue-500',
		iconBg: 'bg-blue-100',
		ring: 'ring-blue-300',
		glow: false
	});

	const CLOSED_ICON: IconState = {
		Icon: Shield,
		iconColor: 'text-muted-foreground',
		iconBg: 'bg-muted',
		ring: 'ring-muted',
		glow: false
	};

	$effect(() => {
		caseData = cases.currentCase() ?? null;

		const severityName = caseData?.severity?.severity_name ?? 'Unspecified';
		const stateName = caseData?.state?.state_name ?? 'Unspecified';

		severity = severityName as Severity;
		status = stateName as CaseStatus;
		isClosed = stateName === 'Closed';

		formattedDate = new Date(caseData?.open_date as string).toLocaleDateString();

		if (isClosed) {
			icon = CLOSED_ICON;
			return;
		}

		switch (severityName.toLowerCase()) {
			case 'critical':
			case 'high':
				icon = {
					Icon: Shield,
					iconColor: 'text-red-500',
					iconBg: 'bg-red-50',
					ring: 'ring-red-300',
					glow: true
				};
				return;

			case 'medium':
				icon = {
					Icon: Activity,
					iconColor: 'text-amber-500',
					iconBg: 'bg-amber-50',
					ring: 'ring-amber-300',
					glow: false
				};
				return;

			default:
				icon = {
					Icon: Shield,
					iconColor: 'text-blue-500',
					iconBg: 'bg-blue-100',
					ring: 'ring-blue-300',
					glow: false
				};
		}
	});

	// State picker: lazy-load the full state list the first time the menu
	// opens, then PUT the selected state via cases.patch().
	const states = $derived(cases.states());

	const handleStateMenuOpen = (open: boolean) => {
		if (open && !states) void cases.loadStates();
	};

	const setCaseState = async (stateId: number) => {
		const id = caseData?.case_id;
		if (!id) return;
		try {
			await cases.patch(id, { state_id: stateId });
		} catch (err) {
			toast({
				title: 'Failed to update case state',
				description: (err as Error).message,
				variant: 'destructive'
			});
		}
	};

	// Linked-alerts indicator. Loaded eagerly on case change so the count
	// (and its string label) renders before the user clicks. Loading is
	// gated by `loadingAlerts` so reopening the popover mid-fetch doesn't
	// fan out duplicate requests.
	const ALERTS_PER_PAGE = 50;
	let linkedAlerts = $state<Alert[] | null>(null);
	let linkedAlertsTotal = $state<number>(0);
	let loadingAlerts = $state(false);

	const loadLinkedAlerts = async (id: number) => {
		if (loadingAlerts) return;
		loadingAlerts = true;
		try {
			const res = await AlertService.list({ case_id: id, per_page: ALERTS_PER_PAGE, page: 1 });
			if (res.ok && !res.error && res.data) {
				const body = res.data as unknown as { data?: { alerts?: Alert[]; total?: number } };
				const data = body?.data ?? null;
				linkedAlerts = data?.alerts ?? [];
				linkedAlertsTotal = data?.total ?? linkedAlerts.length;
			} else {
				linkedAlerts = [];
				linkedAlertsTotal = 0;
			}
		} catch (err) {
			console.error('[case-topbar] failed to load linked alerts', err);
			linkedAlerts = [];
			linkedAlertsTotal = 0;
		} finally {
			loadingAlerts = false;
		}
	};

	// Load on mount and only when the case ID changes. We can't depend on
	// `caseData` directly because it's reassigned (to a new object ref)
	// by the icon/severity effect whenever the case payload is refreshed,
	// which would refire this effect in a loop. Snapshotting the last-fired
	// id makes the effect a no-op for any re-run that isn't a real switch.
	let lastLoadedAlertsCaseId = -1;
	$effect(() => {
		const id = caseData?.case_id;
		if (id == null || id === lastLoadedAlertsCaseId) return;
		lastLoadedAlertsCaseId = id;
		linkedAlerts = null;
		linkedAlertsTotal = 0;
		void loadLinkedAlerts(id);
	});

	// Followers: scope is "is the current user following this case + who
	// else is". The list is public per the project policy — anyone who
	// can read the case can see who follows it. Loaded eagerly on case
	// switch so the chip renders without a click delay.
	let followers = $state<CaseFollower[] | null>(null);
	let followerLoadError = $state<string | null>(null);
	let followToggleBusy = $state(false);
	let lastLoadedFollowersCaseId = -1;

	const myUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);
	const isFollowing = $derived(
		followers != null && myUserId != null && followers.some((f) => f.user_id === myUserId)
	);

	const loadFollowers = async (id: number) => {
		followerLoadError = null;
		try {
			const res = await FollowedCasesService.listFollowers(id);
			if (res.ok && Array.isArray(res.data)) {
				followers = res.data;
			} else {
				followers = [];
				followerLoadError = res.error?.message ?? 'Failed to load followers';
			}
		} catch (err) {
			followers = [];
			followerLoadError = (err as Error).message;
		}
	};

	$effect(() => {
		const id = caseData?.case_id;
		if (id == null || id === lastLoadedFollowersCaseId) return;
		lastLoadedFollowersCaseId = id;
		followers = null;
		void loadFollowers(id);
	});

	// War rooms this case is attached to. Cheap one-shot fetch; refreshed
	// on case switch the same way the followers list is.
	let warRooms = $state<WarRoomCaseSummary[]>([]);
	let lastLoadedWarRoomsCaseId = -1;

	const loadCaseWarRooms = async (id: number) => {
		try {
			const res = await WarRoomsService.forCase(id);
			if (res.ok && Array.isArray(res.data)) {
				warRooms = res.data;
			} else {
				warRooms = [];
			}
		} catch {
			warRooms = [];
		}
	};

	$effect(() => {
		const id = caseData?.case_id;
		if (id == null || id === lastLoadedWarRoomsCaseId) return;
		lastLoadedWarRoomsCaseId = id;
		void loadCaseWarRooms(id);
	});

	const toggleFollow = async () => {
		const id = caseData?.case_id;
		if (id == null || followToggleBusy) return;
		followToggleBusy = true;
		try {
			if (isFollowing) {
				const res = await FollowedCasesService.unfollow(id);
				if (!res.ok && res.error) {
					throw new Error(res.error.message);
				}
			} else {
				const res = await FollowedCasesService.follow(id);
				if (!res.ok && res.error) {
					throw new Error(res.error.message);
				}
			}
			await loadFollowers(id);
		} catch (err) {
			toast({
				title: 'Could not update follow status',
				description: (err as Error).message,
				variant: 'destructive'
			});
		} finally {
			followToggleBusy = false;
		}
	};
</script>

<!--
	Closed cases get a soft slate→blue gradient banner — calm, distinctive at
	a glance, and doesn't clash with severity badges (which lean red/orange).
	Light + dark variants pick complementary tints so it reads well in both
	themes without overpowering the foreground content.
-->
<div
	class="relative flex items-center gap-2 border-b px-3 py-2 sm:gap-4 sm:px-5 sm:py-2.5 {isClosed
		? 'border-b-red-500/40 bg-gradient-to-r from-red-100 via-rose-50 to-red-50/40 dark:border-b-red-500/50 dark:from-red-950/60 dark:via-rose-950/40 dark:to-red-950/20'
		: 'bg-card'}"
>

	<!-- Case icon badge -->
	<div
		class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 sm:flex {icon.iconBg} {icon.glow
			? 'shadow-glow-danger'
			: ''}"
	>
		<icon.Icon size={16} class={icon.iconColor} />
	</div>

	<!-- Title + metadata column -->
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<div class="flex min-w-0 items-center gap-2">
			{#if caseData?.case_id}
				<span class="shrink-0 font-mono text-xs text-muted-foreground">#{caseData.case_id}</span>
			{/if}

			<h2
				class="min-w-0 truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground"
				title={caseData?.case_name}
			>
				{caseData?.case_name?.split(' - ')[1] ?? caseData?.case_name}
			</h2>

			{#if isClosed}
				<span
					class="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-300"
				>
					<LockIcon size={10} />
					Closed
				</span>
			{/if}

			<!-- Small-screen metadata: collapse all the meta chips into a popover trigger. -->
			<Popover.Root>
				<Popover.Trigger class="md:hidden">
					<span
						class="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Case details"
					>
						<InfoIcon size={13} />
					</span>
				</Popover.Trigger>
				<Popover.Content align="start" class="w-64 p-3">
					<div class="flex flex-col gap-2 text-xs">
						{#if caseData?.case_customer?.customer_name}
							<div class="flex items-center gap-2">
								<Building2 size={13} class="shrink-0 opacity-70" />
								<span class="truncate">{caseData.case_customer.customer_name}</span>
							</div>
						{/if}
						{#if caseData?.case_soc_id}
							<div class="flex items-center gap-2">
								<FileDigit size={13} class="shrink-0 opacity-70" />
								<span>SOC #{caseData.case_soc_id}</span>
							</div>
						{/if}
						{#if caseData?.owner?.user_name}
							<div class="flex items-center gap-2">
								<UserRound size={13} class="shrink-0 opacity-70" />
								<span class="truncate">{caseData.owner.user_name}</span>
							</div>
						{/if}
						{#if formattedDate}
							<div class="flex items-center gap-2">
								<Clock size={13} class="shrink-0 opacity-70" />
								<span>{formattedDate}</span>
							</div>
						{/if}
						{#if caseData?.tags?.length}
							<div class="mt-1 flex flex-wrap gap-1 border-t pt-2">
								{#each caseData.tags as tag}
									<div
										class="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-2xs"
									>
										<Tag size={10} class="opacity-70" />
										<span class="max-w-[10rem] truncate">{tag.tag_title}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</Popover.Content>
			</Popover.Root>
		</div>

		<!-- Inline metadata: only on md+ to keep small screens uncluttered. -->
		<div
			class="hidden flex-wrap items-center gap-x-1 gap-y-0.5 text-2xs text-muted-foreground md:flex"
		>
			{#if caseData?.case_customer?.customer_name}
				<span
					class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
				>
					<Building2 size={11} class="opacity-70" />
					<span class="max-w-[14rem] truncate">{caseData.case_customer.customer_name}</span>
				</span>
			{/if}

			{#if caseData?.case_soc_id}
				<span class="opacity-30">·</span>
				<span
					class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
				>
					<FileDigit size={11} class="opacity-70" />
					<span>SOC #{caseData.case_soc_id}</span>
				</span>
			{/if}

			{#if caseData?.owner?.user_name}
				<span class="opacity-30">·</span>
				<span
					class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
				>
					<UserRound size={11} class="opacity-70" />
					<span class="max-w-[10rem] truncate">{caseData.owner.user_name}</span>
				</span>
			{/if}

			{#if formattedDate}
				<span class="opacity-30">·</span>
				<span
					class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
				>
					<Clock size={11} class="opacity-70" />
					<span>{formattedDate}</span>
				</span>
			{/if}
		</div>
	</div>

	<!-- Tags: show as many as fit, collapse the rest into a clickable +N popover. -->
	{#if caseData?.tags?.length}
		{@const totalTags = caseData.tags.length}
		<div
			bind:this={tagsContainerEl}
			class="hidden min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden md:flex"
		>
			{#each caseData.tags as tag, i}
				<div
					data-tag-chip
					class="flex shrink-0 items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
					class:hidden={i >= visibleTagCount}
				>
					<Tag size={12} class="opacity-70" />
					<span class="max-w-[10rem] truncate">{tag.tag_title}</span>
				</div>
			{/each}

			{#if visibleTagCount < totalTags}
				<Popover.Root>
					<Popover.Trigger>
						<div
							class="shrink-0 cursor-pointer rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
						>
							+{totalTags - visibleTagCount}
						</div>
					</Popover.Trigger>
					<Popover.Content align="start" class="w-64 p-3">
						<div class="mb-2 text-xs font-semibold">Tags</div>
						<div class="flex flex-wrap gap-1">
							{#each caseData.tags as tag}
								<div
									class="flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
								>
									<Tag size={12} class="opacity-70" />
									<span class="max-w-[10rem] truncate">{tag.tag_title}</span>
								</div>
							{/each}
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
	{/if}

	<!--
		Right cluster: status/severity grouped, then action buttons.
		Side-panel toggles (DataStore, Activity) are icon-only to shed
		bar width — their labels live in tooltips. The generic "Add Item"
		dropdown is now folded into the "…" overflow since the
		section-aware quick-add already covers the primary create flow.
	-->
	<div class="flex shrink-0 items-center gap-1.5">
		{#if reviewMeta.variant}
			{@const isComplete = reviewMeta.variant === 'complete'}
			{@const chipClass = isComplete
				? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/50 dark:text-emerald-300'
				: 'border-amber-500/40 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-300'}

			<Popover.Root>
				<Popover.Trigger>
					<!-- md+ chip with label; below md only the icon shows -->
					<span
						class="inline-flex h-7 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium transition-colors hover:brightness-95 sm:px-2 {chipClass}"
						aria-label={reviewMeta.label}
					>
						{#if isComplete}
							<CheckCircle2Icon size={13} />
						{:else}
							<AlertTriangleIcon size={13} />
						{/if}
						<span class="hidden max-w-[7rem] truncate md:inline">{reviewMeta.shortLabel}</span>
					</span>
				</Popover.Trigger>
				<Popover.Content align="end" class="w-56 p-3">
					<div class="flex items-start gap-2">
						{#if isComplete}
							<CheckCircle2Icon size={16} class="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
						{:else}
							<AlertTriangleIcon size={16} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
						{/if}
						<div class="min-w-0 text-xs">
							<div class="font-semibold">{reviewMeta.label}</div>
							{#if reviewMeta.reviewerName}
								<div class="mt-1 flex items-center gap-1 text-muted-foreground">
									<EyeIcon size={11} class="opacity-70" />
									<span class="truncate">by {reviewMeta.reviewerName}</span>
								</div>
							{/if}
						</div>
					</div>
				</Popover.Content>
			</Popover.Root>
		{/if}

		<!--
			Status pill is now a state picker. The dropdown lazy-loads the
			full state list so users can move a case through Open → Containment
			→ Eradication → Recovery → … → Closed without leaving the topbar.
			A closed case also gets a Reopen path via this menu.
		-->
		<DropdownMenu onOpenChange={handleStateMenuOpen}>
			<DropdownMenuTrigger>
				<!--
				  Status and severity are now two adjacent but visually
				  separate chips. Only Status is the dropdown trigger
				  (state is editable from here, severity isn't), but a
				  thin `gap-1.5` between them is enough to read them as
				  two boxes rather than one merged pill.
				-->
				<div
					class="hidden items-center gap-1.5 transition-colors sm:flex"
					title="Change case state"
				>
					<StatusBadge {status} />
					<SeverityBadge {severity} />
				</div>
				<!-- Below sm : icon-only, clickable -->
				<div class="flex items-center gap-1 sm:hidden">
					<StatusBadge {status} icon_only />
					<SeverityBadge {severity} icon_only />
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" class="min-w-[200px]">
				<DropdownMenuLabel>Change case state</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{#if !states}
					<div class="px-2 py-1.5 text-xs text-muted-foreground">Loading states…</div>
				{:else}
					{#each states as s (s.state_id)}
						{@const isCurrent = caseData?.state?.state_id === s.state_id}
						<DropdownMenuItem
							disabled={isCurrent}
							onclick={() => !isCurrent && setCaseState(s.state_id)}
						>
							<span class="flex w-full items-center justify-between gap-2">
								<span class="truncate">{s.state_name}</span>
								{#if isCurrent}
									<CheckCircle2Icon size={12} class="shrink-0 text-emerald-500" />
								{/if}
							</span>
						</DropdownMenuItem>
					{/each}
				{/if}
			</DropdownMenuContent>
		</DropdownMenu>

		<!--
			Linked-alerts indicator: count is loaded eagerly on case change
			and shown both as a red badge on the bell and as an inline
			"N linked alerts" label when there's horizontal room. The popover
			lists up to ALERTS_PER_PAGE alerts; the footer link jumps to the
			Alerts page pre-filtered by this case.
		-->
		<!--
		  Linked-alerts trigger. Visually a piece of inline text ("N
		  linked alerts") rather than a button — the user explicitly
		  asked for the chrome to be dropped so it reads as part of the
		  case header rather than yet another action button. We keep
		  the underlying `<button>` semantics (via `Popover.Trigger`)
		  for keyboard / screen-reader users; the styling just removes
		  the border, background and padding so it disappears into the
		  surrounding text run.
		-->
		<!--
		  Suppress the whole indicator when the case has no linked alerts.
		  Surfacing "0 linked alerts" added noise to the header without
		  giving the analyst anything actionable to do; we only render the
		  trigger when there's at least one alert to expose.
		-->
		{#if linkedAlertsTotal > 0}
		<Popover.Root>
			<Popover.Trigger
				class="inline-flex items-center gap-1 rounded-sm bg-transparent text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				aria-label={`${linkedAlertsTotal} linked alert${linkedAlertsTotal === 1 ? '' : 's'}`}
			>
				<BellIcon size={14} />
				<span class="tabular-nums">
					{linkedAlertsTotal > 99 ? '99+' : linkedAlertsTotal}
				</span>
				<span class="hidden sm:inline">
					linked alert{linkedAlertsTotal === 1 ? '' : 's'}
				</span>
			</Popover.Trigger>
			<Popover.Content align="end" class="w-80 p-0">
				<div class="border-b px-3 py-2 text-xs font-semibold">
					{#if loadingAlerts && linkedAlerts === null}
						Loading…
					{:else}
						{linkedAlertsTotal} linked alert{linkedAlertsTotal === 1 ? '' : 's'}
					{/if}
				</div>

				<div class="max-h-72 overflow-y-auto">
					{#if linkedAlerts === null && loadingAlerts}
						<div class="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</div>
					{:else if (linkedAlerts?.length ?? 0) === 0}
						<div class="px-3 py-4 text-center text-xs text-muted-foreground">
							No alerts linked to this case.
						</div>
					{:else}
						<ul class="flex flex-col py-1">
							{#each linkedAlerts as alert (alert.alert_id)}
								<li>
									<a
										href={`/alerts/${alert.alert_id}`}
										class="flex w-full flex-col gap-0.5 px-3 py-2 text-xs transition-colors hover:bg-muted/60"
									>
										<div class="flex items-center gap-2">
											<span class="shrink-0 font-mono text-2xs text-muted-foreground">
												#{alert.alert_id}
											</span>
											<span class="min-w-0 flex-1 truncate font-medium" title={alert.alert_title}>
												{alert.alert_title}
											</span>
										</div>
										{#if alert.alert_source}
											<div class="truncate text-2xs text-muted-foreground">
												{alert.alert_source}
											</div>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if linkedAlertsTotal > 0}
					<div class="border-t p-2">
						<Button
							variant="secondary"
							size="sm"
							class="h-7 w-full justify-between gap-1 text-xs"
							onclick={() => goto(`/alerts?case_id=${caseData?.case_id}`)}
						>
							<span>View all in Alerts</span>
							<ChevronRightIcon size={12} />
						</Button>
					</div>
				{/if}
			</Popover.Content>
		</Popover.Root>
		{/if}

		<!--
		  Follow toggle. A star button next to the linked-alerts chip with a
		  popover that lists every user currently following the case. The
		  surface is public per the project policy: any user who can read
		  the case can see who's following.
		-->
		<Popover.Root>
			<Popover.Trigger
				class="inline-flex h-7 items-center gap-1 rounded-sm border bg-transparent px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2 {isFollowing
					? 'border-amber-500/40 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300'
					: 'border-border text-muted-foreground hover:text-foreground'}"
				aria-label={isFollowing ? 'Unfollow case' : 'Follow case'}
				aria-pressed={isFollowing}
			>
				<Star size={13} class={isFollowing ? 'fill-current' : ''} />
				<span class="tabular-nums">{followers?.length ?? 0}</span>
				<span class="hidden md:inline">
					{isFollowing ? 'Following' : 'Follow'}
				</span>
			</Popover.Trigger>
			<Popover.Content align="end" class="w-64 p-0">
				<div class="flex items-center justify-between gap-2 border-b px-3 py-2">
					<div class="text-xs font-semibold">
						{followers?.length ?? 0} follower{followers?.length === 1 ? '' : 's'}
					</div>
					<Button
						size="sm"
						variant={isFollowing ? 'outline' : 'default'}
						class="h-7 px-2 text-xs"
						disabled={followToggleBusy}
						onclick={toggleFollow}
					>
						<Star size={12} class={isFollowing ? 'fill-current' : ''} />
						{isFollowing ? 'Unfollow' : 'Follow'}
					</Button>
				</div>
				<div class="max-h-72 overflow-y-auto">
					{#if followers == null}
						<div class="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</div>
					{:else if followerLoadError}
						<div class="px-3 py-4 text-center text-xs text-destructive">{followerLoadError}</div>
					{:else if followers.length === 0}
						<div class="px-3 py-4 text-center text-xs text-muted-foreground">
							Nobody is following this case yet.
						</div>
					{:else}
						<ul class="flex flex-col py-1">
							{#each followers as f (f.user_id)}
								<li class="flex items-center gap-2 px-3 py-1.5 text-xs">
									<UserRound size={12} class="opacity-70" />
									<span class="min-w-0 flex-1 truncate">{f.user_name}</span>
									<span class="shrink-0 text-2xs text-muted-foreground">@{f.user_login}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</Popover.Content>
		</Popover.Root>

		{#if warRooms.length > 0}
			<Popover.Root>
				<Popover.Trigger
					class="inline-flex h-7 items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2 dark:text-red-300"
					aria-label="War rooms this case is attached to"
				>
					<ShieldAlert size={13} />
					<span class="tabular-nums">{warRooms.length}</span>
					<span class="hidden md:inline">War room{warRooms.length === 1 ? '' : 's'}</span>
				</Popover.Trigger>
				<Popover.Content align="end" class="w-64 p-0">
					<div class="border-b px-3 py-2 text-xs font-semibold">
						In {warRooms.length} war room{warRooms.length === 1 ? '' : 's'}
					</div>
					<ul class="flex max-h-72 flex-col overflow-y-auto py-1">
						{#each warRooms as room (room.war_room_id)}
							<li>
								<a
									href={`/war-rooms/${room.war_room_id}`}
									class="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50"
								>
									{#if room.color}
										<span
											class="h-2 w-2 shrink-0 rounded-full"
											style={`background-color: ${room.color};`}
											aria-hidden="true"
										></span>
									{/if}
									<span class="min-w-0 flex-1 truncate">{room.name}</span>
									<span
										class="shrink-0 rounded border px-1 text-[9px] uppercase tracking-wider text-muted-foreground"
									>
										{room.state}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</Popover.Content>
			</Popover.Root>
		{/if}

		<div class="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden="true"></div>

		<!--
			Section-aware "Add X" comes first so the primary CTA sits closest
			to the case context (state pill + alerts) and reads as part of the
			same conceptual group. DataStore/Activity panel toggles trail
			behind as utilities.
		-->
		<CaseQuickAddButton />

		<CaseAddDropdown buttonClass="h-8 w-8 rounded-sm p-0 [&_span]:hidden" />

		{#if datastorePanel}
			{@const dsOpen = datastorePanel.state.open}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="outline"
							size="icon"
							class={`relative h-8 w-8 rounded-sm ${dsOpen ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15' : ''}`}
							onclick={() => datastorePanel.toggle()}
							aria-label="Toggle DataStore panel"
							aria-pressed={dsOpen}
						>
							<DatabaseIcon size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{dsOpen ? 'Hide DataStore' : 'Show DataStore'}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}

		{#if activityPanel}
			{@const open = activityPanel.state.open}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							variant="outline"
							size="icon"
							class={`relative h-8 w-8 rounded-sm ${open ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15' : ''}`}
							onclick={() => activityPanel.toggle()}
							aria-label="Toggle case activity"
							aria-pressed={open}
						>
							<span class="relative flex items-center">
								<Activity size={16} />
								{#if open}
									<span
										class="absolute -right-1 -top-1 flex h-2 w-2"
										aria-hidden="true"
									>
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
										></span>
										<span
											class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"
										></span>
									</span>
								{/if}
							</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{open ? 'Hide live activity' : 'Show live activity'}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}

		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" size="icon" class="h-8 w-8 rounded-sm">
					<MoreHorizontal size={16} />
					<span class="sr-only">Case menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" class="min-w-[200px]">
				<DropdownMenuLabel>Manage Case</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<DropdownMenuItem onclick={() => (cases.ui.showManageModal = true)}>
					Edit Case Details
				</DropdownMenuItem>

				{#if menuItems}
					<DropdownMenuSeparator />
					{@render menuItems()}
				{/if}

				<DropdownMenuSeparator />
				<DropdownMenuItem>Export Case</DropdownMenuItem>
				<DropdownMenuItem>Archive Case</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>
