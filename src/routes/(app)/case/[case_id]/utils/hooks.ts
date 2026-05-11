import type { RequestResponse } from '$lib/services/api.service';
import { HooksService, type HookObjectType, type HookOption } from '$lib/services/hooks.service';

export const callHook = async (
	case_id: number,
	hookType: HookObjectType,
	targets: Array<number>,
	hookOption: HookOption
): Promise<{ status: string; message: string }> => {
	return (
		(await HooksService.call({
			cid: case_id,
			type: hookType,
			hook_name: hookOption.hook_name,
			module_name: hookOption.module_name,
			hook_ui_name: hookOption.manual_hook_ui_name,
			targets
		})) as RequestResponse<unknown>
	).data as { status: string; message: string };
};
