import { browser } from '$app/environment';
import { ApiService } from '$lib/services/api.service';

/**
 * Tests if the API server is reachable
 * @param timeout Timeout in milliseconds
 * @returns Promise resolving to true if server is reachable, false otherwise
 */
export async function isServerReachable(timeout = 3000): Promise<boolean> {
	try {
		if (!browser) {
			return true; // On server side, assume server is reachable
		}

		// Try different possible health check endpoints
		const possibleEndpoints = [`/api/v2/auth/whoami`];

		// Create an AbortController to handle timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		// Try endpoints in sequence
		for (const endpoint of possibleEndpoints) {
			try {
				const response = await ApiService.get(endpoint, {
					skipTokenRefresh: true,
					useApiPrefix: false
				});

				// If we get any response, consider the server reachable
				if (response.status == 200 || response.status === 401) {
					// 401 means server is up but requires auth
					console.log(`Server is reachable at ${endpoint}`);
					return true;
				}
			} catch (err: unknown) {
				// Continue to the next endpoint
				console.warn(`Endpoint ${endpoint} is not reachable:`, (err as Error).message);
			}
		}

		clearTimeout(timeoutId);
		return false;
	} catch (err: unknown) {
		console.error('Server health check failed:', err);
		return false;
	}
}
