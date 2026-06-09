<script lang="ts">
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';

	export let icon;
	export let action;
	export let tooltip;
</script>

<button
	onclick={action}
	class="rounded-lg p-2 text-white/80 backdrop-blur-md transition-all duration-150 hover:bg-white/15 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
>
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger>
				<svelte:component this={icon} size="16" />
			</TooltipTrigger>

			<TooltipContent align="center" side="top">{tooltip}</TooltipContent>
		</Tooltip>
	</TooltipProvider>
</button>
