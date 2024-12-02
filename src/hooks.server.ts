import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const userInfo = null // TODO: call `/auth/whoami` endpoint and send the info to the user local var
	
	event.locals.user = userInfo

	const response = await resolve(event);
	return response;
};