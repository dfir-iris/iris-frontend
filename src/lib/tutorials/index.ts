import type { Tutorial } from './types';
import { trackVulnerabilityTutorial } from './catalogue/track-vulnerability';

export const TUTORIALS: Tutorial[] = [trackVulnerabilityTutorial];

export const tutorialById = (id: string): Tutorial | undefined =>
	TUTORIALS.find((tutorial) => tutorial.id === id);
