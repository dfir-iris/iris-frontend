<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import {
		Clock,
		Play,
		CheckCircle,
		HelpCircle,
		Circle,
		MergeIcon,
		Handshake,
		BadgeAlert,

		CircleAlert

	} from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export let icon_only: boolean = false;
	export let status:
		| 'Pending'
		| 'In progress'
		| 'Completed'
		| 'Unspecified'
		| 'To do'
		| 'Closed'
		| 'Merged'
		| 'Assigned'
		| 'New'
		| 'Started'
		| 'Cancelled'
		| 'Done' = 'Unspecified';

		export let prefix: string = '';

	const statusConfig = {
		Pending: {
			color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
			icon: Clock
		},
		'In progress': {
			color: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
			icon: Play
		},
		Completed: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: CheckCircle
		},
		Closed: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: CheckCircle
		},
		Done: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: CheckCircle
		},
		Merged: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: MergeIcon
		},
		Unspecified: {
			color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
			icon: HelpCircle
		},
		Assigned: {
			color: 'bg-green-100 text-green-800 hover:bg-green-200',
			icon: Handshake
		},
		New: {
			color: 'bg-red-100 text-red-800 hover:bg-red-200',
			icon: BadgeAlert
		},
		Started: {
			color: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
			icon: Play
		},
		'To do': {
			color: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
			icon: Circle
		},
		'To be done': {
			color: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
			icon: CircleAlert
		},
		Canceled: {
			color: 'bg-red-100 text-red-800 hover:bg-red-200',
			icon: BadgeAlert
		}
	};

	$: config = statusConfig[status] || statusConfig.Unspecified;
</script>

{#if icon_only}
	<Tooltip.Provider>
		<Tooltip.Root>
			<Tooltip.Trigger class="flex">
				<Badge class="{config.color}" icon={config.icon}></Badge>
			</Tooltip.Trigger>
			<Tooltip.Content>{prefix} {status}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	<Badge class="items-center gap-1 {config.color}" icon={config.icon}>
		{status}
	</Badge>
{/if}
