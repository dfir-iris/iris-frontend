<script lang="ts">
	import {
		CalendarIcon,
		CloudDownloadIcon,
		EllipsisVerticalIcon,
		FlameIcon,
		HandIcon,
		MessagesSquareIcon,
		PencilIcon,
		ShieldAlertIcon,
		UserCircleIcon,
		ZapIcon
	} from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import type { Alert } from '$lib/types/resources/alert';
	import { getInitials } from '$lib/utils';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	let {
		alert,
		expanded = false,
		onExpandedChange
	}: {
		alert: Alert;
		expanded?: boolean;
		onExpandedChange: (v: boolean) => void;
	} = $props();

	const getBackgroundBySeverity = (severity: string): string => {
		switch (severity.toLowerCase()) {
			case 'informational':
				return 'bg-blue-600';
			case 'medium':
				return 'bg-orange-500';
			case 'high':
				return 'bg-red-500';
			default:
				return 'bg-gray-500';
		}
	};
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<div class="flex w-full items-center gap-4">
			<div class="relative flex h-12 w-14">
				<button
					class={`absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full text-white hover:z-50 ${getBackgroundBySeverity(alert.severity.severity_name)}`}
					title="Assign to me"
				>
					<FlameIcon size="32" />
				</button>

				<button
					class={`absolute left-6 top-4 z-0 flex h-10 w-10 items-center justify-center rounded-full text-xl text-white ${alert.owner ? 'bg-blue-300' : 'bg-orange-800'}`}
					title="Reasign alert"
				>
					{#if alert.owner}
						{getInitials(alert.owner.user_name ?? '')}
					{:else}
						<HandIcon size="20" />
					{/if}
				</button>
			</div>

			<button
				class="flex grow cursor-pointer flex-col items-start"
				onclick={() => onExpandedChange(!expanded)}
			>
				<h3 class="text-lg font-bold">{alert.alert_title}</h3>
				<h4 class="text-sm italic opacity-85">#{alert.alert_id} - {alert.alert_uuid}</h4>
			</button>

			<div class="flex gap-4">
				<button title="comments">
					<MessagesSquareIcon size="16" />
				</button>

				<button title="edit">
					<PencilIcon size="16" />
				</button>

				<button title="menu">
					<EllipsisVerticalIcon size="16" />
				</button>
			</div>
		</div>
	</Card.Header>

	<Card.Content>
		{alert.alert_description}

		<div class={`transition-all ${expanded ? 'h-96' : 'h-0'}`}></div>
	</Card.Content>

	<Card.Footer class="flex items-center gap-6">
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="rounded-full bg-gray-200 px-2 py-1 text-2xs">
						{alert.status.status_name}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert status</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="flex items-center gap-1 text-xs opacity-50">
						<CalendarIcon size="14" />

						{mediumDateTimeFormatter(new Date(alert.alert_source_event_time))}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert source event UTC time</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="flex items-center gap-1 text-xs opacity-50">
						<ZapIcon size="14" />

						{alert.severity.severity_name}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert severity</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="flex items-center gap-1 text-xs opacity-50">
						<CloudDownloadIcon size="14" />

						{alert.alert_source}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert source</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="flex items-center gap-1 text-xs opacity-50">
						<UserCircleIcon size="14" />

						{alert.customer.customer_name}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert client</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger class="cursor-default">
					<div class="flex gap-1 rounded-full bg-gray-200 px-2 py-1 text-2xs">
						<ShieldAlertIcon size="14" />

						{alert.classification.name}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert classification</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	</Card.Footer>
</Card.Root>
