<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export let params;

	$: title = params?.title ?? '';
	$: redirUrl = params?.redirUrl ?? '';

	// Handle button click for navigation
	function handleClick() {
		if (redirUrl) {
			goto(redirUrl);
		} else {
			console.error('Invalid element provided:', redirUrl);
		}
	}

	export function refresh(props: any): boolean {
		return false;
	}
</script>

<div class="flex items-center">
	<Tooltip.Root openDelay={300}>
		<Tooltip.Trigger>
			<Button variant="dotted" size="sm" on:click={handleClick}>
				{title}
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>Click to view details</Tooltip.Content>
	</Tooltip.Root>
</div>
