<script lang="ts">
	import type { Icon } from 'lucide-svelte';
	import { Button } from '../ui/button';
	import { Badge } from '../ui/badge';
	import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
	import { page } from '$app/state';

	// Properties
	interface Props {
		label: string;
		href?: string;
		icon?: typeof Icon;
		collapsed?: boolean;
		counter?: number | null;
	}
	let { label, href, icon: BtnIcon, collapsed = false, counter = null }: Props = $props();

	// Handle if route is active
	let active = $state(false);
	$effect.pre(() => {
		active = page.url.pathname.endsWith(href);
	});
</script>

<!-- Sidenav item itself -->
<Button variant={active ? 'default' : 'ghost'} {href} class="justify-start overflow-clip px-2">
	<Tooltip>
		<TooltipTrigger asChild>
			<BtnIcon class="mr-2 !h-6 !w-6 !stroke-[1.75]" />
		</TooltipTrigger>
		<!-- Tooltip -->
		<TooltipContent align="center" side="top"><p>{label}</p></TooltipContent>
	</Tooltip>
	<span class="w-full">{label}</span>

	<!-- Display counter badge if set -->
	{#if counter !== null}
		<Badge variant="secondary">{counter}</Badge>
	{/if}
</Button>
