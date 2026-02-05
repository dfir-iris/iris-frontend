<script lang="ts">
	import {
		Building2,
		Clock,
		FileDigit,
		MoreHorizontal,
		Tag,
		UserRound,
		Shield,
		Activity,
		HashIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
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
	import { Separator } from '$lib/components/ui/separator';
	import type { Case } from '$lib/types/resources/case';
	import type { CaseStatus, Severity } from '$lib/components/ui/badge/types';
	import CaseAddDropdown from './CaseAddDropdown.svelte';

	export let caseData: Case;

	let severity = (caseData?.severity?.severity_name || 'Unspecified') as Severity;
	let status = (caseData?.state?.state_name || 'Unspecified') as CaseStatus;

	// Format the date if provided
	let formattedDate = '';
	if (caseData?.open_date) {
		try {
			const date = new Date(caseData.open_date);
			formattedDate = date.toLocaleDateString();
		} catch {
			formattedDate = caseData.open_date;
		}
	}

	// Determine case icon based on severity
	let CaseIcon = Shield;
	let caseIconColor = 'text-blue-500';
	let caseIconBg = 'bg-blue-100';
	let iconRingColor = 'ring-blue-300';
	let isHighSeverity = false;

	if (severity.toLowerCase() === 'critical' || severity.toLowerCase() === 'high') {
		CaseIcon = Shield;
		caseIconColor = 'text-red-500';
		caseIconBg = 'bg-red-50';
		iconRingColor = 'ring-red-300';
		isHighSeverity = true;
	} else if (severity.toLowerCase() === 'medium') {
		CaseIcon = Activity;
		caseIconColor = 'text-amber-500';
		caseIconBg = 'bg-amber-50';
		iconRingColor = 'ring-amber-300';
	}
</script>

<div
	class="flex min-h-16 flex-col border-b bg-background p-2 shadow-sm xl:flex-row xl:items-center"
>
	<div class="flex grow items-center">
		<!-- Case Icon Badge -->
		<div class="flex">
			<div
				class={`mr-2 flex h-10 w-10 items-center justify-center rounded-full ${caseIconBg} ring-2 ${iconRingColor} ${isHighSeverity ? 'shadow-glow-danger' : ''}`}
			>
				<svelte:component this={CaseIcon} size={20} class={caseIconColor} />
			</div>
		</div>

		<div class="ml-1 flex flex-col flex-wrap overflow-hidden">
			<!-- Case Name -->
			<div class="flex items-center gap-2">
				<h2 class="truncate text-lg font-semibold">{caseData?.case_name.split(' - ')[1]}</h2>
			</div>

			<!-- Additional case information -->
			<div
				class="mt-1.5 flex flex-nowrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
			>
				{#if caseData.case_id}
					<div class="flex items-center gap-1">
						<HashIcon size={12} />
						<span class="font-medium">{caseData.case_id}</span>
					</div>
				{/if}

				{#if caseData.case_customer?.customer_name}
					<div class="flex items-center gap-1">
						<Building2 size={12} />
						<span class="font-medium">{caseData.case_customer.customer_name}</span>
					</div>
				{/if}

				{#if caseData.case_soc_id}
					<div class="flex items-center gap-1">
						<FileDigit size={12} />
						<span>SOC #{caseData.case_soc_id}</span>
					</div>
				{/if}

				<Separator orientation="vertical" />

				{#if caseData.owner?.user_name}
					<div class="flex items-center gap-1">
						<UserRound size={12} />
						<span>Owned by {caseData.owner.user_name}</span>
					</div>
				{/if}

				<Separator orientation="vertical" />

				{#if formattedDate}
					<div class="flex items-center gap-1">
						<Clock size={12} />
						<span>Opened {formattedDate}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-2 flex justify-start gap-2 xl:mt-0 xl:justify-end">
		<div class="hidden gap-1 sm:flex">
			{#each caseData.tags as tag}
				<div class="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
					<Tag size={12} />
					<span>{tag.tag_title}</span>
				</div>
			{/each}
		</div>

		<StatusBadge {status} />
		<SeverityBadge {severity} />

		<!-- Case Add Dropdown -->
		<CaseAddDropdown buttonClass="h-8" />

		<div class="flex grow xl:hidden"></div>

		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button variant="ghost" size="icon" class="h-8 w-8">
					<MoreHorizontal size={18} />
					<span class="sr-only">Case menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Manage Case</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>Edit Case Details</DropdownMenuItem>
				<DropdownMenuItem>Manage Tags</DropdownMenuItem>
				<DropdownMenuItem>Change Status</DropdownMenuItem>
				<DropdownMenuItem>Change Severity</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem>Export Case</DropdownMenuItem>
				<DropdownMenuItem>Archive Case</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>
