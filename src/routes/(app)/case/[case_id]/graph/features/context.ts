import { getContext, setContext } from 'svelte';
import type { GraphActions } from '../lib/actions';
import type { GraphTimeControl } from './time.svelte';
import type { GraphDeepLink } from './deep-link.svelte';

/**
 * What the feature components (toolbar items, rail panels, overlays) need
 * beyond the `graph` prop they receive: page permissions, the page actions
 * and the feature controllers. Set by `installGraphFeatures`.
 */
export interface GraphFeatures {
	caseId: number;
	canEdit: () => boolean;
	actions: GraphActions;
	time: GraphTimeControl;
	deepLink: GraphDeepLink;
}

const KEY = Symbol('case-graph-features');

export const setGraphFeatures = (features: GraphFeatures) =>
	setContext<GraphFeatures>(KEY, features);

export const getGraphFeatures = () => getContext<GraphFeatures>(KEY);
