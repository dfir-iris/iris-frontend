<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { SideBar } from '$lib/components/navigation/SideBar';
	import TopBar from '$lib/components/navigation/TopBar/TopBar.svelte';
	import { CaseAddModal } from './[components]/CaseModals';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	let { children }: { children: Snippet } = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const showCaseAdd = $derived<boolean>(cases.ui.showAddModal);
</script>

<div class="flex h-screen w-full overflow-hidden dark:bg-background">
	<SideBar />

	<main class="flex min-w-0 grow flex-col">
		<TopBar />

		<div class="flex min-w-0 grow overflow-auto">
			{@render children()}
		</div>
	</main>
</div>

<CaseAddModal
	open={showCaseAdd}
	onOpenChange={(openState) => (cases.ui.showAddModal = openState)}
/>
