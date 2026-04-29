import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';

export const getAssetUrl = (caseId?: number, assetId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/assets/${assetId ?? ''}`;
};

export const newAsset = async (assets: CaseAssetsContext) => {
	assets.ui.showAddModal = true;

	const url = new URL(page.url);

	if (!(url.href.includes('/case/') && url.href.includes('/assets'))) {
		console.log('going to:', `${url.origin}/case/${assets.currentCaseId()}`);
		await goto(`${url.origin}/case/${assets.currentCaseId()}/assets`);
	}
};
