<script lang="ts">
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';

	export let icon;
	export let action;
	export let tooltip;
</script>

<button onclick={action} class="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white">
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger>
				<svelte:component this={icon} size="16" />
			</TooltipTrigger>

			<TooltipContent align="center" side="top">{tooltip}</TooltipContent>
		</Tooltip>
	</TooltipProvider>
</button>
