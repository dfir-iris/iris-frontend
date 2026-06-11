import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';

export const getIocUrl = (caseId?: number, iocId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/iocs/${iocId ?? ''}`;
};

// The Add dialog is mounted at the case layout, so opening it works from any
// sub-page of the case. We only redirect when we're outside the case entirely
// (e.g. triggered from a global topbar action).
export const newIoc = async (iocs: CaseIocsContext) => {
	iocs.ui.showAddModal = true;

	if (!page.url.pathname.startsWith('/case/')) {
		await goto(`/case/${iocs.currentCaseId()}/iocs`);
	}
};
