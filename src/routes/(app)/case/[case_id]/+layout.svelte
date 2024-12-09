<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import {
		DropdownMenu,
		DropdownMenuItem,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuLabel
	} from '$lib/components/ui/dropdown-menu';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		ActivityIcon,
		ChartGanttIcon,
		ClipboardListIcon,
		FileBadgeIcon,
		FlagIcon,
		NotepadTextIcon,
		PlusIcon,
		RouterIcon
	} from 'lucide-svelte';
	import { Tabs, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let currentTab = $state('');

	// Sync $currentTab with the URL
	$effect.pre(() => {
		const urlSplit = $page.url.pathname.split('/');
		const tab = urlSplit[urlSplit.length - 1];
		currentTab = tab == data.case_id ? 'overview' : tab;
	});

	// Set the URL to the value of currentTab when it changes
	$effect(() => {
		if (!currentTab) return;
		goto(`/case/${data.case_id}/${currentTab}`);
	});
</script>

<svelte:head>
	<title>Case #{data.case_id} | DFIR-IRIS</title>
</svelte:head>

{#await data.case then { data: caseData }}
	<div class="flex h-full flex-col overflow-hidden">
		<!-- Case header -->
		<div class="flex flex-col items-start gap-y-1 overflow-y-auto border-r p-4 shadow">
			<div class="mb-2 flex w-full flex-row items-center">
				<div>
					<p class="text-sm font-medium text-secondary-foreground">#{data.case_id}</p>
					<h1 class="text-2xl font-medium">{caseData.case_name.split(' - ', 2)[1]}</h1>
				</div>

				<!-- Add to case control -->
				<div class="ml-auto">
					<DropdownMenu>
						<DropdownMenuTrigger class="!w-fit">
							<Button variant="default" class="gap-x-1.5 rounded-full !px-3 py-4">
								<PlusIcon size={22} /> Add to Case
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent class="w-56" align="end" side="bottom">
							<DropdownMenuLabel>What do you want to add?</DropdownMenuLabel>
							<DropdownMenuItem>
								<NotepadTextIcon size={20}></NotepadTextIcon>
								<span>Note</span>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<ClipboardListIcon size={20}></ClipboardListIcon>
								<span>Task</span>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<RouterIcon size={20}></RouterIcon>
								<span>Asset</span>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<FlagIcon size={20}></FlagIcon>
								<span>Indicator</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<!-- Tabs -->
			<Tabs bind:value={currentTab} class="w-[400px]">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="notes">Notes</TabsTrigger>
					<TabsTrigger value="assets">Assets</TabsTrigger>
					<TabsTrigger value="evidence">Evidence</TabsTrigger>
					<TabsTrigger value="indicators">Indicators</TabsTrigger>
					<TabsTrigger value="timeline">Timeline</TabsTrigger>
					<TabsTrigger value="activity">Activity</TabsTrigger>
				</TabsList>
			</Tabs>
		</div>

		<!-- Case content -->
		<div>
			{@render children()}
		</div>
	</div>
{/await}
