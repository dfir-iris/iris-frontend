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

<Card.Footer class="flex flex-col items-start gap-2">
	<div class="flex items-center gap-6">
		{#if alert.resolution_status}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger class="cursor-default">
						<div class="rounded-full bg-orange-300 px-2 py-1 text-2xs text-black">
							{alert.resolution_status.resolution_status_name}
						</div>
					</TooltipTrigger>

					<TooltipContent>
						<p class="text-xs">Alert resolution status</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}

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
	</div>

	{#if alert.alert_tags}
		<div class="flex items-center gap-2">
			{#each alert.alert_tags.split(/,/).map((tag) => tag.trim()) as tag}
				<div class="rounded-full bg-gray-200 px-2 py-1 text-2xs text-black">
					{tag}
				</div>
			{/each}
		</div>
	{/if}
</Card.Footer>
