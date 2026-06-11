import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';

export const getTaskUrl = (caseId?: number, taskId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/tasks/${taskId ?? ''}`;
};

// The Add dialog is mounted at the case layout, so opening it works from any
// sub-page of the case. We only redirect when we're outside the case entirely
// (e.g. triggered from a global topbar action).
export const newTask = async (tasks: CaseTasksContext) => {
	tasks.ui.showAddModal = true;

	if (!page.url.pathname.startsWith('/case/')) {
		await goto(`/case/${tasks.currentCaseId()}/tasks`);
	}
};
