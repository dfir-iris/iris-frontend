import { page } from '$app/state';
import { parseGraphLink } from '$lib/utils/graph-links';
import type { CaseGraphState } from '../lib/graph-state.svelte';
import type { GraphActions } from '../lib/actions';
import { setGraphFeatures, type GraphFeatures } from './context';
import { GraphTimeControl } from './time.svelte';
import { GraphDeepLink } from './deep-link.svelte';
import TimeButton from './time/TimeButton.svelte';
import TimeBar from './time/TimeBar.svelte';
import DeepLinkChip from './links/DeepLinkChip.svelte';

interface InstallOptions {
	caseId: number;
	canEdit: () => boolean;
	actions: GraphActions;
}

/**
 * Create the feature controllers of the graph page, share them through the
 * context and plug their toolbar items, panels, overlays and filters into
 * the graph. Call during the init of `CaseGraphView`; returns the cleanup.
 */
export const installGraphFeatures = (graph: CaseGraphState, opts: InstallOptions) => {
	const time = new GraphTimeControl(graph);
	const deepLink = new GraphDeepLink(graph, parseGraphLink(page.url.searchParams));

	const features: GraphFeatures = { ...opts, time, deepLink };
	setGraphFeatures(features);

	deepLink.watch();

	const cleanups = [
		time.register(),
		graph.registerToolbarItem({ id: 'time', component: TimeButton, slot: 'start', order: 10 }),
		graph.registerCanvasOverlay({ id: 'time', component: TimeBar }),
		graph.registerCanvasOverlay({ id: 'deep-link', component: DeepLinkChip })
	];

	return () => {
		for (const off of cleanups) off();
		time.dispose();
	};
};
