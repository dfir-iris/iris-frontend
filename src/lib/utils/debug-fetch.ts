import { DEV } from 'esm-env';
import type { LoadEvent } from '@sveltejs/kit';

/**
 * A debug wrapper for the fetch function in load functions
 */
export function createDebugFetch(event: LoadEvent) {
  const originalFetch = event.fetch;
  
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!DEV) {
      return originalFetch(input, init);
    }
    
    const startTime = Date.now();
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    
    console.group(`[Load] 📤 ${method} ${url}`);
    
    try {
      const response = await originalFetch(input, init);
      const duration = Date.now() - startTime;
      
      console.log(`[Load] 📥 Response: ${response.status} (${duration}ms)`);
      
      // Clone to avoid consuming the response
      const clonedResponse = response.clone();
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          const data = await clonedResponse.json();
          console.log('[Load] 📦 Data:', data);
        } catch (e) {
          console.log('[Load] ⚠️ Could not parse JSON response');
        }
      }
      
      console.groupEnd();
      return response;
    } catch (error) {
      console.log('[Load] ❌ Error:', error);
      console.groupEnd();
      throw error;
    }
  };
}
