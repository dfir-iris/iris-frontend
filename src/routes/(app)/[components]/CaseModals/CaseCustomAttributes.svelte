<!--
  Custom-attributes tab of CaseManageModal. Delegates the whole edit
  loop to the shared CustomAttributesTab and only wires in the case
  context's PUT.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import CustomAttributesTab from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { Case } from '$lib/types/resources/case';

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCase = $derived<Case | null>(cases.currentCase());
	const caseId = $derived(cases.currentCaseId());

	const save = async (values: Record<string, Record<string, unknown>>) => {
		await cases.patch(caseId, { custom_attributes: values as Record<string, unknown> });
	};
</script>

<CustomAttributesTab
	objectType="case"
	existing={(currentCase?.custom_attributes ?? null) as Record<
		string,
		Record<string, unknown>
	> | null}
	onSave={save}
/>
