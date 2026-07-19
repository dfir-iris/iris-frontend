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

export interface InvokeHookBody {
	hook_name: string;
	module_name: string;
	hook_ui_name: string;
	type: HookObjectType;
	targets: number[];
}

export interface InvokeHookResult {
	queued: number;
	logs?: string[];
}

export class HooksService {
	static async list(
		objectType: HookObjectType,
		options: ApiOptions = {}
	): Promise<RequestResponse<HookOption[]>> {
		return ApiService.get<HookOption[]>(
			`/dim-hooks?target=${encodeURIComponent(objectType)}`,
			options
		);
	}

	static async invoke(
		caseId: number,
		body: InvokeHookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<InvokeHookResult>> {
		return ApiService.post<InvokeHookResult>(
			`/cases/${caseId}/dim-hooks/invoke`,
			body,
			options
		);
	}
}
