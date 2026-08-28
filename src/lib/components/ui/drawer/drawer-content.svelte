<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	export let side: 'top' | 'bottom' | 'left' | 'right' = 'right';

	const sideMap = {
		top: 'animate-in slide-in-from-top w-full duration-300 ease-in-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top',
		bottom:
			'animate-in slide-in-from-bottom w-full duration-300 ease-in-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
		left: 'animate-in slide-in-from-left h-full duration-300 ease-in-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
		right:
			'animate-in slide-in-from-right h-full duration-300 ease-in-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right'
	};

	let className = '';
	export { className as class };
</script>

<Dialog.Portal>
	<Dialog.Overlay />
	<Dialog.Content
		class={cn(
			'fixed z-50 gap-4 bg-background p-6 shadow-lg',
			side === 'top' && 'inset-x-0 top-0 border-b',
			side === 'bottom' && 'inset-x-0 bottom-0 border-t',
			side === 'left' && 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
			side === 'right' && 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
			sideMap[side],
			className
		)}
		{...$$restProps}
	>
		{#if side === 'bottom' || side === 'top'}
			<div class="mx-auto my-1 h-1.5 w-16 rounded-full bg-muted"></div>
		{/if}
		<slot />
	</Dialog.Content>
</Dialog.Portal>
