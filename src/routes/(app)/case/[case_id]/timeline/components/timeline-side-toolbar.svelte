<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		CheckCheckIcon,
		ListTreeIcon,
		PlusCircleIcon,
		RefreshCwIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		selecting: boolean;
		onToggleSelecting: () => void;
		onDelete: () => void;
		onAddEvent: () => void;
		onToggleFoldAll: () => void;
		onRefresh: () => void;
		onScrollTop: () => void;
		onScrollBottom: () => void;
	};

	let {
		selecting,
		onToggleSelecting,
		onDelete,
		onAddEvent,
		onToggleFoldAll,
		onRefresh,
		onScrollTop,
		onScrollBottom
	}: Props = $props();
</script>

<div class="fixed bottom-8 right-8 flex flex-col gap-3">
	{#if selecting}
		<Button variant="ghost" size="icon" class="text-red-500 hover:text-red-700" onclick={onDelete}
			><Trash2Icon /></Button
		>
	{/if}

	<Button
		variant="ghost"
		size="icon"
		class={selecting ? 'ring ring-amber-500' : ''}
		onclick={onToggleSelecting}><CheckCheckIcon /></Button
	>

	<Button variant="ghost" size="icon" onclick={onAddEvent}><PlusCircleIcon /></Button>
	<Button variant="ghost" size="icon" onclick={onToggleFoldAll}><ListTreeIcon /></Button>
	<Button variant="ghost" size="icon" onclick={onRefresh}><RefreshCwIcon /></Button>
	<Button variant="ghost" size="icon" onclick={onScrollTop}><ArrowUpIcon /></Button>
	<Button variant="ghost" size="icon" onclick={onScrollBottom}><ArrowDownIcon /></Button>
</div>
