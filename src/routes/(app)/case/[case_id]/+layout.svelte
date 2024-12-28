<script lang="ts">
	import CaseAddDropdown from './CaseAddDropdown.svelte';

	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import SidenavIconButton from '$lib/components/navigation/SidenavIconButton.svelte';
	import {
		BiohazardIcon,
		ChartNetworkIcon,
		CheckCheckIcon,
		ClockIcon,
		ComputerIcon,
		FileLockIcon,
		FileTextIcon,
		NotebookIcon,
		PanelLeftCloseIcon,
		PanelLeftOpenIcon,
		ShieldAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	import CaseSwitcher from '$lib/layouts/case-switcher.svelte';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let sidenavCollapsed = $state(false);
</script>

<svelte:head>
	<title>Case #{data.caseId} | IRIS</title>
</svelte:head>

{#await data.case}
	<!-- Skeleton loader while awaiting case data -->
	<div class="flex h-full flex-col overflow-hidden">
		<div class="flex flex-col items-start gap-y-1 overflow-y-auto border-b p-4 shadow">
			<div class="mb-2 flex w-full flex-col items-start">
				<Skeleton class="mb-2 h-3 w-8"></Skeleton>
				<Skeleton class="h-6 w-24"></Skeleton>
				<Skeleton class="mt-4 h-8 w-1/2"></Skeleton>
			</div>
		</div>
	</div>
{:then { data: caseData }}
	{@const baseUrl = `/case/${data.caseId}`}
	<div class="flex h-full flex-row overflow-hidden bg-background">
		<!-- Case navigation -->
		<div
			class="flex h-full {sidenavCollapsed
				? 'w-14 gap-y-4'
				: 'w-72 gap-y-3'} flex-col overflow-clip border-r bg-muted/20 px-2 py-4 transition-[width]"
		>
			<!-- Case info -->
			{#if !sidenavCollapsed}
				<div class="px-1">
					<p class="text-sm">#{data.caseId}</p>
					<h2>{caseData.name?.split(' - ', 2)[1]}</h2>
				</div>
				<div class="flex flex-row gap-x-2">
					<StatusBadge status="In progress"></StatusBadge>
					<SeverityBadge severity="High"></SeverityBadge>
				</div>
			{:else}
				<p class="text-center text-sm">#{data.caseId}</p>
			{/if}

			<!-- Add to case dropdown -->
			<CaseAddDropdown isCollapsed={sidenavCollapsed}></CaseAddDropdown>

			<!-- Investigation links -->
			{#if !sidenavCollapsed}
				<h4 class="px-3">Investigation</h4>
			{/if}
			<div class="flex flex-col {sidenavCollapsed ? 'gap-y-1' : ''}">
				<SidenavIconButton icon={FileTextIcon} label="Summary" href={baseUrl}></SidenavIconButton>
				<SidenavIconButton icon={NotebookIcon} label="Notes" href="{baseUrl}/notes"
				></SidenavIconButton>
				<SidenavIconButton counter={5} icon={ComputerIcon} label="Assets" href="{baseUrl}/assets"
				></SidenavIconButton>
				<SidenavIconButton counter={15} icon={BiohazardIcon} label="IOCs" href="{baseUrl}/iocs"
				></SidenavIconButton>
				<SidenavIconButton icon={ClockIcon} label="Timeline" href="{baseUrl}/timeline"
				></SidenavIconButton>
				<SidenavIconButton icon={ChartNetworkIcon} label="Graph" href="{baseUrl}/graph"
				></SidenavIconButton>
				<SidenavIconButton counter={3} icon={CheckCheckIcon} label="Tasks" href="{baseUrl}/tasks"
				></SidenavIconButton>
				<SidenavIconButton icon={FileLockIcon} label="Evidence" href="{baseUrl}/evidence"
				></SidenavIconButton>
				<SidenavIconButton icon={ShieldAlertIcon} label="War Room" href="{baseUrl}/war-room"
				></SidenavIconButton>
			</div>

			<!-- Collapse -->
			<Button
				on:click={() => (sidenavCollapsed = !sidenavCollapsed)}
				variant="outline"
				class="ml-auto mr-2 mt-auto px-2"
			>
				{#if sidenavCollapsed}
					<PanelLeftOpenIcon />
				{:else}
					<PanelLeftCloseIcon />
				{/if}
			</Button>
		</div>

		<!-- MARK: Case content -->
		<div class="flex h-full w-full flex-col overflow-y-auto bg-muted">
			{@render children()}
		</div>
	</div>
{/await}
