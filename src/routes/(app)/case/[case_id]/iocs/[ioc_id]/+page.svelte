<!--
  IOC detail route page. The actual panel UI lives in IocDetailView so the
  same content can be rendered inside a modal (IocDetailDialog) reached from
  mention chips in the markdown editor.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { SearchIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import IocDetailView from './IocDetailView.svelte';

	const caseId = $derived(Number(page.params.case_id));
	const iocId = $derived(Number(page.params.ioc_id));

	const handleAfterDelete = () => {
		goto(`/case/${caseId}/iocs`, { replaceState: true });
	};
</script>

<svelte:head>
	<title>#{caseId} - IOC #{iocId}</title>
</svelte:head>

{#if Number.isFinite(iocId)}
	<IocDetailView {caseId} {iocId} onAfterDelete={handleAfterDelete} />
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />

		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">IOC Not Found</h2>

		<p class="text-muted-foreground">
			Please select an IOC from the list on the left, or try refreshing the page.
		</p>

		<Button
			variant="outline"
			class="mt-6"
			onclick={() => goto(`/case/${caseId}/iocs`, { replaceState: true })}
		>
			Go to IOC List
		</Button>
	</div>
{/if}
