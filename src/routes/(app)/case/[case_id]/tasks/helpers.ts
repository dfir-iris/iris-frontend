import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
import type { SearchCondition, SearchField } from '$lib/components/ui/advanced-search';
import type { Task } from '$lib/types/resources/task';

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

// --- Client-side task search ---------------------------------------
// Case tasks are filtered in the browser over whatever pages have been
// loaded (the list endpoint has no free-text parameter). Shared by the
// sidebar and the board so both interpret a query identically.

export const taskSearchFields: SearchField[] = [
	{ key: 'task_title', label: 'Title', type: 'text' },
	{ key: 'task_description', label: 'Description', type: 'text' },
	{ key: 'task_tags', label: 'Tags', type: 'text' },
	{ key: 'id', label: 'Task ID', type: 'number' }
];

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

const conditionMatchesTask = (task: Task, c: SearchCondition): boolean => {
	const q = c.value.toLowerCase();

	if (c.field === '_raw') {
		return (
			norm(task.task_title).includes(q) ||
			norm(task.task_description).includes(q) ||
			norm(task.task_tags).includes(q)
		);
	}

	const fieldValue = (() => {
		switch (c.field) {
			case 'task_title':
				return norm(task.task_title);
			case 'task_description':
				return norm(task.task_description);
			case 'task_tags':
				return norm(task.task_tags);
			case 'id':
				return String(task.id);
			default:
				return '';
		}
	})();

	switch (c.operator) {
		case 'like':
			return fieldValue.includes(q);
		case 'eq':
			return fieldValue === q;
		case 'not':
			return fieldValue !== q;
		default:
			return true;
	}
};

export const matchesTask = (task: Task, term: string, conditions: SearchCondition[]): boolean => {
	if (!term && conditions.length === 0) return true;

	if (conditions.length > 0) {
		return conditions.every((c) => conditionMatchesTask(task, c));
	}

	const q = term.toLowerCase();
	return (
		norm(task.task_title).includes(q) ||
		norm(task.task_description).includes(q) ||
		norm(task.task_tags).includes(q)
	);
};
