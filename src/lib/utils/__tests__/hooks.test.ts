import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/hooks.service', () => ({
	HooksService: {
		invoke: vi.fn(),
		invokeForAlerts: vi.fn()
	}
}));

import { HooksService } from '$lib/services/hooks.service';
import type { HookOption } from '$lib/services/hooks.service';
import { callAlertHook, callHook, hookOptionKey } from '../hooks';

const mockInvoke = HooksService.invoke as unknown as ReturnType<typeof vi.fn>;
const mockInvokeForAlerts = HooksService.invokeForAlerts as unknown as ReturnType<typeof vi.fn>;

const moduleOption: HookOption = {
	hook_name: 'on_manual_trigger_ioc',
	manual_hook_ui_name: 'Enrich',
	module_name: 'iris_misp_module'
};

const webhookOption: HookOption = {
	hook_name: 'on_manual_trigger_ioc',
	manual_hook_ui_name: 'Send to SOAR',
	module_name: 'IRIS webhooks',
	webhook_id: 4
};

describe('hooks utils', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockInvoke.mockResolvedValue({ ok: true, data: { queued: 1 } });
		mockInvokeForAlerts.mockResolvedValue({ ok: true, data: { queued: 2 } });
	});

	it('leaves webhook_id out for module hooks', async () => {
		const outcome = await callHook(3, 'ioc', [9], moduleOption);
		expect(mockInvoke).toHaveBeenCalledWith(3, {
			type: 'ioc',
			hook_name: 'on_manual_trigger_ioc',
			module_name: 'iris_misp_module',
			hook_ui_name: 'Enrich',
			targets: [9]
		});
		expect(outcome).toEqual({ status: 'success', message: 'Queued task with 1 object(s)' });
	});

	it('passes webhook_id through for webhook entries', async () => {
		await callHook(3, 'ioc', [9], webhookOption);
		expect(mockInvoke.mock.calls[0][1]).toMatchObject({ webhook_id: 4, targets: [9] });
		await callAlertHook([5, 6], { ...webhookOption, hook_name: 'on_manual_trigger_alert' });
		expect(mockInvokeForAlerts).toHaveBeenCalledWith({
			hook_name: 'on_manual_trigger_alert',
			module_name: 'IRIS webhooks',
			hook_ui_name: 'Send to SOAR',
			targets: [5, 6],
			webhook_id: 4
		});
	});

	it('keys entries apart even when labels collide', () => {
		const other = { ...webhookOption, webhook_id: 5 };
		expect(hookOptionKey(webhookOption)).not.toBe(hookOptionKey(other));
		expect(hookOptionKey({ ...moduleOption, manual_hook_ui_name: 'Send to SOAR' })).not.toBe(
			hookOptionKey(webhookOption)
		);
	});
});
