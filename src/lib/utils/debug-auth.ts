/**
 * Utility functions to debug authentication issues
 */
export function debugAuthRequest() {
	try {
		console.group('Authentication Debug Information');

		// Log cookies
		console.log('Cookies:', document.cookie);

		// Log origin and CORS info
		console.log('Page Origin:', window.location.origin);
		console.log('API URL:', new URL('/login', window.location.origin).toString());

		// Check for security headers
		fetch('/login', {
			method: 'OPTIONS',
			credentials: 'include'
		})
			.then((response) => {
				console.log('OPTIONS response status:', response.status);
				console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
			})
			.catch((error) => {
				console.error('OPTIONS request failed:', error);
			});

		console.groupEnd();
	} catch (error) {
		console.error('Error in auth debugging:', error);
	}
}
