<script lang="ts">
	export let checked: boolean = false;
	export let onToggle: () => void = () => {};
</script>

<input
	type="checkbox"
	class="size-4 cursor-pointer accent-primary"
	{checked}
	onclick={(e) => {
		e.stopPropagation();
		onToggle();
	}}
	onchange={() => {}}
/>
