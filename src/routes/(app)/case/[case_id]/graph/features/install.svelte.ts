import { browser } from '$app/environment';
import { page } from '$app/state';
import { fromStore } from 'svelte/store';
import { current_user } from '$lib/stores/auth.store';
import { parseGraphLink } from '$lib/utils/graph-links';
import type { CaseGraphState } from '../lib/graph-state.svelte';
import type { GraphActions } from '../lib/actions';
import { setGraphFeatures, type GraphFeatures } from './context';
import { GraphTimeControl } from './time.svelte';
import { GraphDeepLink } from './deep-link.svelte';
import { GraphViewsControl } from './views.svelte';
import ViewsMenu from './views/ViewsMenu.svelte';
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
	const user = fromStore(current_user);
	const userId = () => user.current?.user_id ?? user.current?.id ?? null;

	const time = new GraphTimeControl(graph);
	const deepLink = new GraphDeepLink(graph, parseGraphLink(page.url.searchParams));
	const views = new GraphViewsControl(graph, { userId, canEdit: opts.canEdit });

	const features: GraphFeatures = { ...opts, userId, time, deepLink, views };
	setGraphFeatures(features);

	deepLink.watch();
	if (browser) void views.init();

	const cleanups = [
		time.register(),
		graph.registerToolbarItem({ id: 'time', component: TimeButton, slot: 'start', order: 10 }),
		graph.registerToolbarItem({ id: 'views', component: ViewsMenu, slot: 'end', order: 10 }),
		graph.registerCanvasOverlay({ id: 'time', component: TimeBar }),
		graph.registerCanvasOverlay({ id: 'deep-link', component: DeepLinkChip })
	];

	return () => {
		for (const off of cleanups) off();
		time.dispose();
	};
};
