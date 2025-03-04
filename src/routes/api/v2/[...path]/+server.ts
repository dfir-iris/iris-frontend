// src/routes/api/v2/[...path]/+server.ts

import type { RequestEvent } from '@sveltejs/kit';

/**
 * If you only care about GET, define GET. For POST, PUT, DELETE, etc.,
 * also define export const POST/PUT/DELETE, etc. Or define them all.
 */
export async function GET(event: RequestEvent) {
  return proxyRequest(event);
}

export async function POST(event: RequestEvent) {
  return proxyRequest(event);
}

export async function PUT(event: RequestEvent) {
  return proxyRequest(event);
}

export async function DELETE(event: RequestEvent) {
  return proxyRequest(event);
}

/**
 * The function that actually proxies the request to your backend.
 */
async function proxyRequest(event: RequestEvent) {
  const { request, params, url } = event;

  // params.path is an array of path segments after /api/v2/
  // e.g., /api/v2/foo/bar => params.path = ["foo", "bar"]
  const pathSegments = Array.isArray(params.path) ? params.path : [params.path];
  const subPath = pathSegments.join('/');

  // Rebuild the full URL to your real backend (including query params)
  const backendUrl = new URL(`http://app:8000/api/v2/${subPath}`);
  // forward any query params
  backendUrl.search = url.search; 

  // Rebuild the request for your backend
  const backendResponse = await event.fetch(backendUrl, {
    method: request.method,
    headers: request.headers, // forward all the original headers
    // Forward request body only if it's not a GET/HEAD
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? request.body
      : undefined
    // You might also set `credentials: 'include'` if you want to forward cookies
  });

  // Return the backend’s response to the user
  return new Response(backendResponse.body, {
    // mirror the status
    status: backendResponse.status,
    // mirror (or adjust) the headers
    headers: backendResponse.headers
  });
}
