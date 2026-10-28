import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';
import { isLoginPath, loginUrlForDeepLink } from './redirect';

// Global flag to prevent multiple redirects
let redirectInProgress = false;

export function handleSessionExpiration() {
	if (!browser || redirectInProgress) return;

	console.log('Session expired, handling redirection');
	redirectInProgress = true;

	// Clear auth state using the available clearAuth method
	auth.clearAuth();

	const { pathname, search } = window.location;

	// Already on the login page: just clear state and stop. The root layout
	// keeps the `session-expired` listener mounted here too, and the login
	// page itself calls `loadAuth()` on mount, so 401s legitimately fire
	// while sitting on /login. Redirecting in response to those is what
	// built the nested URL in the first place: each 401 used to wrap the
	// current `/login?redirect=…` in yet another `?redirect=`, until the URL
	// outgrew the proxy's limit and sign-in broke outright.
	if (isLoginPath(pathname)) {
		redirectInProgress = false;
		return;
	}

	// Sanitized `/login?redirect=<current page>`; the login page and both
	// auth flows consume the same `redirect` parameter.
	const loginUrl = loginUrlForDeepLink(pathname, search);

	// Force the redirect to happen in the next tick
	setTimeout(() => {
		console.log('Redirecting to login page now...');
		goto(loginUrl, { replaceState: true })
			.then(() => {
				console.log('Redirect to login page complete');
				// Reset the flag after a delay
				setTimeout(() => {
					redirectInProgress = false;
				}, 1000);
			})
			.catch((err) => {
				console.error('Failed to redirect to login page:', err);
				redirectInProgress = false;
			});
	}, 0);
}
