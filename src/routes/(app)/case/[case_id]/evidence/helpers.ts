import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseEvidencesContext } from '$lib/contexts/case-evidences.context.svelte';

export const getEvidenceUrl = (caseId?: number, evidenceId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/evidence/${evidenceId ?? ''}`;
};

export const newEvidence = async (evidences: CaseEvidencesContext) => {
	evidences.ui.showAddModal = true;

	const url = new URL(page.url);

	if (!(url.href.includes('/case/') && url.href.includes('/evidence'))) {
		await goto(`${url.origin}/case/${evidences.currentCaseId()}/evidence`);
	}
};
