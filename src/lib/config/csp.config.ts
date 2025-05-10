import { API_BASE_URL } from './api.config';

/**
 * Generate Content Security Policy directives
 */
export function generateCSP() {
  // Get the API host for connecting
  const apiUrl = new URL(API_BASE_URL);
  const apiHost = apiUrl.origin;
  
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", apiHost],
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"]
  };
}

/**
 * Convert CSP object to string format
 */
export function cspObjectToString(cspObject: Record<string, string[]>): string {
  return Object.entries(cspObject)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
