import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillElement, findAnchor, findFirstAnchor, isTutorialUiTarget } from '../dom';

// jsdom has no layout: every rect is 0×0. Mark elements as on screen.
const show = (el: Element) =>
	vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
		width: 10,
		height: 10,
		top: 0,
		left: 0,
		right: 10,
		bottom: 10,
		x: 0,
		y: 0,
		toJSON: () => ({})
	});

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('findAnchor', () => {
	it('prefers a visible match over an earlier hidden one', () => {
		document.body.innerHTML =
			'<button data-tour="go" id="a"></button><button data-tour="go" id="b"></button>';
		show(document.getElementById('b')!);
		expect(findAnchor('go')?.id).toBe('b');
	});

	it('falls back to the first match unless visibleOnly', () => {
		document.body.innerHTML = '<input data-tour="field" id="a" />';
		expect(findAnchor('field')?.id).toBe('a');
		expect(findAnchor('field', { visibleOnly: true })).toBeNull();
	});

	it('accepts CSS selectors and survives invalid ones', () => {
		document.body.innerHTML = '<a href="/war-rooms" id="link"></a>';
		expect(findAnchor('a[href="/war-rooms"]')?.id).toBe('link');
		expect(findAnchor('a[href=')).toBeNull();
	});
});

describe('findFirstAnchor', () => {
	it('returns the first anchor of the list that is on screen', () => {
		document.body.innerHTML =
			'<div data-tour="finding-form" id="form"></div><button data-tour="asset-vuln-add" id="btn"></button>';
		show(document.getElementById('btn')!);
		expect(findFirstAnchor(['finding-form', 'asset-vuln-add'])?.id).toBe('btn');
		show(document.getElementById('form')!);
		expect(findFirstAnchor(['finding-form', 'asset-vuln-add'])?.id).toBe('form');
	});
});

describe('fillElement', () => {
	it('sets a text value and fires input and change', () => {
		document.body.innerHTML = '<input id="name" />';
		const input = document.getElementById('name') as HTMLInputElement;
		const seen: string[] = [];
		input.addEventListener('input', () => seen.push('input'));
		input.addEventListener('change', () => seen.push('change'));

		expect(fillElement(input, 'vpn-gw-01')).toBe(true);
		expect(input.value).toBe('vpn-gw-01');
		expect(seen).toEqual(['input', 'change']);
	});

	it('fills the control inside a wrapper', () => {
		document.body.innerHTML = '<div id="wrap"><textarea></textarea></div>';
		fillElement(document.getElementById('wrap')!, 'hello');
		expect(document.querySelector('textarea')!.value).toBe('hello');
	});

	it('clicks a checkbox only when its state differs', () => {
		document.body.innerHTML = '<input type="checkbox" id="c" />';
		const box = document.getElementById('c') as HTMLInputElement;
		const onClick = vi.fn();
		box.addEventListener('click', onClick);

		fillElement(box, true);
		expect(box.checked).toBe(true);
		fillElement(box, true);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('reports when there is nothing to fill', () => {
		document.body.innerHTML = '<div id="empty"></div>';
		expect(fillElement(document.getElementById('empty')!, 'x')).toBe(false);
	});
});

describe('isTutorialUiTarget', () => {
	it('recognises elements inside the tutorial UI', () => {
		document.body.innerHTML =
			'<section data-tutorial-ui><button id="in"></button></section><button id="out"></button>';
		expect(isTutorialUiTarget(document.getElementById('in'))).toBe(true);
		expect(isTutorialUiTarget(document.getElementById('out'))).toBe(false);
		expect(isTutorialUiTarget(null)).toBe(false);
	});
});
