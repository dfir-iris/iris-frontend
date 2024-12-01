import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { ApiService } from '../api.service';
import { goto } from '$app/navigation';

vi.mock('$app/navigation', () => ({
    goto: vi.fn(),
}));

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

    it('should make a GET request', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.get('/test-endpoint');
        expect(result).toEqual(mockResponse);
        expect(mockFetch).toHaveBeenCalledWith(
            `${baseUrl}/api/v2/test-endpoint`,
            expect.objectContaining({
                method: 'GET',
            })
        );
    });

    it('should handle 401 Unauthorized response', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 401,
            ok: false,
        });

        await expect(ApiService.get('/test-endpoint')).rejects.toThrow('Unauthorized');
        expect(goto).toHaveBeenCalledWith('/login?redirect=%2Fdashboard');
    });

    it('should make a POST request', async () => {
        const mockResponse = { data: 'test' };
        const postData = { key: 'value' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.post('/test-endpoint', postData);
        expect(result).toEqual(mockResponse);
        expect(mockFetch).toHaveBeenCalledWith(
            `${baseUrl}/api/v2/test-endpoint`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(postData),
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Include-Credentials': 'true',
                }),
                credentials: 'include',
                mode: 'cors',
            })
        );
    });

    it('should make a PUT request', async () => {
        const mockResponse = { data: 'test' };
        const putData = { key: 'value' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.put('/test-endpoint', putData);
        expect(result).toEqual(mockResponse);
        expect(mockFetch).toHaveBeenCalledWith(
            `${baseUrl}/api/v2/test-endpoint`,
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify(putData),
            })
        );
    });

    it('should make a DELETE request', async () => {
        const mockResponse = { data: 'test' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await ApiService.delete('/test-endpoint');
        expect(result).toEqual(mockResponse);
        expect(mockFetch).toHaveBeenCalledWith(
            `${baseUrl}/api/v2/test-endpoint`,
            expect.objectContaining({
                method: 'DELETE',
            })
        );
    });

    it('should throw an error on non-200 response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        await expect(ApiService.get('/test-endpoint')).rejects.toThrow('HTTP error! status: 500');
    });
});