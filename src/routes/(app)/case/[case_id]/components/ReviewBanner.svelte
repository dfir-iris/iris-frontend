<script lang="ts">
	import { ClipboardCheckIcon } from 'lucide-svelte';

	type Props = {
		statusName: string;
		onStartReview?: () => void;
		onConfirmReview?: () => void;
	};

	let { statusName, onStartReview, onConfirmReview }: Props = $props();
</script>

<div
	class="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-700/10 dark:text-amber-200"
	role="status"
>
	<ClipboardCheckIcon class="size-4 shrink-0" />
	<span class="flex-1">
		{#if statusName === 'Pending review'}
			You have been requested to review this case.
		{:else}
			Review in progress — confirm when done.
		{/if}
	</span>
	{#if statusName === 'Pending review' && onStartReview}
		<button
			onclick={onStartReview}
			class="rounded border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-800/30 dark:text-amber-100 dark:hover:bg-amber-700/40"
		>
			Start review
		</button>
	{/if}
	{#if statusName === 'Review in progress' && onConfirmReview}
		<button
			onclick={onConfirmReview}
			class="rounded border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-800/30 dark:text-amber-100 dark:hover:bg-amber-700/40"
		>
			Confirm review
		</button>
	{/if}
</div>
