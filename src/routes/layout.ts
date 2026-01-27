import type { LayoutLoad } from './$types';
import { auth } from '$lib/stores/auth.store';

export const load = (async ({ fetch, depends }) => {
	console.log('wtf');
	depends('auth:session');

	const user = await auth.loadAuth(fetch, true);

	return { user };
}) satisfies LayoutLoad;
