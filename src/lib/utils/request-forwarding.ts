/**
 * Creates a properly configured Request object for API forwarding
 * 
 * @param url Target URL for the forwarded request
 * @param originalRequest Original request to forward
 * @param options Additional options
 * @returns New Request object configured for forwarding
 */
export function createForwardingRequest(
  url: string,
  originalRequest: Request,
  options: {
    additionalHeaders?: Record<string, string>;
  } = {}
): Request {
  // Determine if we need to include the body
  const includeBody = 
    originalRequest.method !== 'GET' && 
    originalRequest.method !== 'HEAD' &&
    originalRequest.body !== null;
  
  // Create new request options
  const requestInit: RequestInit = {
    method: originalRequest.method,
    headers: new Headers(originalRequest.headers),
    // Only include body and duplex for methods that allow body
    ...(includeBody && {
      body: originalRequest.body,
      duplex: 'half'
    }),
    mode: 'cors',
    credentials: 'include'
  };
  
  // Add any additional headers
  if (options.additionalHeaders) {
    Object.entries(options.additionalHeaders).forEach(([key, value]) => {
      requestInit.headers.set(key, value);
    });
  }
  
  // Create the new request
  return new Request(url, requestInit);
}
