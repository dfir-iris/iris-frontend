<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Activity,
		AlertTriangleIcon,
		Building2,
		CheckCircle2Icon,
		Clock,
		EyeIcon,
		FileDigit,
		InfoIcon,
		LockIcon,
		MoreHorizontal,
		Shield,
		Tag,
		UserRound
	} from 'lucide-svelte';
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
	import CaseAddDropdown from './CaseAddDropdown.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		menuItems?: Snippet;
	};

	let { menuItems }: Props = $props();

	const cases = getContext<CasesContext>(CASES_CTX);

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
	{#if isClosed}
		<!--
		  Diagonal "CLOSED" stripe pattern across the banner. Subtle enough
		  to keep the text readable, distinctive enough to be impossible to
		  miss even at a glance. Disabled below the title content via z-index.
		-->
		<div
			class="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
			style="background-image: repeating-linear-gradient(45deg, rgb(220 38 38) 0 12px, transparent 12px 24px);"
			aria-hidden="true"
		></div>
	{/if}

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

	<!-- Right cluster: status/severity grouped, then action buttons -->
	<div class="flex shrink-0 items-center gap-1 sm:gap-2">
		{#if reviewMeta.variant}
			{@const isComplete = reviewMeta.variant === 'complete'}
			{@const chipClass = isComplete
				? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/50 dark:text-emerald-300'
				: 'border-amber-500/40 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/50 dark:text-amber-300'}

			<Popover.Root>
				<Popover.Trigger>
					<!-- md+ chip with label; below md only the icon shows -->
					<span
						class="inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs font-medium transition-colors hover:brightness-95 sm:px-2 {chipClass}"
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

		<!-- Full pill on sm+ -->
		<div
			class="hidden items-center gap-1 rounded-lg border bg-muted/30 px-1 py-0.5 sm:flex"
		>
			{#if !isClosed}
				<StatusBadge {status} />
			{/if}
			<SeverityBadge {severity} />
		</div>

		<!-- Icon-only on small screens, no surrounding pill -->
		<div class="flex items-center sm:hidden">
			{#if !isClosed}
				<StatusBadge {status} icon_only />
			{/if}
			<SeverityBadge {severity} icon_only />
		</div>

		<div class="hidden h-6 w-px bg-border sm:block" aria-hidden="true"></div>

		<CaseAddDropdown buttonClass="h-8" />

		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" size="icon" class="h-8 w-8">
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
