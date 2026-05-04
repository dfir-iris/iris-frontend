import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { goto } from '$app/navigation';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_EXTERNAL_API_URL: 'http://localhost:8080',
		PUBLIC_INTERNAL_API_URL: 'http://localhost:8080'
	}
}));

vi.mock('$app/environment', () => ({ browser: false }));

vi.mock('$lib/stores/auth.store', () => ({
	auth: {
		isTokenExpired: () => false,
		isRefreshTokenExpired: () => false,
		getAccessToken: () => null
	}
}));

vi.mock('../auth.service', () => ({
	AuthService: {
		refreshToken: vi.fn(async () => {
			throw new Error('Failed to refresh token');
		})
	}
}));

import { ApiService } from '../api.service';

describe('ApiService', () => {
	const mockFetch = vi.fn();
	const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

	beforeAll(() => {
		global.fetch = mockFetch;
	});

	afterEach(() => {
		mockFetch.mockClear();
		vi.clearAllMocks();
	});

	const makeJsonResponse = (status: number, body: unknown) => {
		const headers = new Headers({ 'content-type': 'application/json' });

		const cloned = {
			headers,
			json: async () => body
		};

		return {
			status,
			ok: status >= 200 && status < 300,
			headers,
			clone: () => cloned,
			json: async () => body,
			text: async () => JSON.stringify(body)
		};
	};

	it('should make a GET request', async () => {
		const mockResponse = { data: 'test' };

		mockFetch.mockResolvedValueOnce(makeJsonResponse(200, mockResponse));

		const result = await ApiService.get('/test-endpoint');

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				status: 200,
				data: mockResponse
			})
		);

		expect(mockFetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v2/test-endpoint`,
			expect.objectContaining({
				method: 'GET'
			})
		);
	});

	it('should handle 401 Unauthorized response', async () => {
		mockFetch.mockResolvedValueOnce(makeJsonResponse(401, { message: 'Unauthorized' }));

		const result = await ApiService.get('/test-endpoint');

		expect(result.ok).toBe(false);
		expect(result.status).toBe(0);
		expect(result.error?.type).toBe('network_error');
		expect(result.error?.message).toContain('Failed to refresh token');
		expect(goto).not.toHaveBeenCalled();
	});

	it('should make a POST request', async () => {
		const mockResponse = { data: 'test' };
		const postData = { key: 'value' };

		mockFetch.mockResolvedValueOnce(makeJsonResponse(200, mockResponse));

		const result = await ApiService.post('/test-endpoint', postData);

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				status: 200,
				data: mockResponse
			})
		);

		expect(mockFetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v2/test-endpoint`,
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(postData),
				duplex: 'half',
				headers: expect.any(Headers)
			})
		);

		const headers = mockFetch.mock.calls[0][1].headers as Headers;
		expect(headers.get('Content-Type')).toBe('application/json');
		expect(headers.get('Accept')).toBe('application/json');
	});

	it('should make a PUT request', async () => {
		const mockResponse = { data: 'test' };
		const putData = { key: 'value' };

		mockFetch.mockResolvedValueOnce(makeJsonResponse(200, mockResponse));

		const result = await ApiService.put('/test-endpoint', putData);

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				status: 200,
				data: mockResponse
			})
		);

		expect(mockFetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v2/test-endpoint`,
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify(putData),
				duplex: 'half'
			})
		);
	});

	it('should make a DELETE request', async () => {
		mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { data: 'test' }));

		const result = await ApiService.delete('/test-endpoint');

		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				status: 200,
				data: ''
			})
		);

		expect(mockFetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v2/test-endpoint`,
			expect.objectContaining({
				method: 'DELETE'
			})
		);
	});

	it('should not throw on non-200 response (returns ok=false)', async () => {
		mockFetch.mockResolvedValueOnce(makeJsonResponse(500, { error: 'boom' }));

		const result = await ApiService.get('/test-endpoint');

		expect(result.ok).toBe(false);
		expect(result.status).toBe(500);
		expect(result.data).toEqual({ error: 'boom' });
	});
});
