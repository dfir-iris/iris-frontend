import { auth } from './auth.store';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { derived } from 'svelte/store';

const protectedPaths = ['/cases', '/analysis', '/dashboards'];
const publicPaths = ['/login', '/register', '/forgot-password'];

export const navigation = derived([page], ([$page]) => {
	const path = $page.url.pathname;
	console.log('Navigation guard:', path, auth.isAuthenticated());

	if (protectedPaths.some((p) => path.startsWith(p)) && !auth.isAuthenticated()) {
		goto(`/login?redirect=${encodeURIComponent(path)}`);
	}

	if (publicPaths.includes(path) && auth.isAuthenticated()) {
		// App root is the SvelteKit index page ((app)/+page.svelte).
		// There is no top-level /dashboard route.
		goto('/');
	}
});
