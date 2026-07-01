<!--
  Evidence detail route page. The actual panel UI lives in EvidenceDetailView so the
  same content can be rendered inside a modal (EvidenceDetailDialog) reached from
  mention chips in the markdown editor.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { SearchIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import EvidenceDetailView from './EvidenceDetailView.svelte';

	const caseId = $derived(Number(page.params.case_id));
	const evidenceId = $derived(Number(page.params.evidence_id));

	const handleAfterDelete = () => {
		goto(`/case/${caseId}/evidence`, { replaceState: true });
	};
</script>

<svelte:head>
	<title>#{caseId} - Evidence #{evidenceId}</title>
</svelte:head>

{#if Number.isFinite(evidenceId)}
	<EvidenceDetailView {caseId} {evidenceId} onAfterDelete={handleAfterDelete} />
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />

		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">Evidence Not Found</h2>

		<p class="text-muted-foreground">
			Please select an evidence from the list on the left, or try refreshing the page.
		</p>

		<Button
			variant="outline"
			class="mt-6"
			onclick={() => goto(`/case/${caseId}/evidence`, { replaceState: true })}
		>
			Go to Evidence List
		</Button>
	</div>
{/if}
