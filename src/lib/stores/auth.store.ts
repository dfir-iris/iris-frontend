import { writable, derived, get, type Writable } from 'svelte/store';
import type { LoginResponse } from '$lib/services/auth.service';
import { ApiService } from '$lib/services/api.service';
import { redirect } from '@sveltejs/kit';
import { browser } from "$app/environment";

// Token storage keys
const ACCESS_TOKEN_KEY = 'iris_access_token';
const REFRESH_TOKEN_KEY = 'iris_refresh_token';
const TOKEN_EXPIRY_KEY = 'iris_token_expiry';
const REFRESH_EXPIRY_KEY = 'iris_refresh_expiry';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

export const authUserStore: Writable<UserInfo | null> = writable(null);

interface AuthState {
  user: LoginResponse | null;
  isAuthenticated: boolean;
  tokens: TokenInfo | null;
}

function loadInitialState(): AuthState {
  if (!browser) {
    return { user: null, isAuthenticated: false, tokens: null };
  }

  // Try to load tokens from localStorage
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const accessTokenExpiresAt = localStorage.getItem(TOKEN_EXPIRY_KEY);
  const refreshTokenExpiresAt = localStorage.getItem(REFRESH_EXPIRY_KEY);

  if (accessToken && refreshToken && accessTokenExpiresAt && refreshTokenExpiresAt) {
    return {
      user: null, // We don't have user data yet, will be loaded later
      isAuthenticated: true, // We have tokens, so we're authenticated
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: Number(accessTokenExpiresAt),
        refreshTokenExpiresAt: Number(refreshTokenExpiresAt)
      }
    };
  }

  return { user: null, isAuthenticated: false, tokens: null };
}

function saveTokensToStorage(tokens: TokenInfo) {
  if (!browser) return;

  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, tokens.accessTokenExpiresAt.toString());
  localStorage.setItem(REFRESH_EXPIRY_KEY, tokens.refreshTokenExpiresAt.toString());
}

function clearTokensFromStorage() {
  if (!browser) return;

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(REFRESH_EXPIRY_KEY);
}

const createAuthStore = () => {
  const { subscribe, set, update } = writable<AuthState>(loadInitialState());

  const store = {
    subscribe,
    setAuth: (response: LoginResponse, tokens: TokenInfo) => {
      // Save tokens to storage
      saveTokensToStorage(tokens);

      const newState: AuthState = {
        user: response,
        isAuthenticated: true,
        tokens
      };
      set(newState);
    },
    clearAuth: () => {
      // Clear tokens from storage
      clearTokensFromStorage();

      const newState: AuthState = {
        user: null,
        isAuthenticated: false,
        tokens: null
      };
      set(newState);
    },
    updateTokens: (tokens: TokenInfo) => {
      saveTokensToStorage(tokens);
      
      update(state => ({
        ...state,
        tokens,
        isAuthenticated: true
      }));
    },
    loadAuth: async (
      fetchFn: typeof fetch, 
      redirectOnFailure = false
    ): Promise<LoginResponse | null> => {
      const current = get(store);

      // Already have user data
      if (current.user) return current.user;

      // Check if we have valid tokens
      if (current.tokens) {
        try {
          const response = await ApiService.get('/auth/whoami', { 
            fetch: fetchFn,
            headers: {
              'Authorization': `Bearer ${current.tokens.accessToken}`
            }
          });
          
          // If successful, update user info
          update(state => ({
            ...state,
            user: response.data,
            isAuthenticated: true
          }));
          
          return response.data;
        } catch (error) {
          console.error('loadAuth failed:', error);
          store.clearAuth();
          
          if (redirectOnFailure) {
            throw redirect(302, '/login');
          }
          return null;
        }
      } else {
        if (redirectOnFailure) {
          throw redirect(302, '/login');
        }
        return null;
      }
    },
    getAccessToken: (): string | null => {
      const current = get(store);
      return current.tokens?.accessToken || null;
    },
    getRefreshToken: (): string | null => {
      const current = get(store);
      return current.tokens?.refreshToken || null;
    },
    isTokenExpired: (): boolean => {
      const current = get(store);
      if (!current.tokens) return true;
      
      // Add a 30-second buffer to handle timing issues
      const now = Date.now() / 1000 + 30;
      return current.tokens.accessTokenExpiresAt < now;
    },
    isRefreshTokenExpired: (): boolean => {
      const current = get(store);
      if (!current.tokens) return true;
      
      const now = Date.now() / 1000;
      return current.tokens.refreshTokenExpiresAt < now;
    }
  };

  return store;
};

export const auth = createAuthStore();

// Derived stores for user name and full user info
export const username = derived(auth, $auth => $auth.user?.user_name ?? 'Loading...');
export const current_user = derived(auth, $auth => $auth.user ?? null);
