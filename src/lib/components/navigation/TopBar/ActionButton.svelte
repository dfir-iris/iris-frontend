<script lang="ts">
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';

	export let icon;
	export let action;
	export let tooltip;
</script>

<!--
  TooltipTrigger renders the <button> itself, so it carries the class and
  the click handler rather than being wrapped in one of ours. A <button>
  inside a <button> is not nesting the HTML parser accepts — it closes the
  outer one and emits two siblings, which desyncs Svelte's hydration walker
  and costs the whole page its SSR output.
-->
<TooltipProvider>
	<Tooltip>
		<TooltipTrigger
			onclick={action}
			class="rounded-lg p-2 text-white/80 backdrop-blur-md transition-all duration-150 hover:bg-white/15 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
		>
			<svelte:component this={icon} size="16" />
		</TooltipTrigger>

		<TooltipContent align="center" side="top">{tooltip}</TooltipContent>
	</Tooltip>
</TooltipProvider>
