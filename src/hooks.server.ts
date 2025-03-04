// src/hooks.server.ts
import { PUBLIC_USE_MOCK_API_DATA } from '$env/static/public';
import { ApiService } from '$lib/services/api.service';
import type { UserInfo } from '$lib/stores/auth.store';
import { redirect } from '@sveltejs/kit';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { browser } from "$app/environment";
import { env } from '$env/dynamic/public'


const AUTH_EXCLUDED_URLS = [
	'/[fallback]',
	'/login'
]

/**
 * Fetches current auth state, returning it as a events.local
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname !== '/') {
		console.debug(`Hook handling "${event.url.pathname}"`)
	}

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
	if (!sessionCookie && browser) {
		console.error('No session cookie found, redirecting to login')
		return redirect(301, `/login?redirect=${event.url.pathname}`)
	}

	if (!sessionCookie && event.url.pathname == '/' && event.request.headers.get('user-agent')?.includes('curl')) {
		return new Response('healthcheck ok', { status: 200 });
	}

	//
	// We hand up in a loop if we do this here - also this is done too many times
	//
	// if (!event.locals.user) {
	// 	// Attempt to get session
	// 	try {
	// 		const response = await ApiService.get<UserInfo>('/auth/whoami', { fetch: event.fetch });

	// 		const whoami: UserInfo = response.data;
	// 		console.log('Whoami', whoami)
	// 		event.locals.user = whoami
	// 	} catch (err) {
	// 		console.error(`Fetching session failed: ${err}`)
	// 		return redirect(301, `/login?redirect=${event.url.pathname}`)
	// 	}
	// }

	try {
		return resolve(event);
	} catch (error) {
    console.error('Caught error in handle:', error);

  	return new Response('Something went wrong', { status: 500 });
	}
};


export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (!browser) {
		console.log('Handling fetch from SSR:', request.url)
    // Forward the cookie header from the incoming request
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }
    // Also forward the Origin header from the incoming request
    const origin = event.request.headers.get('origin');
    if (origin) {
      request.headers.set('origin', origin);
    }
		const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade'
    ];
    hopByHopHeaders.forEach(header => {
      request.headers.delete(header);
    });
  }
  try {
    return await fetch(request);
  } catch (err) {
    console.error(`Fetch request failed: ${err}`);
    throw err;
  }
};
// src/hooks.server.ts