import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

// Get API base URL from environment or use default
export const API_BASE_URL = env.PUBLIC_INTERNAL_API_URL || '/api/v2';

// Other API related configurations
export const API_TIMEOUT = 30000; // 30 seconds
export const API_RETRY_COUNT = 3;

// Determine if we're in a browser or server environment
export const IS_BROWSER = browser;

// Export other needed config
export const API_CONFIG = {
	baseUrl: API_BASE_URL,
	timeout: API_TIMEOUT,
	retryCount: API_RETRY_COUNT
};
