import { writable, derived, get, type Writable } from 'svelte/store';
import type { LoginResponse } from '$lib/services/auth.service';
import { ApiService } from '$lib/services/api.service';
import { redirect } from '@sveltejs/kit';


export interface UserInfo {
	id: string;
	name: string;
	email: string;
}

export const authUserStore: Writable<UserInfo | null> = writable(null)

interface AuthState {
	user: LoginResponse | null;
	isAuthenticated: boolean;
}

function loadInitialState(): AuthState {
	// Always start with no authenticated user
	return { user: null, isAuthenticated: false };
}

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(loadInitialState());

	const store = {
		subscribe,
		setAuth: (response: LoginResponse) => {
			const newState: AuthState = {
				user: response,
				isAuthenticated: true
			};
			set(newState);
		},
		clearAuth: () => {
			const newState: AuthState = {
				user: null,
				isAuthenticated: false
			};
			set(newState);
		},

		loadAuth: async (
            fetchFn: typeof fetch, 
            redirectOnFailure = false
        ): Promise<LoginResponse | null> => {
			const current = get(store);
			if (current.user) return current.user;

			try {
				const response = await ApiService.get('/auth/whoami', { fetch: fetchFn });
				store.setAuth(response.data);
				return response.data;
			} catch (error) {
				console.error('loadAuth failed:', error);
				store.clearAuth();
                if (redirectOnFailure) {
					throw redirect(302, '/login');
				}
				return null;
			}
		}
	};

	return store;
};

export const auth = createAuthStore();

// Derived stores for user name and full user info
export const username = derived(auth, $auth => $auth.user?.user_name ?? 'Loading...');
export const current_user = derived(auth, $auth => $auth.user ?? null);
