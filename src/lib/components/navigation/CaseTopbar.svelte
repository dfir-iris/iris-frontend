<script lang="ts">
	import { Building2, Clock, FileDigit, Hash, MoreHorizontal, Tag, UserRound } from 'lucide-svelte';
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
</script>

<div class="flex h-auto min-h-16 w-full flex-col border-b bg-background px-4 py-2 shadow-sm md:flex-row md:items-center md:justify-between">
	<div class="flex flex-col overflow-hidden">
		<!-- Case ID and Name -->
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-sm font-medium">
				<Hash size={14} />
				<span>{caseData.case_id}</span>
			</div>
			<h2 class="truncate text-lg font-semibold">{caseData.case_name.split(' - ')[1]}</h2>
		</div>
		
		<!-- Additional case information -->
		<div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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