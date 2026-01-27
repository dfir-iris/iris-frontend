<script lang="ts">
	import CaseTopbar from '$lib/components/navigation/CaseTopbar.svelte';

	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { Case } from '$lib/types/resources/case';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
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
	<div class="flex h-full flex-col overflow-hidden bg-background">
		<!-- Case Topbar with owner name -->
		<CaseTopbar caseData={caseData as Case} />

		<div class="flex h-full flex-row overflow-hidden">
			<!-- MARK: Case content -->
			<div class="flex h-full w-full flex-col overflow-y-auto bg-muted">
				{@render children()}
			</div>
		</div>
	</div>
{/await}
