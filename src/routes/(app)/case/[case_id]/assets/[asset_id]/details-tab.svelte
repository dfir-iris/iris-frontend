<script lang="ts">
	import { TabsContent } from '$lib/components/ui/tabs';
	import type { Asset } from '$lib/types/resources/asset';

	let { asset }: { asset: Asset } = $props();
</script>

<TabsContent value="details">
	<div class="grid grid-cols-3 gap-y-2">
		<h2 class="col-span-3 my-4">General</h2>
		{@render field('ID', asset.asset_id)}
		{@render field('UUID', asset.asset_uuid)}
		{@render field('Type ID', asset.asset_type_id)}

		{@render field('Type', asset.asset_type?.asset_name, asset.asset_type?.asset_description)}
		{@render field('Description', asset.asset_description)}

		<h2 class="col-span-3 my-4">Networking</h2>
		{@render field('IP Address', asset.asset_ip || 'N/A')}
		{@render field('Domain Name', asset.asset_domain || 'N/A')}
	</div>
</TabsContent>

{#snippet field(label: string, value: string | number, hint: string | null = null)}
	<div>
		<p class="font-bold">{label}</p>
		<p>{value}</p>
		{#if hint}
			<p class="text-sm text-muted-foreground">{hint}</p>
		{/if}
	</div>
{/snippet}
