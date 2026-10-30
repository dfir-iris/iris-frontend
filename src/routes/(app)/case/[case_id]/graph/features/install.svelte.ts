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
import { GraphLiveControl } from './realtime.svelte';
import { GraphInsights } from './insights.svelte';
import { registerInsightPanels } from './insights/panels';
import InsightsMenu from './insights/InsightsMenu.svelte';
import ViewsMenu from './views/ViewsMenu.svelte';
import TimeButton from './time/TimeButton.svelte';
import TimeBar from './time/TimeBar.svelte';
import DeepLinkChip from './links/DeepLinkChip.svelte';
import ExchangeMenu from './exchange/ExchangeMenu.svelte';
import ViewModeToggle from './table/ViewModeToggle.svelte';
import TableView from './table/TableView.svelte';
import PresenceList from './live/PresenceList.svelte';
import PresenceBadges from './live/PresenceBadges.svelte';
import UpdatedChip from './live/UpdatedChip.svelte';

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

	const live = new GraphLiveControl(graph, { userId, onViewsChanged: () => views.refreshList() });

	const insights = new GraphInsights(graph, {
		canEdit: opts.canEdit,
		viewName: () => views.current?.name ?? null
	});

	const features: GraphFeatures = { ...opts, userId, time, deepLink, views, live, insights };
	setGraphFeatures(features);

	deepLink.watch();
	if (browser) void views.init();

	const cleanups = [
		time.register(),
		live.start(),
		insights.watch(),
		// The AI panels follow the runtime config (an LLM may be configured or not).
		$effect.root(() => {
			$effect(() => {
				const offs = registerInsightPanels(graph, insights.llm);
				return () => offs.forEach((off) => off());
			});
		}),
		graph.registerToolbarItem({ id: 'insights', component: InsightsMenu, slot: 'end', order: 5 }),
		graph.registerToolbarItem({ id: 'presence', component: PresenceList, slot: 'end', order: 0 }),
		graph.registerToolbarItem({
			id: 'view-mode',
			component: ViewModeToggle,
			slot: 'start',
			order: 0
		}),
		graph.registerToolbarItem({ id: 'time', component: TimeButton, slot: 'start', order: 10 }),
		graph.registerToolbarItem({ id: 'views', component: ViewsMenu, slot: 'end', order: 10 }),
		graph.registerToolbarItem({
			id: 'exchange',
			component: ExchangeMenu,
			slot: 'end',
			order: 20
		}),
		graph.registerCanvasOverlay({ id: 'time', component: TimeBar }),
		graph.registerCanvasOverlay({ id: 'deep-link', component: DeepLinkChip }),
		graph.registerCanvasOverlay({ id: 'presence', component: PresenceBadges }),
		graph.registerCanvasOverlay({ id: 'updated', component: UpdatedChip }),
		graph.registerCanvasOverlay({ id: 'table', component: TableView })
	];

	return () => {
		for (const off of cleanups) off();
		time.dispose();
	};
};
