// src/hooks.server.ts
import { PUBLIC_USE_MOCK_API_DATA } from '$env/static/public';
import { ApiService } from '$lib/services/api.service';
import type { UserInfo } from '$lib/stores/auth.store';
import { redirect } from '@sveltejs/kit';
import type { HandleFetch, Handle } from '@sveltejs/kit';


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

	// Disable auth check when mocking
	if (PUBLIC_USE_MOCK_API_DATA == "true") {
		console.warn("Ignoring auth check due to mock data enabled")
		return resolve(event)
	}

	// Get session cookie
	const sessionCookie = event.cookies.get('session')
	if (!sessionCookie) {
		console.error('No session cookie found, redirecting to login')
		throw redirect(301, `/login?redirect=${event.url.pathname}`)
	}

	// Attempt to get session
	try {
		const response = await ApiService.get<UserInfo>('/auth/whoami', { sessionCookie }, event.fetch);

		const whoami: UserInfo = response.data;
		console.log('Whoami', whoami)
		event.locals.user = whoami
	} catch (err) {
		console.error(`Fetching session failed: ${err}`)
		throw redirect(301, `/login?redirect=${event.url.pathname}`)
	}

	return resolve(event);
};


export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	if (request.url.startsWith('http://127.0.0.1')) {
		console.log(event);
		console.debug('Adding session cookie to request for server')
		request.headers.set('cookie', event.request.headers.get('cookie'));
	}

	return fetch(request);
};