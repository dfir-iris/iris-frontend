<script lang="ts">
	export let href: string;
	export let id: number;
	export let value: string;
</script>

<a {href} class="block min-w-0 hover:opacity-80">
	<span class="block text-xs text-muted-foreground">IOC #{id}</span>
	<!-- Light mode keeps the brand `--primary` (deep blue) for the link
	     colour; in dark mode that's the same deep blue against a near-black
	     surface and disappears, so swap to blue-400 the same way the table
	     `LinkCell` does. -->
	<span
		class="block truncate font-mono font-semibold text-primary dark:text-blue-400"
		title={value}
	>
		{value}
	</span>
</a>
