import type { Task } from '$lib/types/resources/task';

export interface TaskExportColumn {
	key: string;
	header: string;
	getter: (task: Task) => string;
	defaultSelected?: boolean;
}

export const AVAILABLE_TASK_EXPORT_COLUMNS: TaskExportColumn[] = [
	{
		key: 'id',
		header: 'Task ID',
		getter: (t) => String(t.id),
		defaultSelected: false
	},
	{
		key: 'task_title',
		header: 'Title',
		getter: (t) => t.task_title,
		defaultSelected: true
	},
	{
		key: 'status',
		header: 'Status',
		getter: (t) => t.status?.status_name ?? '',
		defaultSelected: true
	},
	{
		key: 'assignees',
		header: 'Assignees',
		getter: (t) => (t.task_assignees ?? []).map((a) => a.name || a.user).join(';'),
		defaultSelected: true
	},
	{
		key: 'task_open_date',
		header: 'Open Date',
		getter: (t) => t.task_open_date,
		defaultSelected: true
	},
	{
		key: 'task_tags',
		header: 'Tags',
		getter: (t) => t.task_tags ?? '',
		defaultSelected: false
	},
	{
		key: 'task_description',
		header: 'Description',
		getter: (t) => t.task_description ?? '',
		defaultSelected: false
	}
];

export function escapeCSVValue(value: string | null | undefined): string {
	if (value === null || value === undefined) return '';
	const s = String(value);
	if (s.includes(',') || s.includes('"') || s.includes('\n')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

export function convertTasksToCSV(tasks: Task[], columns: TaskExportColumn[]): string {
	if (!tasks.length || !columns.length) return '';
	const header = columns.map((c) => escapeCSVValue(c.header)).join(',');
	const rows = tasks.map((t) => columns.map((c) => escapeCSVValue(c.getter(t))).join(','));
	return [header, ...rows].join('\r\n');
}
