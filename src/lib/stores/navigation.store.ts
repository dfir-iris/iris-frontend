import { auth } from './auth.store';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { derived } from 'svelte/store';

const protectedPaths = ['/dashboard', '/cases', '/analysis'];
const publicPaths = ['/login', '/register', '/forgot-password'];

export const navigation = derived([auth, page], ([$auth, $page]) => {
    const path = $page.url.pathname;
    console.log('Navigation guard:', path, $auth.isAuthenticated);

    if (protectedPaths.some(p => path.startsWith(p)) && !$auth.isAuthenticated) {
        goto(`/login?redirect=${encodeURIComponent(path)}`);
    }

    if (publicPaths.includes(path) && $auth.isAuthenticated) {
        goto('/dashboard');
    }
});