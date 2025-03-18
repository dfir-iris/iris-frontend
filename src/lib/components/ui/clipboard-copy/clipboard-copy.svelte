<script lang="ts">
	import { Copy, CheckCheck } from 'lucide-svelte';
	import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils';
	import { onDestroy } from 'svelte';

	// Props using runes mode
	const {
		value = '',
		tooltipText = 'Copy',
		copiedText = 'Copied!',
		size = 14,
		tooltipPosition = 'top',
		className = '',
		alwaysVisible = false,
		stopPropagation = true,
		disabled = false
	} = $props();

	// State
	let copied = $state(false);
	let timeoutId: ReturnType<typeof setTimeout>;

	// Copy function
	function copyToClipboard(e: MouseEvent) {
		if (disabled || !value) return;
		
		if (stopPropagation) {
			e.stopPropagation();
		}
		
		navigator.clipboard.writeText(value).then(() => {
			copied = true;
			
			// Clear any existing timeout
			if (timeoutId) clearTimeout(timeoutId);
			
			// Reset after 2 seconds
			timeoutId = setTimeout(() => {
				copied = false;
			}, 2000);
		}).catch(error => {
			console.error('Failed to copy:', error);
		});
	}

	// Clean up on destroy
	onDestroy(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
</script>

<TooltipProvider>
	<Tooltip delayDuration={100}>
		<TooltipTrigger>
			<button 
				class={cn(
					"inline-flex items-center justify-center rounded-sm p-0.5 hover:text-primary transition-all",
					alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
					disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
					className
				)}
				onclick={copyToClipboard}
				disabled={disabled}
				aria-label={tooltipText}
			>
				{#if copied}
					<CheckCheck size={size} />
				{:else}
					<Copy size={size} />
				{/if}
			</button>
		</TooltipTrigger>
		<TooltipContent side={tooltipPosition}>
			<p class="text-xs">{copied ? copiedText : tooltipText}</p>
		</TooltipContent>
	</Tooltip>
</TooltipProvider>