<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils.js';

	/**
	 * CISA Known Exploited Vulnerabilities marker. Renders nothing when
	 * `kev` is false so callers can drop it in unconditionally.
	 */
	let {
		kev = true,
		ransomware = false,
		dueDate = null,
		class: className = ''
	}: {
		kev?: boolean;
		ransomware?: boolean;
		dueDate?: string | null;
		class?: string;
	} = $props();

	const tooltip = $derived(
		[
			'Listed in CISA Known Exploited Vulnerabilities',
			ransomware ? 'known ransomware use' : null,
			dueDate ? `due ${dueDate}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

{#if kev}
	<Badge
		{tooltip}
		class={cn(
			'whitespace-nowrap border-transparent bg-red-700 text-red-50 hover:bg-red-600',
			className
		)}
	>
		KEV{ransomware ? ' · ransomware' : ''}
	</Badge>
{/if}
