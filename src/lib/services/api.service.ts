import { env } from "$env/dynamic/public"
import { PUBLIC_USE_MOCK_API_DATA } from "$env/static/public"
import { browser } from "$app/environment"
import { randomDelay } from "$lib/utils/mock"
import { goto } from "$app/navigation"
import { auth } from "$lib/stores/auth.store"

interface RequestOptions {
  method: string
  body?: string
  options: MethodOptions
}

interface MethodOptions {
  sessionCookie?: string
  fetch?: typeof fetch
  skipAuthRedirect?: boolean
}

export interface RequestResponse<T> {
  headers: Headers
  status: number
  data: T
  url: string
}

export interface Paginated<T> {
  total: number
  data: T[]
  last_page: number | null
  current_page: number
  next_page: number | null
}

// Static variable outside the class to ensure it's truly static across all instances
let redirectInProgress = false

export class ApiService {
  private static baseUrl = browser ? env.PUBLIC_EXTERNAL_API_URL : env.PUBLIC_INTERNAL_API_URL

  static async request<T>(
    endpoint: string,
    options: RequestOptions = { method: "GET", options: {} },
    fetch_fn: typeof fetch = fetch,
  ): Promise<RequestResponse<T>> {
    const url = `/api/v2${endpoint}`

    // Handle if mock data in use
    if (PUBLIC_USE_MOCK_API_DATA == "true") {
      try {
        const mockResponse = await this.mockRequest<T>(endpoint)
        if (mockResponse) return mockResponse
      } catch (e) {
        console.warn(`Mock data not found for endpoint: ${endpoint}`, e)
        // Continue with regular request if mock fails
      }
    }

    // Default headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    const fetch_call = fetch_fn || fetch
    let response: Response | null = null

    try {
      response = await fetch_call(url, {
        ...options,
        credentials: "include",
        headers,
        mode: "cors",
      })
    } catch (err) {
      console.error(`Fetching ${endpoint} failed:`, err)
      // Return a default response instead of throwing
      return {
        headers: new Headers(),
        data: {} as T,
        status: 500,
        url,
      }
    }

    // Handle unauthorized (session expired)
    if (response.status === 401) {
      console.warn(`Unauthorized: ${endpoint} - Session likely expired`)

      // Only handle auth redirect in browser context, if not skipped, and not already redirecting
      if (browser && !options.options.skipAuthRedirect && !redirectInProgress) {
        console.log("Initiating redirect to login page due to session expiration")

        // Set the flag immediately
        redirectInProgress = true

        // Clear auth state using the available clearAuth method
        auth.clearAuth()

        // Get current path to redirect back after login
        const currentPath = window.location.pathname + window.location.search
        const redirectParam = currentPath !== "/login" ? `?redirect=${encodeURIComponent(currentPath)}` : ""

        // Force the redirect to happen in the next tick
        setTimeout(() => {
          console.log("Redirecting to login page now...")
          goto(`/login${redirectParam}`, { replaceState: true })
            .then(() => {
              console.log("Redirect to login page complete")
              // Reset the flag after a delay to prevent potential issues
              setTimeout(() => {
                redirectInProgress = false
              }, 1000)
            })
            .catch((err) => {
              console.error("Failed to redirect to login page:", err)
              redirectInProgress = false
            })
        }, 0)
      }

      // Return empty response
      return {
        headers: response.headers,
        data: {} as T,
        status: 401,
        url,
      }
    }

    // Handle 404 - try mock data as fallback
    if (response.status === 404) {
      console.warn(`Endpoint not found: ${endpoint}`)

      try {
        const mockResponse = await this.mockRequest<T>(endpoint)
        if (mockResponse) return mockResponse
      } catch (e) {
        // Continue with error response if mock fails
      }

      // Return empty response
      return {
        headers: response.headers,
        data: {} as T,
        status: 404,
        url,
      }
    }

    // Handle other errors
    if (!response.ok) {
      let errorText = ""
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = "Unknown error"
      }

      console.error(`API call failed: ${response.status} -- ${errorText}`)

      // Return error response instead of throwing
      return {
        headers: response.headers,
        data: {} as T,
        status: response.status,
        url,
      }
    }

    // Parse JSON response
    try {
      const responseData = await response.json()
      return {
        headers: response.headers,
        data: responseData,
        status: response.status,
        url,
      }
    } catch (err) {
      console.error(`Failed to parse JSON:`, err)

      // Return empty data instead of throwing
      return {
        headers: response.headers,
        data: {} as T,
        status: response.status,
        url,
      }
    }
  }

  static async mockRequest<T>(endpoint: string): Promise<RequestResponse<T> | undefined> {
    try {
      endpoint = endpoint.replaceAll("/", "_")
      endpoint = endpoint.split("?", 1)[0]
      console.info(`Mocking ${endpoint}...`)
      const module = await import(`./mocks/${endpoint}.json`)
      await randomDelay() // simulates loading latency
      return {
        headers: new Headers(),
        data: module.default as T,
        status: 200,
        url: `mock${endpoint}`,
      }
    } catch (e) {
      console.error("Mock request failed:", e)
      return undefined
    }
  }

  static async get<T>(endpoint: string, options: MethodOptions = {}) {
    return this.request<T>(
      endpoint,
      {
        method: "GET",
        options,
      },
      options?.fetch,
    )
  }

  static async post<T>(endpoint: string, data: object, options: MethodOptions = {}) {
    return this.request<T>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(data),
        options,
      },
      options?.fetch,
    )
  }

  static async put<T>(endpoint: string, data: object, options: MethodOptions = {}) {
    return this.request<T>(
      endpoint,
      {
        method: "PUT",
        body: JSON.stringify(data),
        options,
      },
      options?.fetch,
    )
  }

  static async delete<T>(endpoint: string, options: MethodOptions = {}) {
    return this.request<T>(
      endpoint,
      {
        method: "DELETE",
        options,
      },
      options?.fetch,
    )
  }
}

