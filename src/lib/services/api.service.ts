import { env } from "$env/dynamic/public";
import { PUBLIC_USE_MOCK_API_DATA } from "$env/static/public";
import { browser } from "$app/environment";
import { randomDelay } from "$lib/utils/mock";
import { goto } from "$app/navigation";
import { auth } from "$lib/stores/auth.store";
import { AuthService } from "./auth.service";
import { API_BASE_URL } from "$lib/config/api.config";
import { ApiLogger } from "$lib/utils/api-logger";

interface RequestOptions {
  method: string;
  body?: string;
  options: MethodOptions;
}

interface MethodOptions {
  sessionCookie?: string;
  fetch?: typeof fetch;
  skipAuthRedirect?: boolean;
}

export interface RequestResponse<T> {
  headers: Headers;
  status: number;
  data: T;
  url: string;
}

export interface Paginated<T> {
  total: number;
  data: T[];
  last_page: number | null;
  current_page: number;
  next_page: number | null;
}

export interface ApiOptions {
  headers?: Record<string, string>;
  skipAuthRedirect?: boolean;
  skipTokenRefresh?: boolean;
  fetch?: typeof fetch;
  absoluteUrl?: boolean;
  useApiPrefix?: boolean; // Whether to use the API prefix (default: true)
}

// Static variable outside the class to ensure it's truly static across all instances
let redirectInProgress = false;

export class ApiService {
  private static baseUrl = browser ? env.PUBLIC_EXTERNAL_API_URL : env.PUBLIC_INTERNAL_API_URL;

  static async get<T = any>(url: string, options: ApiOptions = {}): Promise<any> {
    return ApiService.request<T>("GET", url, undefined, options);
  }

  static async post<T = any>(url: string, data?: any, options: ApiOptions = {}): Promise<any> {
    return ApiService.request<T>("POST", url, data, options);
  }

  static async put<T = any>(url: string, data: any, options: ApiOptions = {}): Promise<any> {
    return ApiService.request<T>("PUT", url, data, options);
  }

  static async delete<T = any>(url: string, options: ApiOptions = {}): Promise<any> {
    return ApiService.request<T>("DELETE", url, undefined, options);
  }

  static async patch<T = any>(url: string, data: any, options: ApiOptions = {}): Promise<any> {
    return ApiService.request<T>("PATCH", url, data, options);
  }

  private static async request<T>(
    method: string,
    url: string,
    data?: any,
    { 
      headers = {}, 
      skipAuthRedirect = false,
      skipTokenRefresh = false,
      fetch: customFetch = browser ? window.fetch : global.fetch,
      absoluteUrl = false,
      useApiPrefix = true
    }: ApiOptions = {}
  ): Promise<{ data: T; status: number; headers: Headers }> {
    const startTime = Date.now();
    try {
      // Use the full URL or build it with our base URL
      const fullUrl = absoluteUrl ? url : ApiService.buildApiUrl(url, useApiPrefix);
      
      console.log(`Making ${method} request to: ${fullUrl}`);
      
      // Create headers object properly to ensure it's iterable
      const fetchHeaders = new Headers({
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...headers
      });

      const fetchOptions: RequestInit = {
        method,
        headers: fetchHeaders,
      };

      // Add authentication token if available
      if (!headers['Authorization'] && !skipTokenRefresh) {
        console.log(`Adding auth token to request...`);
        console.log(auth.isTokenExpired(), auth.isRefreshTokenExpired());
        // Check if token refresh is needed
        if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
          await AuthService.refreshToken();
          console.log(`Token refreshed successfully.`);
        }
        
        const accessToken = auth.getAccessToken();
        console.log(`Access token: ${accessToken}`);
        if (accessToken) {
          fetchHeaders.set("Authorization", `Bearer ${accessToken}`);
        }
      }
      console.log(`Request Headers:`, Object.fromEntries(fetchHeaders.entries()));


      // Add body if we have data
      if (data) {
        fetchOptions.body = JSON.stringify(data);
        
        // Required option in newer Node.js versions when sending a body
        fetchOptions.duplex = 'half';
      }

      // Log the request
      ApiLogger.logRequest(
        method, 
        fullUrl.toString(), 
        Object.fromEntries([...fetchHeaders.entries()]), 
        data
      );

      try {
        // Make the request with the full URL
        const response = await customFetch(fullUrl, fetchOptions);
        
        // Get response headers as object
        const responseHeaders = Object.fromEntries([...response.headers.entries()]);
        
        // Clone the response to read the body without consuming it
        const clonedResponse = response.clone();
        let responseBody;
        
        try {
          // Only attempt to parse JSON responses
          if (response.headers.get('content-type')?.includes('application/json')) {
            responseBody = await clonedResponse.json();
          }
        } catch (e) {
          responseBody = '[unparseable response]';
        }
        
        // Log the response
        ApiLogger.logResponse(
          method, 
          fullUrl.toString(), 
          response.status, 
          responseHeaders, 
          responseBody, 
          Date.now() - startTime
        );

        // Check for unauthorized access (401)
        if (response.status === 401 && !skipAuthRedirect && !skipTokenRefresh) {
          // Try to refresh the token
          const refreshSuccessful = await AuthService.refreshToken();
          
          if (refreshSuccessful) {
            // Retry the original request with the new token
            return ApiService.request(method, url, data, { 
              headers, 
              skipAuthRedirect, 
              skipTokenRefresh: true,
              fetch: customFetch,
              absoluteUrl,
              useApiPrefix
            });
          } else {
            // If refresh failed, trigger session expiration
            if (browser) {
              window.dispatchEvent(new CustomEvent('session-expired'));
            }
            throw new Error('Unauthorized: Session expired');
          }
        }

        // Parse the response
        let responseData;
        const contentType = response.headers.get("Content-Type");
        
        if (contentType && contentType.includes("application/json")) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        // Return the response data, status, and headers
        return {
          data: responseData,
          status: response.status,
          headers: response.headers,
          ok: response.ok
        };
      } catch (error: any) {
        // Log the error
        ApiLogger.logResponse(
          method,
          fullUrl.toString(),
          0,
          {},
          { error: error.message },
          Date.now() - startTime
        );

        // Handle the error gracefully without crashing
        console.error(`API fetch error: ${error.message}`);
        
        // For CORS errors, provide a more specific log to help debugging
        if (error.message.includes('CORS')) {
          console.warn('CORS issue detected. Please check backend CORS configuration.');
        }
        
        // Return a default response instead of throwing to prevent crash
        return {
          data: null,
          error: {
            message: error.message || 'Network request failed',
            type: 'network_error',
            status: 0,
          },
          status: 0,
          ok: false
        };
      }
    } catch (error: any) {
      // Handle any other errors that may occur outside the fetch call
      console.error(`API processing error: ${error.message}`);
      
      // Return a default response instead of throwing
      return {
        data: null,
        error: {
          message: error.message || 'Request processing failed',
          type: 'processing_error',
          status: 0,
        },
        status: 0,
        ok: false
      };
    }
  }

  /**
   * Helper method to build API URLs consistently
   */
  private static buildApiUrl(path: string, useApiPrefix = true): string {
    // Ensure path starts with a slash
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Remove trailing slash from base URL if it exists
    // If we are server side, we need to use the API_BASE_URL, otherwise use our base URL
    let baseUrl = '';
    if (!browser) {
      baseUrl = API_BASE_URL.endsWith('/') 
      ? API_BASE_URL.slice(0, -1) 
      : API_BASE_URL;
    } else {
      baseUrl = ApiService.baseUrl.endsWith('/') 
      ? ApiService.baseUrl.slice(0, -1) 
      : ApiService.baseUrl;
    }
    
    
    // Check if the path is already an API or auth path
    const isApiPath = normalizedPath.startsWith('/api/') || 
                     normalizedPath.startsWith('/api/v2/') || 
                     normalizedPath.startsWith('/auth/');
                     
    // Add API prefix if needed and not already present
    if (useApiPrefix && !isApiPath) {
      // Default to /api/v2 for compatibility with the backend
      normalizedPath = `/api/v2${normalizedPath}`;
    }
    
    return `${baseUrl}${normalizedPath}`;
  }

  static async mockRequest<T>(endpoint: string): Promise<RequestResponse<T> | undefined> {
    try {
      endpoint = endpoint.replaceAll("/", "_");
      endpoint = endpoint.split("?", 1)[0];
      console.info(`Mocking ${endpoint}...`);
      const module = await import(`./mocks/${endpoint}.json`);
      await randomDelay(); // simulates loading latency
      return {
        headers: new Headers(),
        data: module.default as T,
        status: 200,
        url: `mock${endpoint}`,
      };
    } catch (e) {
      console.error("Mock request failed:", e);
      return undefined;
    }
  }
}

