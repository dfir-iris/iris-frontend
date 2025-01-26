// src/routes/login/+page.server.ts
import { ApiService } from '$lib/services/api.service';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
    // Handle authenticating the user with the backend
    default: async ({ request, cookies, url, fetch }) => {
        const data = await request.formData();
        const redirectTo = url.searchParams.get('redirect')
        const username = data.get('username')

        try {
            // Send login request to the backend
            const response = await ApiService.post('/auth/login', {
                username: username,
                password: data.get('password')
            }, { fetch });

            // Assuming the response contains a `Set-Cookie` header for the session
            const sessionCookie = response.headers.get('set-cookie');
            if (sessionCookie) {
                const [cookiePart] = sessionCookie.split(';'); // Typically session cookie may have attributes
                const [cookieName, cookieValue] = cookiePart.split('=');
                cookies.set(cookieName, cookieValue, {
                    path: '/',
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: true
                });
            }
        } catch (error) {
            console.error('User', username, 'sign in error: ', error)
            return fail(400, { error: 'Username or password is incorrect.', username })
        }

        throw redirect(301, redirectTo || '/')
    }
} satisfies Actions;