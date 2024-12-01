// src/lib/stores/auth.store.ts
import { writable, derived } from 'svelte/store';
import type { LoginResponse } from '$lib/services/auth.service';

interface AuthState {
    user: LoginResponse | null;
    isAuthenticated: boolean;
}

function loadInitialState(): AuthState {
    if (typeof window === 'undefined') return { user: null,  isAuthenticated: false };
    
    const saved = localStorage.getItem('auth');
    if (!saved) return { user: null, isAuthenticated: false };
    
    try {
        return JSON.parse(saved);
    } catch {
        return { user: null, isAuthenticated: false };
    }
}

const createAuthStore = () => {
    const { subscribe, set, update } = writable<AuthState>(loadInitialState());
    
    const store = {
        subscribe,
        setAuth: (response: LoginResponse) => {

            const newState = {
                user: response,
                isAuthenticated: true
            };
            set(newState);
            if (typeof window !== 'undefined') {
                localStorage.setItem('auth', JSON.stringify(newState));
            }
        },
        clearAuth: () => {
            const newState = {
                user: null,
                isAuthenticated: false
            };
            set(newState);
            if (typeof window !== 'undefined') {
                localStorage.removeItem('auth');
            }
        }
    };

    return store;
};

export const auth = createAuthStore();

// Create derived store for userName
export const username = derived(auth, $auth => $auth?.user?.user_name ?? 'Loading...');
export const current_user = derived(auth, $auth => $auth?.user ?? null);