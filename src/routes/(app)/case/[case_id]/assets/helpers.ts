import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';

export const getAssetUrl = (caseId?: number, assetId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/assets/${assetId ?? ''}`;
};

// The Add dialog is mounted at the case layout, so opening it works from any
// sub-page of the case. We only redirect when we're outside the case entirely
// (e.g. triggered from a global topbar action).
export const newAsset = async (assets: CaseAssetsContext) => {
	assets.ui.showAddModal = true;

	if (!page.url.pathname.startsWith('/case/')) {
		await goto(`/case/${assets.currentCaseId()}/assets`);
	}
};
