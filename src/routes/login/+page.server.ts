// src/routes/login/+page.server.ts
import { ApiService } from '$lib/services/api.service';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { auth } from '$lib/stores/auth.store';

export const actions = {
    default: async ({ request, url, fetch }) => {
        const data = await request.formData();
        const redirectTo = url.searchParams.get('redirect')
        const username = data.get('username')

        try {
            console.log('User', username, 'signing in...')
            
            // Try different endpoint paths that might work
            const loginEndpoints = [
                '/api/v2/auth/login',    // Versioned API path (try this first)
            ];
            
            let response;
            let error;
            
            // Try each endpoint until one works
            for (const endpoint of loginEndpoints) {
                try {
                    console.log(`Attempting login with endpoint: ${endpoint}`);
                    response = await ApiService.post(endpoint, {
                        username: username,
                        password: data.get('password')
                    }, { 
                        fetch,
                        skipAuthRedirect: true,
                        useApiPrefix: false // Don't add API prefix since we're trying different variations
                    });
                    
                    // If we got here, the request succeeded
                    console.log(`Login successful with endpoint: ${endpoint}`);
                    break;
                } catch (e) {
                    error = e;
                    console.warn(`Login attempt failed with endpoint ${endpoint}:`, e);
                    // Continue to the next endpoint
                }
            }
            
            // If all attempts failed, throw the last error
            if (!response) {
                throw error || new Error('All login attempts failed');
            }

            // Check if the login was successful
            if (response.status !== 200 || !response.data?.tokens?.access_token) {
                return fail(response.status, { 
                    error: 'Authentication failed. Please check your username and password.',
                    username 
                });
            }

            // Convert token format for the auth store
            const tokenInfo = {
                accessToken: response.data.tokens.access_token,
                refreshToken: response.data.tokens.refresh_token,
                accessTokenExpiresAt: response.data.tokens.access_token_expires_at,
                refreshTokenExpiresAt: response.data.tokens.refresh_token_expires_at
            };

            // Set the user and tokens in the auth store
            auth.setAuth(response.data, tokenInfo);

        } catch (error) {
            console.error('User', username, 'sign in error: ', error);
            return fail(400, { 
                error: 'Could not connect to the authentication server. Please try again later.',
                username,
                connectionError: true
            });
        }

        throw redirect(301, redirectTo || '/');
    }
} satisfies Actions;