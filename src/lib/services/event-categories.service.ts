import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type EventCategoryIdentifier = number;

export interface EventCategory {
	id: number;
	name: string;
}

export class EventCategoriesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<EventCategory[]>> {
		return ApiService.get<EventCategory[]>('/manage/event-categories', options);
	}
}
