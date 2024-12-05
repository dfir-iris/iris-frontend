import { ApiService } from '$lib/services/api.service';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { parse } from 'cookie';


export const actions = {
    // Handle authenticating the user with the backend
    default: async ({ request, url }) => {
        const data = await request.formData();
        const redirectTo = url.searchParams.get('redirect')
        const username = data.get('username')

        try {
            await ApiService.post('/auth/login', {
                username: username,
                password: data.get('password')
            })
            console.info(`User "${username}" logged in successfully.`)
        } catch (error) {
            console.error('User', username, 'sign in error: ', error.message)
            return fail(400, { error: 'Username or password is incorrect.', username })
        }

        throw redirect(301, redirectTo || '/')
    }
} satisfies Actions;