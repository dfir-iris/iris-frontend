<script lang="ts">
	import {
		CalendarIcon,
		CloudDownloadIcon,
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
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	let {
		alert
	}: {
		alert: Alert;
	} = $props();
</script>

<Card.Footer class="flex items-center gap-6">
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger class="cursor-default">
				<div class="rounded-full bg-gray-200 px-2 py-1 text-2xs text-black">
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
				<div class="flex gap-1 rounded-full bg-gray-200 px-2 py-1 text-2xs text-black">
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
