// Post-login destination handling.
//
// Everything here is deliberately framework-free: the sanitizer is imported
// by both the browser bundle (root layout guard, /login page, MFA pages) and
// the server-side login form action, so it must not pull in `$app/*`.
//
// The rules mirror the login action's historic `safeRedirect`: only a plain
// same-origin path may be used as a post-login destination. Anything with a
// scheme or authority, a control character/backslash (browsers normalise `\`
// to `/`), a protocol-relative `//` prefix, or a path that points back at
// /login (which would restart the login cycle) collapses to `/`.

// eslint-disable-next-line no-control-regex
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * True for any route served by the login page, so we never treat one as a
 * post-login destination (and never wrap it in another `?redirect=`).
 */
export const isLoginPath = (pathname: string): boolean =>
	pathname === '/login' || pathname.startsWith('/login/');

/**
 * Validate a `?redirect=` target before navigating to it.
 *
 * Returns `/` for anything unusable, otherwise the raw path (query/hash kept).
 */
export const safeRedirect = (raw: string | null | undefined): string => {
	if (!raw) return '/';
	if (CONTROL_OR_BACKSLASH.test(raw)) return '/';
	if (!raw.startsWith('/') || raw.startsWith('//')) return '/';

	const path = raw.split('?')[0].split('#')[0];
	if (isLoginPath(path)) return '/';

	return raw;
};

/**
 * Sanitized post-login destination carried by a URL. `redirect` is the
 * canonical parameter; `redirectTo` is accepted as a legacy alias.
 */
export const redirectTargetFromUrl = (url: URL): string =>
	safeRedirect(url.searchParams.get('redirect') ?? url.searchParams.get('redirectTo'));

/**
 * The /login URL that remembers where the user was trying to go. Already
 * being on a login route passes the URL through untouched (avoids
 * /login -> /login loops and keeps an existing `?redirect=`).
 */
export const loginUrlForDeepLink = (pathname: string, search: string): string => {
	if (isLoginPath(pathname)) return pathname + search;

	return `/login?redirect=${encodeURIComponent(safeRedirect(pathname + search))}`;
};

/**
 * Append a sanitized destination to another login-flow URL. A `/` destination
 * is the default and is left implicit.
 */
export const withRedirectParam = (path: string, target: string): string =>
	!target || target === '/' ? path : `${path}?redirect=${encodeURIComponent(target)}`;
