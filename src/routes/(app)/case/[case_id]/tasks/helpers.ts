import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';

export const getTaskUrl = (caseId?: number, taskId?: string | 'add') => {
	const url = new URL(page.url);

	return `${url.origin}/case/${caseId ?? page.params.case_id}/tasks/${taskId ?? ''}`;
};

export const newTask = async (tasks: CaseTasksContext) => {
	tasks.ui.showAddModal = true;

	const url = new URL(page.url);

	if (!(url.href.includes('/case/') && url.href.includes('/tasks'))) {
		await goto(`${url.origin}/case/${tasks.currentCaseId()}/tasks`);
	}
};
