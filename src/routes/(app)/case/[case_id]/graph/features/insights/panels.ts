import { BotIcon, ScrollTextIcon, ShieldAlertIcon, SparklesIcon } from 'lucide-svelte';
import type { CaseGraphState } from '../../lib/graph-state.svelte';
import SuggestionsPanel from './SuggestionsPanel.svelte';
import AiProposalsPanel from './AiProposalsPanel.svelte';
import GapsPanel from './GapsPanel.svelte';
import ExplainPanel from './ExplainPanel.svelte';

export const INSIGHT_PANELS = ['suggestions', 'ai', 'gaps', 'explain'];

/** Register the intelligence panels; the AI ones only when an LLM is usable. */
export const registerInsightPanels = (graph: CaseGraphState, llm: boolean) => [
	graph.registerPanel({
		id: 'suggestions',
		title: 'Suggestions',
		icon: SparklesIcon,
		component: SuggestionsPanel,
		order: 10
	}),
	graph.registerPanel({
		id: 'gaps',
		title: 'Gaps',
		icon: ShieldAlertIcon,
		component: GapsPanel,
		order: 30
	}),
	...(llm
		? [
				graph.registerPanel({
					id: 'ai',
					title: 'AI',
					icon: BotIcon,
					component: AiProposalsPanel,
					order: 20
				}),
				graph.registerPanel({
					id: 'explain',
					title: 'Explain',
					icon: ScrollTextIcon,
					component: ExplainPanel,
					order: 40
				})
			]
		: [])
];
