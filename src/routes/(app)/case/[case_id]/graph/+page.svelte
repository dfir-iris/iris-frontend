<script lang="ts">
	import { page } from '$app/state';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import CaseGraphView from './components/CaseGraphView.svelte';

	const caseId = $derived(Number(page.params.case_id));
</script>

<svelte:head>
	<title>#{page.params.case_id} - Graph</title>
</svelte:head>

<CaseWorkspace>
	{#key caseId}
		<CaseGraphView {caseId} />
	{/key}
</CaseWorkspace>
