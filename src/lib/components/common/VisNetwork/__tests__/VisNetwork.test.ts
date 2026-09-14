/**
 * Regression tests for the `clickToUse` scroll gating on the shared
 * VisNetwork wrapper.
 *
 * The bug: scrolling the alerts page and passing the pointer over an
 * expanded alert's relationship graph zoomed the graph instead of letting
 * the page scroll. There were two independent causes, one per test below.
 *
 * Runs in the node environment, not the project-wide jsdom default: the
 * first test reads `VisNetwork.svelte` off disk, and under jsdom Vite
 * externalises `node:fs`/`node:path`/`node:url` "for browser compatibility",
 * which leaves `fileURLToPath` undefined and the whole suite uncollectable.
 * Nothing here touches the DOM, so node is the correct environment anyway.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseWheelToPage } from '../utils';

const componentPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'VisNetwork.svelte');

describe('VisNetwork clickToUse scroll gating', () => {
	it('styles the clickToUse overlay so it can intercept the wheel', () => {
		// Root cause. vis-network creates `.vis-overlay` at runtime but ships
		// its CSS in a stylesheet the `vis-network` entry point never imports.
		// Left unstyled the overlay is a statically positioned, zero-height
		// div covering nothing, so the wheel reaches the canvas and the graph
		// zooms on hover without any click. These rules must stay here.
		const source = readFileSync(componentPath, 'utf8');
		const overlayRule = source.split(':global(.vis-overlay)')[1]?.split('}')[0]?.replace(/\s/g, '');

		expect(overlayRule).toBeDefined();
		expect(overlayRule).toContain('position:absolute');
		expect(overlayRule).toContain('inset:0');
	});

	it('deactivates the activator so the page regains the wheel', () => {
		const deactivate = vi.fn();
		const network = { activator: { active: true, deactivate } };

		releaseWheelToPage(network, true);

		expect(deactivate).toHaveBeenCalledTimes(1);
	});

	it('leaves the network alone when clickToUse is off', () => {
		// The case and alert-cluster graphs are dedicated full-page views that
		// opt out of gating; leaving them must not disturb their state.
		const deactivate = vi.fn();

		releaseWheelToPage({ activator: { active: true, deactivate } }, false);
		releaseWheelToPage({ activator: { active: true, deactivate } }, undefined);

		expect(deactivate).not.toHaveBeenCalled();
	});

	it('tolerates a missing network or activator', () => {
		// The handler is bound for the lifetime of the container, so it can
		// fire after teardown has nulled the network.
		expect(() => releaseWheelToPage(null, true)).not.toThrow();
		expect(() => releaseWheelToPage({}, true)).not.toThrow();
	});
});
