import { ApiService } from '$lib/services/api.service';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { parse } from 'cookie';


export const actions = {
    // Handle authenticating the user with the backend
    default: async ({ request, url, cookies }) => {
        const data = await request.formData();
        const redirectTo = url.searchParams.get('redirect')
        const username = data.get('username')

        try {
            const resp = await ApiService.post('/auth/login', {
                username: username,
                password: data.get('password')
            })
            console.info(`User "${username}" logged in successfully.`)
            const cookieHeader = resp.headers.get('set-cookie');
            
            // Get the session cookie and set it in the browser
            if (cookieHeader) {
                const parsedCookies = parse(cookieHeader);
                const sessionCookie = parsedCookies['session'];
                console.log('Session cookie:', sessionCookie)
                if (sessionCookie) {
                    cookies.set('session', sessionCookie, {
                        path: '/',
                        httpOnly: true,
                        secure: true,
                        sameSite: 'strict'
                    });
                }
            }
        } catch (error) {
            console.error('User', username, 'sign in error: ', error.message)
            return fail(400, { error: 'Username or password is incorrect.', username })
        }

        throw redirect(301, redirectTo || '/')
    }
} satisfies Actions;