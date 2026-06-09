import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';

export const getIocUrl = (caseId?: number, iocId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/iocs/${iocId ?? ''}`;
};

export const newIoc = async (assets: CaseIocsContext) => {
	assets.ui.showAddModal = true;

	const url = new URL(page.url);

	if (!(url.href.includes('/case/') && url.href.includes('/iocs'))) {
		await goto(`${url.origin}/case/${assets.currentCaseId()}/iocs`);
	}
};
