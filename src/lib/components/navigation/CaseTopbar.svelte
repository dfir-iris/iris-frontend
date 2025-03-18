<script lang="ts">
	import { Building2, Clock, FileDigit, Hash, MoreHorizontal, Tag, UserRound, Shield, AlertTriangle, Activity, HashIcon } from 'lucide-svelte';
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
	import CaseAddDropdown from '../../../routes/(app)/case/[case_id]/CaseAddDropdown.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import type { Case } from '$lib/types/resources/case';

	export let caseData: Case;
	let severity: string = caseData.severity.severity_name;
	let status: string = caseData.state?.state_name || 'Unknown';
	export let tags: string[] = [];

	// Format the date if provided
	let formattedDate = '';
	if (caseData.open_date) {
		try {
			const date = new Date(caseData.open_date);
			formattedDate = date.toLocaleDateString();
		} catch (e) {
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

<div class="flex h-auto min-h-16 w-full flex-col border-b bg-background px-4 py-2 shadow-sm md:flex-row md:items-center md:justify-between">
	<div class="flex items-start gap-3 md:items-center">
		<!-- Case Icon Badge -->
		<div class="relative flex-shrink-0">
			<div class={`flex h-10 w-10 items-center justify-center rounded-full ${caseIconBg} ring-2 ${iconRingColor} ${isHighSeverity ? 'shadow-glow-red' : ''}`}>
				<svelte:component this={CaseIcon} size={20} class={caseIconColor} />
			</div>
		</div>

		<div class="flex flex-col overflow-hidden ml-1">
			<!-- Case Name -->
			<div class="flex items-center gap-2">
				<h2 class="truncate text-lg font-semibold">{caseData.case_name.split(' - ')[1]}</h2>
			</div>
			
			<!-- Additional case information -->
			<div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
				
				<Separator orientation="vertical"/>
				
				{#if caseData.owner?.user_name}
					<div class="flex items-center gap-1">
						<UserRound size={12} />
						<span>Owned by {caseData.owner.user_name}</span>
					</div>
				{/if}

				<Separator orientation="vertical"/>
				
				{#if formattedDate}
					<div class="flex items-center gap-1">
						<Clock size={12} />
						<span>Opened {formattedDate}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-2 flex flex-wrap items-center gap-2 md:mt-0 md:gap-3">
		<div class="hidden gap-1 sm:flex">
			{#each caseData.tags as tag}
				<div class="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
					<Tag size={12} />
					<span>{tag.tag_title}</span>
				</div>
			{/each}
		</div>
		
		<StatusBadge {status} />
		<SeverityBadge severity={severity} />
		
		<!-- Case Add Dropdown -->
		<CaseAddDropdown inTopbar={true} buttonClass="h-8" />
		
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
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

<style>
	/* Static glow effect for high severity cases */
	.shadow-glow-red {
		box-shadow: 0 0 8px 2px rgba(220, 38, 38, 0.3);
	}
</style>