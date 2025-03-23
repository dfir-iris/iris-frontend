import { ApiService } from "./api.service"
import { goto } from "$app/navigation"
import { auth } from "$lib/stores/auth.store"
import { ENDPOINTS } from "$lib/constants/endpoints"
import { get } from "svelte/store"

export interface LoginCredentials {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    uuid: string
    user_name: string
    user_login: string
    user_email: string
    in_dark_mode: boolean
    has_mini_sidebar: boolean
    has_deletion_confirmation: boolean
  }
}

export class AuthService {
  static async login(credentials: LoginCredentials): Promise<LoginResponse | null> {
    const response = await ApiService.post<LoginResponse>(
      ENDPOINTS.auth.login,
      credentials,
      { skipAuthRedirect: true }, // Skip redirect on this specific call
    )

    if (response.status === 200 && response.data?.token) {
      auth.setAuth(response.data)

      // Handle redirect after login
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get("redirect") || "/dashboard"
      goto(redirect)

      return response.data
    }

    return null
  }

  static async logout(): Promise<void> {
    try {
      // Skip auth redirect to prevent infinite loop
      await ApiService.post("/auth/logout", {}, { skipAuthRedirect: true })
    } catch (err) {
      console.warn("Error during logout API call:", err)
    } finally {
      auth.clearAuth()
      goto("/login")
    }
  }

  static checkAuth(): boolean {
    return get(auth).isAuthenticated
  }
}

