import { describe, it, expect, vi } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: { get: vi.fn(), put: vi.fn() }
}));

import {
	Permission,
	hasAnyPermission,
	hasPermission,
	type UserContext
} from '../user-context.service';

const ctxWith = (mask: number): UserContext => ({
	iris_version: 'test',
	demo_mode: false,
	user_id: 1,
	permissions: { mask, names: [] },
	preferences: { has_mini_sidebar: false }
});

describe('hasPermission', () => {
	it('declares the AI workflow bits', () => {
		expect(Permission.ai_workflows_read).toBe(0x80000000);
		expect(Permission.ai_workflows_write).toBe(0x100000000);
	});

	it('is false without a context', () => {
		expect(hasPermission(null, 'standard_user')).toBe(false);
	});

	it('reads the 0x80000000 bit', () => {
		const ctx = ctxWith(0x1 + 0x80000000);
		expect(hasPermission(ctx, 'ai_workflows_read')).toBe(true);
		expect(hasPermission(ctx, 'ai_workflows_write')).toBe(false);
		expect(hasPermission(ctx, 'standard_user')).toBe(true);
	});

	it('reads the 0x100000000 bit', () => {
		const ctx = ctxWith(0x1 + 0x100000000);
		expect(hasPermission(ctx, 'ai_workflows_write')).toBe(true);
		expect(hasPermission(ctx, 'ai_workflows_read')).toBe(false);
		expect(hasPermission(ctx, 'server_administrator')).toBe(false);
	});

	it('keeps low bits working next to the high ones', () => {
		const ctx = ctxWith(0x180000000 + 0x40000000 + 0x4);
		expect(hasPermission(ctx, 'vulnerabilities_create')).toBe(true);
		expect(hasPermission(ctx, 'alerts_read')).toBe(true);
		expect(hasPermission(ctx, 'alerts_write')).toBe(false);
		expect(hasAnyPermission(ctx, ['alerts_write', 'ai_workflows_write'])).toBe(true);
	});

	it('is false for a full 32-bit mask missing the bit 32', () => {
		expect(hasPermission(ctxWith(0xffffffff), 'ai_workflows_write')).toBe(false);
		expect(hasPermission(ctxWith(0xffffffff), 'ai_workflows_read')).toBe(true);
	});
});
