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

	export function refresh(_props: any): boolean {
		return false;
	}
</script>

<div class="flex items-center">
	<Tooltip.Provider>
		<Tooltip.Root delayDuration={300}>
			<Tooltip.Trigger>
				<Button variant="dotted" size="sm" onclick={handleClick}>
					{title}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>Click to view details</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
</div>
