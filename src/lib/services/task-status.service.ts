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
			'/manage/task-statuses',
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	/**
	 * v2 doesn't expose a bare get-by-id endpoint for task statuses —
	 * the row count is small enough that filtering the full list is
	 * cheaper than building one. Keeps the same signature so existing
	 * callers continue to work.
	 */
	static async get(
		taskStatusId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TaskStatus | null>> {
		const list = await TaskStatusService.list(options);
		if (!list.ok || !Array.isArray(list.data)) {
			return { ...list, data: null };
		}
		const found =
			list.data.find((s: TaskStatus) => (s as TaskStatus & { id?: number }).id === taskStatusId) ??
			null;
		return { ...list, data: found };
	}
}
