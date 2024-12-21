<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { AlertCircle, AlertTriangle, ShieldAlert, CircleDot, HelpCircle } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type Severity = 'Unspecified' | 'Low' | 'Medium' | 'High' | 'Critical';
	export let severity: Severity | string;
	export let icon_only: boolean = false;

	const severityConfig = {
		Unspecified: {
			color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
			icon: HelpCircle
		},
		Low: {
			color: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
			icon: CircleDot
		},
		Medium: {
			color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
			icon: AlertCircle
		},
		High: {
			color: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
			icon: AlertTriangle
		},
		Critical: {
			color: 'bg-red-100 text-red-800 hover:bg-red-200',
			icon: ShieldAlert
		},
		Informational: {
			color: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
			icon: CircleDot
		}
	};

	$: config = severityConfig[severity] || severityConfig.Unspecified;
	$: Icon = config.icon;
</script>

{#if icon_only}
	<Tooltip.Root openDelay={0} group>
		<Tooltip.Trigger class="flex items-center gap-1">
			<Badge class="items-center gap-1 {config.color}">
				<svelte:component this={Icon} class="h-3 w-3" />
			</Badge>
		</Tooltip.Trigger>
		<Tooltip.Content>{severity} severity</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<Badge class="items-center gap-1 {config.color}">
		<svelte:component this={Icon} class="h-3 w-3" />
		{severity}
	</Badge>
{/if}
