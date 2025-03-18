<script lang="ts">
	import { MoreHorizontal, Tag, UserRound } from 'lucide-svelte';
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

	export let caseId: number;
	export let caseName: string;
	export let severity: string = '';
	export let status: string = "";
	export let tags: string[] = [];
	export let ownerName: string = '';
</script>

<div class="flex h-14 w-full flex-wrap items-center justify-between border-b bg-background px-4 shadow-sm">
	<div class="flex items-center gap-2 overflow-hidden">
		<div class="flex flex-col overflow-hidden">
			<div class="flex items-center gap-2">
				<h2 class="truncate text-lg font-semibold">{caseName}</h2>
			</div>
      <div class="flex items-center gap-1 text-xs text-muted-foreground">
        <span class="shrink-0 font-medium text-muted-foreground">#{caseId}</span>
        {#if ownerName}
          
            <UserRound size={12} />
            <span>Owned by {ownerName}</span>
        {/if}
      </div>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2 md:gap-3">
		<div class="hidden gap-1 sm:flex">
			{#each tags as tag}
				<div class="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
					<Tag size={12} />
					<span>{tag}</span>
				</div>
			{/each}
		</div>
		
		<StatusBadge {status} />
		<SeverityBadge severity={severity} />
		
		<!-- Case Add Dropdown moved from sidebar -->
		<CaseAddDropdown buttonClass="" />
		
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