import { afterEach, describe, expect, it, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { bindZoomGate, createZoomGate } from '../zoom-gate';
import { tooltipPlacement } from '../tooltip';

describe('createZoomGate', () => {
	it('starts with user zooming disabled so the wheel reaches the page', () => {
		const cy = cytoscape({ headless: true });
		createZoomGate(cy);
		expect(cy.userZoomingEnabled()).toBe(false);
	});

	it('enables zooming on activate and disables it on release', () => {
		const cy = cytoscape({ headless: true });
		const onChange = vi.fn();
		const gate = createZoomGate(cy, onChange);

		gate.activate();
		expect(gate.active).toBe(true);
		expect(cy.userZoomingEnabled()).toBe(true);

		gate.release();
		expect(gate.active).toBe(false);
		expect(cy.userZoomingEnabled()).toBe(false);
		expect(onChange.mock.calls).toEqual([[true], [false]]);
	});

	it('only reports actual state changes', () => {
		const onChange = vi.fn();
		const gate = createZoomGate({ userZoomingEnabled: () => undefined }, onChange);
		gate.release();
		gate.activate();
		gate.activate();
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});

describe('bindZoomGate', () => {
	let unbind: (() => void) | undefined;

	afterEach(() => {
		unbind?.();
		unbind = undefined;
		document.body.innerHTML = '';
	});

	const setup = () => {
		const el = document.createElement('div');
		const outside = document.createElement('button');
		document.body.append(el, outside);
		const target = { userZoomingEnabled: vi.fn() };
		const gate = createZoomGate(target);
		unbind = bindZoomGate(el, gate);
		return { el, outside, gate };
	};

	it('activates on pointerdown and focus inside the canvas', () => {
		const { el, gate } = setup();
		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(gate.active).toBe(true);

		gate.release();
		el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(gate.active).toBe(true);
	});

	it('hands the wheel back when the pointer leaves', () => {
		const { el, gate } = setup();
		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		el.dispatchEvent(new MouseEvent('mouseleave'));
		expect(gate.active).toBe(false);
	});

	it('releases on Escape and on a pointerdown elsewhere', () => {
		const { el, outside, gate } = setup();
		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(gate.active).toBe(false);

		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(gate.active).toBe(false);
	});

	it('stops listening once unbound', () => {
		const { el, gate } = setup();
		unbind?.();
		unbind = undefined;
		el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(gate.active).toBe(false);
	});
});

describe('tooltipPlacement', () => {
	const box = { width: 800, height: 600 };

	it('sits below-right of the pointer by default', () => {
		expect(tooltipPlacement({ x: 100, y: 100 }, box)).toEqual({
			left: 112,
			top: 112,
			transform: 'translate(0, 0)'
		});
	});

	it('flips left near the right edge and up near the bottom', () => {
		expect(tooltipPlacement({ x: 700, y: 500 }, box)).toEqual({
			left: 688,
			top: 488,
			transform: 'translate(-100%, -100%)'
		});
	});
});
