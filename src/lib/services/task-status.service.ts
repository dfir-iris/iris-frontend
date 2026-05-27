import type { TaskStatus } from '$lib/types/resources/task';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

type ApiEnvelope<T> = {
	data: T;
	message?: string;
	status?: string;
};

export class TaskStatusService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<TaskStatus[]>> {
		const res = await ApiService.get<ApiEnvelope<TaskStatus[]>>(
			'/manage/task-status/list',
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	static async get(
		taskStatusId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TaskStatus>> {
		const res = await ApiService.get<ApiEnvelope<TaskStatus>>(
			`/manage/task-status/${taskStatusId}`,
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: null };
	}
}
