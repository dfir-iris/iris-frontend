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
		CircleAlert,
		XCircleIcon
	} from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { CaseStatus } from './types';

	export let icon_only: boolean = false;
	export let status: CaseStatus;
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
			color:
				'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-700/30 dark:text-orange-400 dark:hover:bg-orange-700/40',
			icon: CircleAlert
		},
		Cancelled: {
			color:
				'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700/30 dark:text-red-400 dark:hover:bg-red-700/40',
			icon: XCircleIcon
		},
		Canceled: {
			color:
				'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700/30 dark:text-red-400 dark:hover:bg-red-700/40',
			icon: XCircleIcon
		}
	};

	$: config = statusConfig[status] || statusConfig.Unspecified;
</script>

{#if icon_only}
	<Tooltip.Provider>
		<Tooltip.Root>
			<Tooltip.Trigger class="flex">
				<Badge
					class="{config.color}  border-0 bg-transparent p-1 hover:bg-muted/50"
					icon={config.icon}
					variant="outline"
				></Badge>
			</Tooltip.Trigger>
			<Tooltip.Content>{prefix} {status}</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	<Badge
		class="items-center gap-1 {config.color} border-0 bg-transparent p-1 hover:bg-muted/50"
		icon={config.icon}
		variant="outline"
	>
		{status}
	</Badge>
{/if}
