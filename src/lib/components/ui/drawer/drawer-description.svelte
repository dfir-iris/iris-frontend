<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	let className = '';
	export { className as class };
</script>

<Dialog.Description class={cn('text-sm text-muted-foreground', className)} {...$$restProps}>
	<slot />
</Dialog.Description>
