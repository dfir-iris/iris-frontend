<script lang="ts">
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { cn } from '$lib/utils';

	let {
		tlp_name
	}: {
		tlp_name: string;
	} = $props();

	// TLP Color Classes.
	//
	// The `-600` text shades are tuned for the light theme; on the dark
	// background a 10%-opacity tint plus `text-*-600` lands around 3:1,
	// which is what made TLP:WHITE look washed out. One step lighter
	// (`-400`) clears 4.5:1 for every colour in the set.
	function getTLPColorClasses(tlpName: string | undefined) {
		if (!tlpName) return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
		switch (tlpName.toLowerCase()) {
			case 'red':
				return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
			case 'amber':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'amber+strict':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'green':
				return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
			case 'white':
				return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
			default:
				return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
		}
	}
</script>

<Badge
	variant="outline"
	class={cn(
		'h-auto whitespace-nowrap border px-1.5 py-0.5 text-xs capitalize',
		getTLPColorClasses(tlp_name)
	)}
	title={`TLP: ${tlp_name?.toUpperCase()}`}
>
	TLP:{tlp_name}
</Badge>
