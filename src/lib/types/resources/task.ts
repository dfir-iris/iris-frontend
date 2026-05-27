export interface TaskStatus {
	id: number;
	status_name: string;
	status_description: string;
	status_bscolor: string;
}

export interface TaskAssignee {
	id: number;
	user: string;
	name: string;
}

export interface TaskCase {
	case_id: number;
	case_name: string;
}

export interface Task {
	id: number;
	task_uuid: string;
	task_title: string;
	task_description: string | null;
	task_open_date: string;
	task_tags: string | null;
	task_status_id: number;
	status: TaskStatus | null;
	task_assignees: TaskAssignee[] | null;
	task_assignees_id: number[] | null;
	case: TaskCase | null;
	custom_attributes: Record<string, unknown> | null;
	modification_history: Record<string, unknown> | null;
}
