<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Building2,
		Clock,
		FileDigit,
		MoreHorizontal,
		Tag,
		UserRound,
		Shield,
		Activity
	} from 'lucide-svelte';
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

	let icon = $state<IconState>({
		Icon: Shield,
		iconColor: 'text-blue-500',
		iconBg: 'bg-blue-100',
		ring: 'ring-blue-300',
		glow: false
	});

	$effect(() => {
		caseData = cases.currentCase() ?? null;

		const severityName = caseData?.severity?.severity_name ?? 'Unspecified';
		const statusName = caseData?.state?.state_name ?? 'Unspecified';

		severity = severityName as Severity;
		status = statusName as CaseStatus;

		formattedDate = new Date(caseData?.open_date as string).toLocaleDateString();

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

<div
	class="flex items-center gap-3 border-b bg-background px-4 py-2"
>
	<!-- Case icon badge: a single compact glyph that conveys severity at a glance. -->
	<div
		class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${icon.iconBg} ${icon.glow ? 'shadow-glow-danger' : ''}`}
	>
		<icon.Icon size={16} class={icon.iconColor} />
	</div>

	<!-- Title + inline metadata. One line when there's room; wraps gracefully when narrow. -->
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex items-center gap-2">
			<h2 class="truncate text-sm font-semibold leading-tight">
				{caseData?.case_name.split(' - ')[1] ?? caseData?.case_name}
			</h2>

			{#if caseData?.case_id}
				<span class="shrink-0 font-mono text-2xs text-muted-foreground">#{caseData.case_id}</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
			{#if caseData?.case_customer?.customer_name}
				<div class="flex items-center gap-1">
					<Building2 size={11} />
					<span class="truncate">{caseData.case_customer.customer_name}</span>
				</div>
			{/if}

			{#if caseData?.case_soc_id}
				<div class="flex items-center gap-1">
					<FileDigit size={11} />
					<span>SOC #{caseData.case_soc_id}</span>
				</div>
			{/if}

			{#if caseData?.owner?.user_name}
				<div class="flex items-center gap-1">
					<UserRound size={11} />
					<span class="truncate">{caseData.owner.user_name}</span>
				</div>
			{/if}

			{#if formattedDate}
				<div class="flex items-center gap-1">
					<Clock size={11} />
					<span>{formattedDate}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tags: show a couple inline, collapse the rest into a +N pill so they don't push the badges off screen. -->
	{#if caseData?.tags?.length}
		<div class="hidden items-center gap-1 md:flex">
			{#each caseData.tags.slice(0, 2) as tag}
				<div class="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs">
					<Tag size={10} />
					<span class="max-w-[8rem] truncate">{tag.tag_title}</span>
				</div>
			{/each}

			{#if caseData.tags.length > 2}
				<div
					class="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
					title={caseData.tags
						.slice(2)
						.map((t) => t.tag_title)
						.join(', ')}
				>
					+{caseData.tags.length - 2}
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex shrink-0 items-center gap-1.5">
		<StatusBadge {status} />
		<SeverityBadge {severity} />

		<CaseAddDropdown buttonClass="h-7" />

		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" size="icon" class="h-7 w-7">
					<MoreHorizontal size={16} />
					<span class="sr-only">Case menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Manage Case</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<DropdownMenuItem onclick={() => (cases.ui.showManageModal = true)}>
					Edit Case Details
				</DropdownMenuItem>

				<DropdownMenuSeparator />
				<DropdownMenuItem>Export Case</DropdownMenuItem>
				<DropdownMenuItem>Archive Case</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>
