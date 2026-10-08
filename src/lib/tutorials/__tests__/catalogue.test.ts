import { describe, expect, it } from 'vitest';
import { TUTORIALS, tutorialById } from '..';
import { missingVars } from '../logic';
import type { TutorialStep } from '../types';

/** Every string of a step that may reference `{vars}`. */
const templates = (step: TutorialStep): string[] => {
	const out = [step.body, step.goTo ?? ''];
	out.push(...(Array.isArray(step.anchor) ? step.anchor : [step.anchor ?? '']));
	for (const fill of step.fills ?? []) {
		out.push(fill.anchor);
		if (typeof fill.value === 'string') out.push(fill.value);
	}
	const wait = step.waitFor;
	if (wait?.kind === 'element') out.push(wait.anchor);
	if ((wait?.kind === 'api' || wait?.kind === 'route') && typeof wait.path === 'string')
		out.push(wait.path);
	return out;
};

describe('tutorial catalogue', () => {
	it('has unique ids', () => {
		const ids = TUTORIALS.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(tutorialById(ids[0])).toBe(TUTORIALS[0]);
		expect(tutorialById('nope')).toBeUndefined();
	});

	for (const tutorial of TUTORIALS) {
		it(`${tutorial.id}: only references values captured by earlier steps`, () => {
			const known: Record<string, string> = {};
			tutorial.steps.forEach((step, index) => {
				for (const template of templates(step)) {
					expect(missingVars(template, known), `step ${index + 1} "${step.title}"`).toEqual([]);
				}
				if (step.waitFor?.kind === 'api') {
					for (const name of Object.keys(step.waitFor.capture ?? {})) known[name] = name;
				}
			});
		});
	}
});
