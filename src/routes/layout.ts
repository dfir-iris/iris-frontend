import { auth } from '$lib/stores/auth.store';

export const load = async ({ fetch, depends }) => {
	depends('auth:session');

	const user = await auth.loadAuth(fetch, true);

	return { user };
};
