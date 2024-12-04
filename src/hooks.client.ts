import { ApiService } from '$lib/services/api.service';
import { redirect, type Handle } from '@sveltejs/kit';

export interface UserInfo {
	id: string
	name: string
	email: string
}

const AUTH_EXCLUDED_URLS = [
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

	// Attempt to get session
	try {
		const whoami: UserInfo = await ApiService.get('/auth/whoami')
		event.locals.user = whoami
	} catch (err) {
		console.error(`Fetching session failed: ${err}`)
		throw redirect(301, `/login?redirect=${event.url.pathname}`)
	}

	return resolve(event);
};