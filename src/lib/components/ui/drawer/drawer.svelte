<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';

	export let open = false;
	export let onOpenChange = (_value: boolean) => {};

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		onOpenChange(isOpen);
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange} {...$$restProps}>
	<slot />
</Dialog.Root>
