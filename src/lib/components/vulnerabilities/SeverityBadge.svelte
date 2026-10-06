<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils.js';
	import type { VulnerabilitySeverity } from '$lib/services/vulnerabilities.service';
	import { SEVERITY_CLASSES, SEVERITY_LABELS, formatCvss } from './labels';

	let {
		severity,
		score = null,
		class: className = ''
	}: {
		severity: VulnerabilitySeverity | string | null | undefined;
		score?: number | null;
		class?: string;
	} = $props();

	const key = $derived(
		(severity && severity in SEVERITY_CLASSES ? severity : 'unknown') as VulnerabilitySeverity
	);
	const hasScore = $derived(score !== null && score !== undefined && !Number.isNaN(score));
</script>

<Badge class={cn('gap-1 whitespace-nowrap', SEVERITY_CLASSES[key], className)}>
	{SEVERITY_LABELS[key]}
	{#if hasScore}
		<span class="font-mono font-normal opacity-80">{formatCvss(score)}</span>
	{/if}
</Badge>
