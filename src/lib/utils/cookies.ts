import type { Cookies } from "@sveltejs/kit";

export function getSessionCookie(headers: Headers | Record<string, any>): string | null {
  const cookies = headers.get ? headers.get('cookie') : headers['cookie'];
  if (!cookies) return null;

  const sessionCookie = cookies.split('; ').find(row => row.startsWith('session='));
  return sessionCookie ? sessionCookie.split('=')[1] : null;
}


export function setAxiosCookieFromRequestCookies(cookies: Cookies) {
  const sessionCookie = cookies.get('session');

  return { headers: {
      'Session-Cookie': sessionCookie
    }
  }
}