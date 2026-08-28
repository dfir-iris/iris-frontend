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
		canEdit?: boolean;
	};

	let {
		selecting,
		onToggleSelecting,
		onDelete,
		onAddEvent,
		onToggleFoldAll,
		onRefresh,
		onScrollTop,
		onScrollBottom,
		canEdit = true
	}: Props = $props();
</script>

<!--
  Floating timeline action pill. Stays pinned to the bottom-right of the
  timeline pane (not the viewport) by being a sticky-positioned in-flow
  element. `-mt-16` pulls it up over the trailing whitespace; the outer
  pointer-events-none + inner pointer-events-auto lets clicks pass through
  the empty bar around the pill.
-->
<div class="pointer-events-none sticky bottom-3 z-20 -mt-12 flex justify-end pr-3">
	<div
		class="pointer-events-auto flex flex-col items-center gap-1 rounded-full border border-white/10 p-1 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:border-white/5 dark:ring-white/5"
	>
		{#if canEdit}
			{#if selecting}
				<Button
					variant="ghost"
					size="icon"
					class="size-8 text-red-500 hover:text-red-700"
					onclick={onDelete}><Trash2Icon class="size-4" /></Button
				>
			{/if}

			<Button
				variant="ghost"
				size="icon"
				class={`size-8 ${selecting ? 'ring ring-amber-500' : ''}`}
				onclick={onToggleSelecting}><CheckCheckIcon class="size-4" /></Button
			>

			<Button
				variant="ghost"
				size="icon"
				class="size-8 rounded-full bg-transparent text-muted-foreground/70 hover:bg-white/30 hover:text-foreground hover:backdrop-blur-sm dark:hover:bg-white/10"
				onclick={onAddEvent}
			>
				<PlusCircleIcon class="size-4" />
			</Button>
		{/if}
		<Button
			variant="ghost"
			size="icon"
			class="size-8 rounded-full bg-transparent text-muted-foreground/70 hover:bg-white/30 hover:text-foreground hover:backdrop-blur-sm dark:hover:bg-white/10"
			onclick={onToggleFoldAll}
		>
			<ListTreeIcon class="size-4" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-8 rounded-full bg-transparent text-muted-foreground/70 hover:bg-white/30 hover:text-foreground hover:backdrop-blur-sm dark:hover:bg-white/10"
			onclick={onRefresh}
		>
			<RefreshCwIcon class="size-4" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-8 rounded-full bg-transparent text-muted-foreground/70 hover:bg-white/30 hover:text-foreground hover:backdrop-blur-sm dark:hover:bg-white/10"
			onclick={onScrollTop}
		>
			<ArrowUpIcon class="size-4" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="size-8 rounded-full bg-transparent text-muted-foreground/70 hover:bg-white/30 hover:text-foreground hover:backdrop-blur-sm dark:hover:bg-white/10"
			onclick={onScrollBottom}
		>
			<ArrowDownIcon class="size-4" />
		</Button>
	</div>
</div>
