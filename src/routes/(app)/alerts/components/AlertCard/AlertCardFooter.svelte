<script lang="ts">
	import {
		CalendarIcon,
		CloudDownloadIcon,
		EyeIcon,
		LinkIcon,
		ShieldAlertIcon,
		ShieldIcon,
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

<Card.Footer class="flex flex-col items-start gap-2 !px-4 !py-3">
	<!--
	  AlertCluster linkage row — sits above the cases row on purpose. In
	  the analyst workflow "which alert cluster owns this alert" is the
	  more triage-critical question than "which case does it belong
	  to" (cases only appear after escalation). Rendering it first
	  puts it where the eye lands.
	-->
	{#if alert.clusters?.length}
		<div class="flex flex-wrap items-center gap-2">
			{#each alert.clusters as alertClusterId (alertClusterId)}
				<a
					href={`/alert-clusters/${alertClusterId}`}
					class="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-2xs font-medium text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-300"
					title={`Part of alert cluster #${alertClusterId}`}
				>
					<ShieldIcon size="12" />
					AlertCluster #{alertClusterId}
				</a>
			{/each}
		</div>
	{/if}

	{#if alert.cases}
		<div class="flex flex-wrap items-center gap-3">
			{#each alert.cases as linkedCase}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<div class="flex items-center gap-1 text-sm transition-all hover:opacity-50">
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

	<div class="flex flex-wrap items-center gap-3">
		{#if alert.resolution_status}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger class="cursor-default">
						<div
							class="rounded-full bg-orange-100 px-2.5 py-0.5 text-2xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
						>
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
					<div class="rounded-full bg-muted px-2.5 py-0.5 text-2xs font-medium text-foreground">
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
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<CalendarIcon size="12" />

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
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<ZapIcon size="12" />

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
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<CloudDownloadIcon size="12" />

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
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<UserCircleIcon size="12" />

						{alert.customer.customer_name}
					</div>
				</TooltipTrigger>

				<TooltipContent>
					<p class="text-xs">Alert client</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		{#if alert.classification?.name}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger class="cursor-default">
						<div
							class="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-2xs font-medium text-foreground"
						>
							<ShieldAlertIcon size="12" />

							{alert.classification.name}
						</div>
					</TooltipTrigger>

					<TooltipContent>
						<p class="text-xs">Alert classification</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}
	</div>

	{#if alert.alert_tags}
		<div class="flex items-center gap-2">
			{#each alert.alert_tags.split(/,/).map((tag) => tag.trim()) as tag}
				<div class="rounded-full bg-muted px-2.5 py-0.5 text-2xs font-medium text-muted-foreground">
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
