import { describe, it, expect } from 'vitest';
import {
	isLoginPath,
	loginUrlForDeepLink,
	redirectTargetFromUrl,
	safeRedirect,
	withRedirectParam
} from '../redirect';

describe('safeRedirect', () => {
	it('defaults to / when there is no destination', () => {
		expect(safeRedirect(null)).toBe('/');
		expect(safeRedirect(undefined)).toBe('/');
		expect(safeRedirect('')).toBe('/');
	});

	it('accepts a plain same-origin path', () => {
		expect(safeRedirect('/cases')).toBe('/cases');
		expect(safeRedirect('/case/1/tasks/7')).toBe('/case/1/tasks/7');
		expect(safeRedirect('/case/1/tasks/7?tab=notes#top')).toBe('/case/1/tasks/7?tab=notes#top');
	});

	it('rejects absolute URLs', () => {
		expect(safeRedirect('https://evil.example.com/cases')).toBe('/');
		expect(safeRedirect('http://evil.example.com')).toBe('/');
		expect(safeRedirect('mailto:analyst@example.com')).toBe('/');
	});

	it('rejects protocol-relative URLs', () => {
		expect(safeRedirect('//evil.example.com/cases')).toBe('/');
		expect(safeRedirect('//evil.example.com')).toBe('/');
	});

	it('rejects backslashes, which browsers normalise to slashes', () => {
		expect(safeRedirect('/\\evil.example.com')).toBe('/');
		expect(safeRedirect('/cases\\foo')).toBe('/');
	});

	it('rejects control characters', () => {
		expect(safeRedirect('/cases\twith-tab')).toBe('/');
		expect(safeRedirect('/cases\nwith-newline')).toBe('/');
		expect(safeRedirect('/cases\u0000nul')).toBe('/');
	});

	it('rejects relative paths that do not start with /', () => {
		expect(safeRedirect('cases')).toBe('/');
		expect(safeRedirect('./cases')).toBe('/');
	});

	it('rejects paths pointing back at the login page', () => {
		expect(safeRedirect('/login')).toBe('/');
		expect(safeRedirect('/login?redirect=%2Fcases')).toBe('/');
		expect(safeRedirect('/login/mfa-setup')).toBe('/');
		expect(safeRedirect('/login/mfa-verify?redirect=%2Fcases')).toBe('/');
	});

	it('does not reject paths that merely start with /login', () => {
		expect(safeRedirect('/loginx')).toBe('/loginx');
	});
});

describe('isLoginPath', () => {
	it('matches the login page and its nested routes', () => {
		expect(isLoginPath('/login')).toBe(true);
		expect(isLoginPath('/login/mfa-setup')).toBe(true);
		expect(isLoginPath('/login/mfa-verify')).toBe(true);
	});

	it('does not match ordinary app routes', () => {
		expect(isLoginPath('/')).toBe(false);
		expect(isLoginPath('/cases')).toBe(false);
		expect(isLoginPath('/loginx')).toBe(false);
		expect(isLoginPath('/case/1/tasks/7')).toBe(false);
	});
});

describe('redirectTargetFromUrl', () => {
	const url = (search: string) => new URL(`https://iris.example.com/login${search}`);

	it('reads the canonical redirect parameter', () => {
		expect(redirectTargetFromUrl(url('?redirect=%2Fcases'))).toBe('/cases');
		expect(redirectTargetFromUrl(url('?redirect=%2Fcase%2F1%2Ftasks%2F7'))).toBe('/case/1/tasks/7');
	});

	it('accepts the legacy redirectTo parameter', () => {
		expect(redirectTargetFromUrl(url('?redirectTo=%2Factivities'))).toBe('/activities');
	});

	it('prefers redirect over redirectTo when both are present', () => {
		expect(redirectTargetFromUrl(url('?redirect=%2Fcases&redirectTo=%2Falerts'))).toBe('/cases');
	});

	it('defaults to / when neither parameter is present', () => {
		expect(redirectTargetFromUrl(url(''))).toBe('/');
		expect(redirectTargetFromUrl(url('?oidc=1'))).toBe('/');
	});

	it('sanitizes hostile values carried by the URL', () => {
		expect(redirectTargetFromUrl(url('?redirect=https%3A%2F%2Fevil.example.com'))).toBe('/');
		expect(redirectTargetFromUrl(url('?redirect=%2F%2Fevil.example.com'))).toBe('/');
		expect(redirectTargetFromUrl(url('?redirect=%2Flogin'))).toBe('/');
	});
});

describe('loginUrlForDeepLink', () => {
	it('carries a deep link into the login URL', () => {
		expect(loginUrlForDeepLink('/case/1/tasks/7', '')).toBe(
			'/login?redirect=%2Fcase%2F1%2Ftasks%2F7'
		);
		expect(loginUrlForDeepLink('/cases', '?page=2')).toBe('/login?redirect=%2Fcases%3Fpage%3D2');
	});

	it('encodes a destination only once', () => {
		const encoded = loginUrlForDeepLink('/activities', '?q=login&page=2');
		const redirectParam = new URL(`https://iris.example.com${encoded}`).searchParams.get(
			'redirect'
		);

		expect(redirectParam).toBe('/activities?q=login&page=2');
	});

	it('passes a login URL through unchanged, including its own redirect param', () => {
		expect(loginUrlForDeepLink('/login', '')).toBe('/login');
		expect(loginUrlForDeepLink('/login', '?redirect=%2Fcases')).toBe('/login?redirect=%2Fcases');
		expect(loginUrlForDeepLink('/login/mfa-setup', '?redirect=%2Fcases')).toBe(
			'/login/mfa-setup?redirect=%2Fcases'
		);
	});

	it('refuses to wrap a /login destination in another redirect param', () => {
		expect(loginUrlForDeepLink('//evil.example.com', '')).toBe('/login?redirect=%2F');
		expect(loginUrlForDeepLink('/loginx', '')).toBe('/login?redirect=%2Floginx');
	});
});

describe('withRedirectParam', () => {
	it('leaves the path unchanged for the default destination', () => {
		expect(withRedirectParam('/oidc-login', '/')).toBe('/oidc-login');
		expect(withRedirectParam('/oidc-login', '')).toBe('/oidc-login');
	});

	it('appends an encoded redirect parameter', () => {
		expect(withRedirectParam('/oidc-login', '/case/1/tasks/7')).toBe(
			'/oidc-login?redirect=%2Fcase%2F1%2Ftasks%2F7'
		);
		expect(withRedirectParam('/login/mfa-setup', '/cases?page=2')).toBe(
			'/login/mfa-setup?redirect=%2Fcases%3Fpage%3D2'
		);
	});

	it('does not double-encode a path that already carries a query', () => {
		const encodedUrl = withRedirectParam('/oidc-login', '/activities?q=a&page=2');
		const redirectParam = new URL(`https://iris.example.com${encodedUrl}`).searchParams.get(
			'redirect'
		);

		expect(redirectParam).toBe('/activities?q=a&page=2');
	});
});
