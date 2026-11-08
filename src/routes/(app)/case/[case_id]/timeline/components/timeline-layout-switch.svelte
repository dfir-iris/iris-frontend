<!--
  Cards / Search switch of the timeline page. The host records the
  choice as the user's preferred view.
-->
<script lang="ts">
	import { LayoutListIcon, TextSearchIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { TimelineLayout } from '$lib/utils/timeline-default-view';

	type Props = {
		layout: TimelineLayout;
		onChange: (layout: TimelineLayout) => void;
	};

	let { layout, onChange }: Props = $props();

	const OPTIONS: { value: TimelineLayout; label: string; icon: typeof LayoutListIcon }[] = [
		{ value: 'cards', label: 'Cards', icon: LayoutListIcon },
		{ value: 'search', label: 'Search', icon: TextSearchIcon }
	];
</script>

<div
	class="flex items-center overflow-hidden rounded-md border border-border"
	role="radiogroup"
	aria-label="Timeline view"
>
	{#each OPTIONS as option (option.value)}
		<Button
			variant={layout === option.value ? 'secondary' : 'ghost'}
			size="sm"
			class="h-7 gap-1.5 rounded-none px-2.5 text-xs"
			role="radio"
			aria-checked={layout === option.value}
			onclick={() => {
				if (layout !== option.value) onChange(option.value);
			}}
		>
			<option.icon class="size-3.5" />
			{option.label}
		</Button>
	{/each}
</div>
