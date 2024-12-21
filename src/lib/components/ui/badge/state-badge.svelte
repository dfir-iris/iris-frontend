<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Lock, LockOpen, HelpCircle, Circle } from 'lucide-svelte';

	export let state: 'Open' | 'Closed' | 'Unspecified';

	const stateConfig = {
		Open: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: LockOpen
		},
		Closed: {
			color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
			icon: Lock
		},
		Unspecified: {
			color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
			icon: HelpCircle
		}
	};

	$: config = stateConfig[state] || stateConfig.Unspecified;
	$: state = state || 'Unspecified';
	$: Icon = config.icon;
</script>

<Badge class="items-center gap-1 {config.color}">
	<svelte:component this={Icon} class="h-3 w-3" />
	{state}
</Badge>
