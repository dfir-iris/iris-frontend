<script lang="ts">
	import {
		CalendarIcon,
		CloudDownloadIcon,
		EyeIcon,
		LinkIcon,
		ShieldAlertIcon,
		UnlinkIcon,
		UserCircleIcon,
		ZapIcon
	} from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import type { Alert } from '$lib/types/resources/alert';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';

	let {
		alert,
		onUnlinkCase
	}: {
		alert: Alert;
		onUnlinkCase: (case_id: number) => void;
	} = $props();

	let showConfirmUnlink = $state(false);
	let unlinkCaseId = $state<number | null>(null);

	const hideUnlink = () => {
		unlinkCaseId = null;
		showConfirmUnlink = false;
	};

	const unlink = () => {
		onUnlinkCase(unlinkCaseId as number);
		hideUnlink();
	};
</script>

<Card.Footer class="flex flex-col items-start gap-2">
	{#if alert.cases}
		<div class="flex items-center gap-8">
			{#each alert.cases as linkedCase}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<div class="flex items-center gap-1 text-sm hover:opacity-50 transition-all">
							<LinkIcon size="16" /> #{linkedCase}
						</div>
					</DropdownMenuTrigger>

					<DropdownMenuContent>
						<DropdownMenuItem>
							<a class="flex items-center gap-1 text-sm" href={`/case/${linkedCase}`}>
								<EyeIcon size="16" /> View case #{linkedCase}
							</a>
						</DropdownMenuItem>

						<Separator />

						<DropdownMenuItem>
							<button
								class="flex items-center gap-1 text-sm text-red-500"
								onclick={() => {
									unlinkCaseId = linkedCase;
									showConfirmUnlink = true;
								}}
							>
								<UnlinkIcon size="16" /> Unlink alert from case #{linkedCase}
							</button>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{/each}
		</div>
	{/if}

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

<ConfirmationDialog
	bind:open={showConfirmUnlink}
	title="Are you sure?"
	message={`Unlink alert #${alert.alert_id} from case #${unlinkCaseId}`}
	onConfirm={unlink}
	onCancel={hideUnlink}
/>
