<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import DashboardLayout from '$lib/layouts/dashboard-layout.svelte';

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
	<title>Case #{data.case_id} | IRIS </title>
</svelte:head>

{#await data.case}
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
	<div class="flex h-full flex-col overflow-hidden">
		<!-- Case header -->
		<!-- <div class="flex flex-col items-start gap-y-1 p-4">
			<div class="mb-4 flex w-full flex-row items-center">
				<div>
					<h1 class="text-2xl ml-2 font-semibold">{caseData.case_name}</h1>
					<p class="text-sm ml-2 text-muted-foreground">Opened on {new Date(caseData.open_date).toLocaleString()} by {caseData.owner.user_name}</p>
				</div>

				<!-- Add to case control -->
				<!-- <div class="ml-auto">
					<CaseSwitcher />
				</div>
			</div>
		</div> --> 

		<!-- Case content -->
		<div>
			<DashboardLayout data={caseData} {children} />
			{@render children()}
		</div>
	</div>
{/await}
