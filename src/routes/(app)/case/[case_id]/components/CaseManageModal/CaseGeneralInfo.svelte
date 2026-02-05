<script lang="ts">
	import DOMPurify from 'dompurify';
	import { converter } from '$lib/components/common/Ace';
	import type { Case } from '$lib/types/resources/case';

	type CaseGeneralInfoProps = {
		currentCase: Case;
	};

	let { currentCase }: CaseGeneralInfoProps = $props();

	let safeHtml = $derived(
		DOMPurify.sanitize(converter.makeHtml(currentCase.case_description ?? ''))
	);
</script>

<grid class="grid grid-cols-2 gap-0">
	<div><b>Case name:</b> {currentCase.case_name}</div>
	<div><b>Customer:</b> {currentCase.case_customer.customer_name}</div>

	{#if currentCase.tags.length}
		<div><b>Case tags:</b> {currentCase.tags.join(', ')}</div>
	{/if}

	<div><b>SOC ID:</b> {currentCase.case_soc_id}</div>
	<div><b>Case ID:</b> {currentCase.case_id}</div>
	<div><b>Case UUID:</b> {currentCase.case_uuid}</div>

	{#if currentCase.classification_id}
		<div><b>Classification:</b> {currentCase.classification_id}</div>
	{/if}

	{#if currentCase.state}
		<div><b>State:</b> {currentCase.state.state_name}</div>
	{/if}

	{#if currentCase.severity}
		<div><b>Severity:</b> {currentCase.severity}</div>
	{/if}

	<div><b>Open date:</b> {currentCase.open_date}</div>
	<div><b>Opening user:</b> {currentCase.user_id}</div>
	<div><b>Owner:</b> {currentCase.owner.user_name}</div>
</grid>

<h2 class="mb-2 mt-12 text-xl font-bold">Case description</h2>

<p class="prose dark:prose-invert max-w-none">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html safeHtml}
</p>
