// src/hooks.server.ts
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { API_BASE_URL } from '$lib/config/api.config';
import { createForwardingRequest } from '$lib/utils/request-forwarding';
import { DEV } from 'esm-env';

// Define our backend API URL

const AUTH_EXCLUDED_URLS = [
	'/[fallback]',
	'/login'
];

/**
 * Process headers to ensure they're valid for proxying
 * This function removes problematic headers that could cause issues
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  
  // Copy headers but skip problematic ones
  headers.forEach((value, key) => {
    // Skip headers that cause issues with Node's fetch
    if (
      key.toLowerCase() !== 'connection' &&
      key.toLowerCase() !== 'content-length' &&
      key.toLowerCase() !== 'host' &&
      !key.toLowerCase().startsWith('sec-')
    ) {
      result[key] = value;
    }
  });
  
  return result;
}


/**
 * Fetches current auth state, returning it as a events.local
 */
export const handle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  
  // Log incoming request
  if (DEV) {
    console.log(`[${requestId}] 📥 Request: ${event.request.method} ${event.url.pathname}${event.url.search}`);
  }
  
  // Proxy auth requests to the backend
  if (event.url.pathname.startsWith('/api/v2/') || event.url.pathname.startsWith('/auth/')){
    // Map the frontend auth endpoint to the correct backend endpoint without duplicating /api/v2/
    const apiUrl = event.url.pathname.startsWith('/auth/') 
      ? `${API_BASE_URL}/auth/${event.url.pathname.replace('/auth/', '')}` 
      : `${API_BASE_URL.replace('/api/v2', '')}${event.url.pathname}`;
    
    console.log(`Proxying ${event.request.method} request to ${apiUrl}`);
    
    try {
      // For POST requests, we need to handle the body specially
      if (['POST', 'PUT', 'PATCH'].includes(event.request.method)) {
        // Clone the request to read its body
        const clonedRequest = event.request.clone();
        const text = await clonedRequest.text();
        
        let bodyObj;
        try {
          bodyObj = JSON.parse(text);
        } catch (e) {
          console.error(`Failed to parse body as JSON: ${e}`);
          bodyObj = { data: text };
        }

        // Check if the headers contain a Content-Type
        const contentType = event.request.headers.get('Content-Type');
        if (contentType) {
          // If the Content-Type is not application/json, we need to set it
          if (!contentType.includes('application/json')) {
            event.request.headers.set('Content-Type', 'application/json');
          }
        }
        // If the request body is not JSON, we need to set it
        if (typeof bodyObj !== 'object') {
          event.request.headers.set('Content-Type', 'application/json');
          bodyObj = { data: bodyObj };
        }
        
        // Directly create a new fetch request with stringified JSON and proper headers
        const response = await fetch(apiUrl, {
          method: event.request.method,
          headers: {
            ...sanitizeHeaders(event.request.headers),
          },
          body: JSON.stringify(bodyObj)
        });
        
        // Handle response
        let responseData;
        try {
          if (response.headers.get('content-type')?.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
                    
          // If this was a login request and it was successful, perform redirection
          if (event.url.pathname === '/auth/login' && response.status === 200) {
            // Store the tokens in cookies if they exist in the response
            if (responseData && typeof responseData === 'object') {
              const authData = responseData.data || responseData;

							console.log(`Auth data: ${JSON.stringify(authData)}`);
              
              if (authData.access_token) {
                event.cookies.set('access_token', authData.access_token, {
                  path: '/',
                  httpOnly: true,
                  secure: true,
                  sameSite: 'strict',
                  maxAge: 60 * 60 // 1 hour
                });
              }
              
              if (authData.refresh_token) {
                event.cookies.set('refresh_token', authData.refresh_token, {
                  path: '/',
                  httpOnly: true,
                  secure: true,
                  sameSite: 'strict',
                  maxAge: 7 * 24 * 60 * 60 // 7 days
                });
              }
              
              // Set successful login flag for redirection, redirect to the original URL
              const redirectUrl = event.url.searchParams.get('redirect') || '/';
              // Ensure the redirect URL is safe
              let safeRedirectUrl = new URL(redirectUrl, event.url.origin);
              if (!safeRedirectUrl.pathname.startsWith('/')) {
                console.error(`Unsafe redirect URL: ${redirectUrl}`);
                safeRedirectUrl = new URL('/', event.url.origin);
              }

              return new Response(JSON.stringify({
                success: true,
                redirect: safeRedirectUrl.toString(),
                ...responseData
              }), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  // Copy needed headers
                  ...Object.fromEntries([...response.headers.entries()]
                    .filter(([key]) => !['content-length', 'connection'].includes(key.toLowerCase())))
                }
              });
            }
          }
          
          return new Response(JSON.stringify(responseData), {
            status: response.status,
            headers: { 
              'Content-Type': 'application/json',
              // Copy needed headers
              ...Object.fromEntries([...response.headers.entries()]
                .filter(([key]) => !['content-length', 'connection'].includes(key.toLowerCase())))
            }
          });
        } catch (err) {
          console.error(`Error processing response: ${err}`);
          return new Response(JSON.stringify({ error: 'Failed to process response' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        // For non-POST requests, use the existing code
        // Create sanitized headers
        const headers = sanitizeHeaders(event.request.headers);
        
        // Send the request to backend API
        const response = await fetch(apiUrl, {
          method: event.request.method,
          headers: {
            ...headers          
          }
        });
        
        // Get response data
        let responseData;
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
        
        // Create a new response with the data
        return new Response(JSON.stringify(responseData), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            // Copy any other needed headers
            ...Object.fromEntries([...response.headers.entries()]
              .filter(([key]) => !['content-length', 'connection'].includes(key.toLowerCase())))
          }
        });
      }
    } catch (error) {
      console.error('Auth proxy error:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to connect to authentication service',
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Check authentication status for protected routes
  if (!AUTH_EXCLUDED_URLS.includes(event.url.pathname) && 
      !event.url.pathname.startsWith('/api/') && 
      !event.url.pathname.startsWith('/auth/')) {
    
    const accessToken = event.cookies.get('access_token');
    
    // Set the Authorization header if we have a token
    // but DON'T redirect - let the client handle redirects
    if (accessToken) {
      event.request.headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }
  
  // Continue normal request handling for non-proxy paths
  const response = await resolve(event);
  
  // Log response
  if (DEV) {
    console.log(`[${requestId}] 📤 Response: ${response.status}`);
  }
  
  return response;
};

// Helper function for building API URLs consistently
function buildApiUrl(path: string): string {
  // Ensure path starts with a slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Remove trailing slash from base URL if it exists
  const baseUrl = API_BASE_URL.endsWith('/') 
    ? API_BASE_URL.slice(0, -1) 
    : API_BASE_URL;
    
  return `${baseUrl}${normalizedPath}`;
}

// Add a handleFetch to attach auth tokens to server-side fetch requests
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	// Check if this is an API request that needs to be modified
	const url = new URL(request.url);
	
	// This is critical: forward all API requests to the backend
	if (url.pathname.startsWith('/api/v2/') || 
	    url.pathname.startsWith('/api/') ||
	    url.pathname.startsWith('/auth/')) {
	    
		// For API requests, ensure we're using the correct base URL
		const path = url.pathname + url.search;
		const apiUrl = buildApiUrl(path);
		
		console.log(`Forwarding API request from ${request.url} to ${apiUrl}`);
		
		// Get authorization header from cookies if not already set in the request
		let authHeader = request.headers.get('Authorization');
		if (!authHeader) {
			const accessToken = event.cookies.get('access_token');
			if (accessToken) {
				authHeader = `Bearer ${accessToken}`;
			}
		}
		
		const additionalHeaders = authHeader ? { 'Authorization': authHeader } : undefined;
		
		// Create properly configured request
		const newRequest = createForwardingRequest(apiUrl, request, {
			additionalHeaders
		});
		
		return fetch(newRequest);
	}
	
	// For non-API requests, proceed normally
	return fetch(request);
}