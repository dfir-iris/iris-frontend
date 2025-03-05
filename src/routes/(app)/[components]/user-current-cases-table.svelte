<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { invalidate } from '$app/navigation';

	import type { Case } from '$lib/types/resources/case';
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';

	let {
		cases
	}: {
		cases: Promise<RequestResponse<Paginated<Case>>>;
	} = $props();
</script>

<Card.Root class="flex h-full flex-col overflow-hidden">
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-lg font-medium">Owned Cases</Card.Title>
		{#await cases then cases}
			<Button variant="ghost" size="icon" onclick={() => invalidate(cases.url)}>
				<RefreshCw class="h-4 w-4" />
			</Button>
		{/await}
	</Card.Header>
	<Card.Content class="h-full items-center justify-between overflow-clip rounded-lg p-0">
		<CasesDataTable class="h-full border-0" {cases} />
	</Card.Content>
</Card.Root>
