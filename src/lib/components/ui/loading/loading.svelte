<script lang="ts">
	import { Icons } from '../icons';

	let {
		size
	}: {
		size?: number | undefined;
	} = $props();
</script>

<Icons.spinner {size} class="animate-spin" />
