import {
	HooksService,
	type HookObjectType,
	type HookOption,
	type InvokeHookResult
} from '$lib/services/hooks.service';
import type { RequestResponse } from '$lib/services/api.service';

type HookCallOutcome = { status: string; message: string };

/**
 * Turn an invoke response into a `{status, message}` pair the caller can
 * drop straight into a toast.
 *
 * The v2 backend returns `{queued, logs?}` where a non-empty `logs`
 * means "queued fewer than requested" — every listed line is a target
 * that couldn't be resolved. We surface that as an error toast so the
 * user knows something was skipped; otherwise we report the queued
 * count.
 */
const toOutcome = (response: RequestResponse<InvokeHookResult>): HookCallOutcome => {
	if (!response.ok || response.error) {
		return {
			status: 'error',
			message: response.error?.message ?? 'Failed to trigger hook'
		};
	}

	const body = response.data as InvokeHookResult | null;
	const queued = body?.queued ?? 0;
	const logs = body?.logs ?? [];

	if (logs.length > 0) {
		return {
			status: 'error',
			message: `Queued task with ${queued} object(s). ${logs.join('; ')}`
		};
	}

	return {
		status: 'success',
		message: `Queued task with ${queued} object(s)`
	};
};

/** Fire a manual module hook against `targets` in `case_id`. */
export const callHook = async (
	case_id: number,
	hookType: HookObjectType,
	targets: Array<number>,
	hookOption: HookOption
): Promise<HookCallOutcome> =>
	toOutcome(
		await HooksService.invoke(case_id, {
			type: hookType,
			hook_name: hookOption.hook_name,
			module_name: hookOption.module_name,
			hook_ui_name: hookOption.manual_hook_ui_name,
			targets
		})
	);

/**
 * Fire a manual module hook against alerts. Alerts live outside any
 * case, so this goes to the alert-scoped invoker rather than
 * `callHook`'s case one.
 */
export const callAlertHook = async (
	targets: Array<number>,
	hookOption: HookOption
): Promise<HookCallOutcome> =>
	toOutcome(
		await HooksService.invokeForAlerts({
			hook_name: hookOption.hook_name,
			module_name: hookOption.module_name,
			hook_ui_name: hookOption.manual_hook_ui_name,
			targets
		})
	);
