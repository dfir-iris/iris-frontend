import { ApiService } from '$lib/services/api.service';
import { authTokenStore, type UserInfo } from '$lib/stores/auth.store';
import { redirect, type Handle } from '@sveltejs/kit';

const AUTH_EXCLUDED_URLS = [
	'/[fallback]',
	'/login'
]

/**
 * Fetches current auth state, returning it as a events.local
 */
export const handle: Handle = async ({ event, resolve }) => {
	console.debug(`Hook handling "${event.url.pathname}"`)

	// Exclude certain URLs from auth check
	if (AUTH_EXCLUDED_URLS.includes(event.url.pathname)) {
		return resolve(event)
	}

	// Get token
	const token = event.cookies.get('token')
	if (!token) {
		console.error('No token found, redirecting to login')
		throw redirect(301, `/login?redirect=${event.url.pathname}`)
	}
	authTokenStore.set(token)

	// Attempt to get session
	try {
		const whoami: UserInfo = await ApiService.get('/auth/whoami')
		console.log('Whoami', whoami)
		event.locals.user = whoami
	} catch (err) {
		console.error(`Fetching session failed: ${err}`)
		throw redirect(301, `/login?redirect=${event.url.pathname}`)
	}

	return resolve(event);
};