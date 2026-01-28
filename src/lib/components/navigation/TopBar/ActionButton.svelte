<script lang="ts">
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';

	export let icon;
	export let action;
	export let tooltip;
</script>

<button onclick={action} class="rounded-lg px-2 pt-1 hover:bg-white/30">
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger>
				<svelte:component this={icon} size="16" />
			</TooltipTrigger>

			<TooltipContent align="center" side="top">{tooltip}</TooltipContent>
		</Tooltip>
	</TooltipProvider>
</button>
