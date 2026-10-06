<script lang="ts">
	import { Flame } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';
	import type { AssetVulnCounts } from './asset-vuln-counts';
	import { SEVERITY_CLASSES, SEVERITY_LABELS } from './labels';

	let { counts, href = null }: { counts: AssetVulnCounts | undefined; href?: string | null } =
		$props();

	const title = $derived(
		counts
			? `${counts.open} open (worst: ${SEVERITY_LABELS[counts.severity]})${
					counts.exploitedOpen ? `, ${counts.exploitedOpen} exploited` : ''
				}`
			: 'No open vulnerability'
	);
</script>

{#if counts}
	<a
		{href}
		{title}
		class={cn(
			'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
			SEVERITY_CLASSES[counts.severity]
		)}
	>
		{counts.open}
		{#if counts.exploitedOpen}
			<Flame class="size-3 text-red-600" aria-label="Exploited" />
		{/if}
	</a>
{:else}
	<span class="text-muted-foreground" {title}>—</span>
{/if}
