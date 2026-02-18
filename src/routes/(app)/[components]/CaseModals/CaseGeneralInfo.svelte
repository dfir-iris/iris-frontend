<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import type { RequestResponse } from '$lib/services/api.service';
	import { type User, UsersService } from '$lib/services/users.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let openingUser = $state<User>();

	onMount(async () => {
		if (currentCase?.user_id) {
			const getUserResponse = (await UsersService.get(currentCase?.user_id))
				.data as unknown as RequestResponse<User>;

			openingUser = getUserResponse.data as User;
		}
	});
</script>

<grid class="grid grid-cols-2 gap-1 text-sm">
	<div><b>Case name:</b> {currentCase?.case_name}</div>
	<div><b>Customer:</b> {currentCase?.case_customer.customer_name}</div>

	{#if currentCase?.tags.length}
		<div><b>Case tags:</b> {currentCase.tags.join(', ')}</div>
	{/if}

	<div><b>SOC ID:</b> {currentCase?.case_soc_id}</div>
	<div><b>Case ID:</b> {currentCase?.case_id}</div>
	<div><b>Case UUID:</b> {currentCase?.case_uuid}</div>

	{#if currentCase?.classification_id}
		<div><b>Classification:</b> {currentCase.classification_id}</div>
	{/if}

	{#if currentCase?.state}
		<div><b>State:</b> {currentCase.state.state_name}</div>
	{/if}

	{#if currentCase?.severity}
		<div><b>Severity:</b> {currentCase.severity?.severity_name}</div>
	{/if}

	<div><b>Open date:</b> {currentCase?.open_date}</div>
	<div><b>Opening user:</b> {openingUser?.user_name}</div>
	<div><b>Owner:</b> {currentCase?.owner?.user_name}</div>
</grid>
