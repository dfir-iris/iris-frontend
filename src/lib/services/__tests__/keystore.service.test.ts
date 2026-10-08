import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { KEYSTORE_NAME_RE, KeystoreService } from '../keystore.service';
import { ApiService } from '../api.service';

const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = ApiService.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = ApiService.delete as unknown as ReturnType<typeof vi.fn>;

describe('KeystoreService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({ ok: true, data: [] });
		mockPost.mockResolvedValue({ ok: true, data: null });
		mockPut.mockResolvedValue({ ok: true, data: null });
		mockDelete.mockResolvedValue({ ok: true, data: null });
	});

	it('lists entries', async () => {
		await KeystoreService.list();
		expect(mockGet).toHaveBeenCalledWith('/keystore', {});
	});

	it('creates an entry', async () => {
		const body = {
			name: 'VT_KEY',
			value: 's3cr3t',
			is_secret: true,
			description: null,
			scope: 'personal' as const,
			allowed_group_ids: [],
			allowed_hosts: ['www.virustotal.com']
		};
		await KeystoreService.create(body);
		expect(mockPost).toHaveBeenCalledWith('/keystore', body, {});
	});

	it('updates without a value to keep a secret', async () => {
		await KeystoreService.update(5, { description: 'x', value: null });
		expect(mockPut).toHaveBeenCalledWith('/keystore/5', { description: 'x', value: null }, {});
	});

	it('deletes an entry', async () => {
		await KeystoreService.remove(5);
		expect(mockDelete).toHaveBeenCalledWith('/keystore/5', {});
	});
});

describe('KEYSTORE_NAME_RE', () => {
	it('matches the backend rule', () => {
		expect(KEYSTORE_NAME_RE.test('VT_KEY_2')).toBe(true);
		expect(KEYSTORE_NAME_RE.test('vt_key')).toBe(false);
		expect(KEYSTORE_NAME_RE.test('')).toBe(false);
		expect(KEYSTORE_NAME_RE.test('A'.repeat(65))).toBe(false);
	});
});
