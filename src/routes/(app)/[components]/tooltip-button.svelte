<script lang="ts">
	import {
		Tooltip,
		TooltipContent,
		TooltipTrigger,
		TooltipProvider
	} from '$lib/components/ui/tooltip';
	import Button from '$lib/components/ui/button/button.svelte';
	import { CopyIcon } from 'lucide-svelte';

	export let value: string | number;

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text.toString());
	}
</script>

<TooltipProvider>
	<Tooltip>
		<TooltipTrigger>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
				onclick={() => copyToClipboard(String(value))}
			>
				<CopyIcon class="h-3.5 w-3.5" />
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			<p class="text-xs">Copy to clipboard</p>
		</TooltipContent>
	</Tooltip>
</TooltipProvider>
