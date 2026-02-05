<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import type { Case } from '$lib/types/resources/case';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CaseTopbar from './components/CaseTopbar.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

{#await data.case}
	<!-- Skeleton loader while awaiting case data -->
	<div class="flex flex-col overflow-hidden">
		<div class="flex items-start gap-y-1 overflow-y-auto border-b p-4 shadow">
			<div class="mb-2 flex w-full flex-col items-start">
				<Skeleton class="mb-2 h-3 w-8"></Skeleton>
				<Skeleton class="h-6 w-24"></Skeleton>
				<Skeleton class="mt-4 h-8 w-1/2"></Skeleton>
			</div>
		</div>
	</div>
{:then { data: caseData }}
	<div class="flex w-full grow flex-col bg-background">
		<CaseTopbar caseData={caseData as Case} />

		<div class="flex grow overflow-y-auto bg-muted">
			{@render children()}
		</div>
	</div>
{/await}
