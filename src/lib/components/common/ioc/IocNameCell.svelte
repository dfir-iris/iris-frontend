<script lang="ts">
	export let href: string;
	export let id: number;
	export let value: string;
</script>

<a {href} class="block min-w-0 hover:opacity-80">
	<span class="block text-xs text-muted-foreground">IOC #{id}</span>
	<span class="block truncate font-mono font-semibold text-primary" title={value}>{value}</span>
</a>
