<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { SideBar } from '$lib/components/navigation/SideBar';
	import TopBar from '$lib/components/navigation/TopBar/TopBar.svelte';
	import ChatBotPanel from '$lib/components/common/ChatBot/ChatBotPanel.svelte';
	import TopBanners from '$lib/components/common/TopBanners/TopBanners.svelte';
	import { dismissedBanners } from '$lib/stores/dismissed-banners.store.svelte';
	import { CaseAddModal } from './[components]/CaseModals';
	import { APP_CTX, createAppContext, type AppContext } from '$lib/contexts/app.context.svelte';
	import {
		CASES_CTX,
		createCasesContext,
		type CasesContext
	} from '$lib/contexts/cases.context.svelte';
	import {
		ALERTS_CTX,
		createAlertsContext,
		type AlertsContext
	} from '$lib/contexts/alerts.context.svelte';
	import {
		CHAT_PANEL_CTX,
		createChatPanelContext,
		type ChatPanelContext
	} from '$lib/contexts/chat-panel.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import {
		USER_CTX,
		createUserContext,
		type UserCtx
	} from '$lib/contexts/user-context.context.svelte';
	import {
		CASE_TEMPLATES_CTX,
		createCaseTemplatesContext,
		type CaseTemplatesContext
	} from '$lib/contexts/case-templates.context.svelte';

	let { children }: { children: Snippet } = $props();

	const app: AppContext = createAppContext();
	setContext(APP_CTX, app);

	const alerts: AlertsContext = createAlertsContext((a) => a.alert_id);
	setContext(ALERTS_CTX, alerts);

	const cases: CasesContext = createCasesContext((c) => c.case_id, app);
	setContext(CASES_CTX, cases);

	const userCtx: UserCtx = createUserContext();
	setContext(USER_CTX, userCtx);

	const chatPanel: ChatPanelContext = createChatPanelContext();
	setContext(CHAT_PANEL_CTX, chatPanel);

	const caseTemplates: CaseTemplatesContext = createCaseTemplatesContext((t) => t.id);
	setContext(CASE_TEMPLATES_CTX, caseTemplates);

	const chatbotEnabled = $derived<boolean>(runtimeConfig.chatbot.enabled);

	const showCaseAdd = $derived<boolean>(cases.ui.showAddModal);

	const plausibleDomain = env.PUBLIC_PLAUSIBLE_DOMAIN ?? '';
	const showPlausible = $derived<boolean>(!!userCtx.ctx?.demo_mode && !!plausibleDomain);

	$effect.pre(() => {
		app.init();
		dismissedBanners.hydrate();

		cases.load({ case_ids: [cases.currentCaseId()] });
		void userCtx.load();
		void caseTemplates.load();
	});
</script>

<!--
  `<svelte:head>` has to sit at the top level of the component — it cannot
  be nested inside an element or a block — so the demo-mode condition goes
  inside the tag rather than around it.
-->
<svelte:head>
	{#if showPlausible}
		<script defer data-domain={plausibleDomain} src="https://analytics.dfir-iris.org/js/plausible.js"></script>
	{/if}
</svelte:head>

<div class="flex h-screen w-full overflow-hidden bg-background">
	<SideBar />

	<main class="relative flex min-w-0 grow flex-col">
		<!--
		  TopBar sits at the top of <main> in normal flow. We give it
		  `shrink-0` so flex never compresses it below its 56px height,
		  and `z-30` so it paints above the page scroll container's
		  stacking context below (the page container creates one via
		  `overflow-auto` + positioning; without an explicit z here,
		  sticky cards inside pages would punch through the TopBar).
		-->
		<div class="z-30 shrink-0">
			<TopBar />
		</div>

		<!--
		  Admin-managed top banners. Sits between the TopBar and the
		  page scroll viewport, so it's visible on every authenticated
		  route and never scrolls away with page content. Renders
		  nothing when no banner is active.
		-->
		<div class="z-20 shrink-0">
			<TopBanners />
		</div>

		<!--
		  `min-h-0` is load-bearing. The default `min-height: auto` on
		  a flex child resolves to its intrinsic content height — so a
		  long page would size this div to fit, push <main> past the
		  viewport, and the `overflow-auto` would never have anything
		  to clip (no scrollbar). With `min-h-0` the div can shrink
		  below its content height and `overflow-auto` finally
		  activates.

		  `relative z-0` parks the scroll container's stacking context
		  explicitly below the TopBar wrapper above. Sticky elements
		  inside this scroll viewport (filter cards on activities /
		  manage-cases / dim-tasks) are safe to use `top-0` without
		  punching through the TopBar mid-scroll, because the TopBar
		  is anchored to <main> (which never scrolls) rather than to
		  the scroll viewport itself.
		-->
		<div class="relative z-0 flex min-h-0 min-w-0 grow flex-col overflow-auto bg-background">
			{@render children()}
		</div>
	</main>
</div>

<CaseAddModal
	open={showCaseAdd}
	onOpenChange={(openState) => (cases.ui.showAddModal = openState)}
/>

<!--
  Global chatbot panel. Mounted here (not in the case layout) so
  open/closed state and the current conversation survive navigation
  between cases, alerts, war rooms, and the dashboard. Hidden entirely
  when the backend chatbot isn't enabled — the panel component itself
  is inert without a mounted context, but skipping the render saves the
  Sheet's overlay wiring on every route.
-->
{#if chatbotEnabled}
	<ChatBotPanel />
{/if}
