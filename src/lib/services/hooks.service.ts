import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type HookObjectType =
	| 'case'
	| 'ioc'
	| 'asset'
	| 'note'
	| 'event'
	| 'task'
	| 'evidence'
	| 'global_task';

export interface HookOption {
	hook_name: string;
	manual_hook_ui_name: string;
	module_name: string;
}

export interface ListHooksResponse {
	data: HookOption[];
	message: string;
	status: string;
}

export interface CallHookBody {
    cid: number;
	hook_name: string;
	module_name: string;
	hook_ui_name: string;
	type: HookObjectType;
	targets: number[];
}

export class HooksService {
	static async list(
		objectType: HookObjectType,
		options: ApiOptions = {}
	): Promise<RequestResponse<ListHooksResponse>> {
		return ApiService.get<ListHooksResponse>(`/dim/hooks/options/${objectType}/list`, options);
	}

	static async call(body: CallHookBody, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.post<null>('/dim/hooks/call', body, options);
	}
}
