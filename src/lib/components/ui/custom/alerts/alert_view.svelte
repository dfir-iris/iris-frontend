<script lang="ts">
	import * as Icons from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';

	export let alert: any;

	let statuses = ['Pending', 'In progress', 'Completed', 'Unspecified', 'New'];
	let _status = alert.status.status_name;

	function setStatus(newStatus: string) {
		_status = newStatus;
	}

</script>

<div class="flex flex-col">
	{#if alert}
		<ScrollArea class="flex-1">
			<div class="h-full">
				<div class="overflow-hidden border-none">
					<div class="mb-1 flex items-center p-2">
						<div class="flex gap-2">
							<SeverityBadge severity={alert.severity.severity_name} />
							<Separator orientation="vertical" class="mx-1 h-6" />
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									<StatusBadge status={alert.status.status_name as import('$lib/components/ui/badge/types').CaseStatus} />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content>
									{#each statuses as value}
										<DropdownMenu.Item onclick={() => setStatus(value)}>
											<StatusBadge status={value as import('$lib/components/ui/badge/types').CaseStatus} />
										</DropdownMenu.Item>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
						<div class="ml-auto flex items-center gap-2">
							<Button size="sm" variant="outline" class="h-8 gap-1">
								<Icons.User class="h-3.5 w-3.5" />
								<span class="lg:sr-only xl:not-sr-only xl:whitespace-nowrap">
									{#if !alert.owner?.user_name}
										Assign
									{:else}
										Change assignee
									{/if}
								</span>
							</Button>
							<Button size="sm" variant="outline" class="h-8 gap-1">
								<Icons.Merge class="h-3.5 w-3.5" />
								<span class="lg:sr-only xl:not-sr-only xl:whitespace-nowrap"> Merge </span>
							</Button>
							<Button size="sm" variant="outline" class="h-8 gap-1">
								<Icons.Shield class="h-3.5 w-3.5" />
								<span class="lg:sr-only xl:not-sr-only xl:whitespace-nowrap"> Close </span>
							</Button>
							<Separator orientation="vertical" class="mx-2 h-6" />
							<Button size="sm" variant="outline" class="h-8 gap-1">
								<Icons.Share class="h-3.5 w-3.5" />
								<span class="lg:sr-only xl:not-sr-only xl:whitespace-nowrap"> Share </span>
							</Button>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									<Button size="icon" variant="outline" class="h-8 w-8">
										<Icons.EllipsisVertical class="h-3.5 w-3.5" />
										<span class="sr-only">More</span>
									</Button>
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item>Edit</DropdownMenu.Item>
									<DropdownMenu.Item>Export</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item>Delete</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					</div>
					<div class="bg-muted/50 p-4">
						<div class="grid gap-0.5">
							<div class="group flex items-center gap-2 text-lg font-semibold">
								{alert.alert_title}
								<Button
									size="icon"
									variant="outline"
									class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<Icons.Copy class="h-3 w-3" />
									<span class="sr-only">Copy Title</span>
								</Button>
							</div>
							<span class="text-sm italic text-slate-400">
								#{alert.alert_id} - {alert.alert_uuid}
								<Button
									size="icon"
									variant="outline"
									class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<Icons.Copy class="h-3 w-3" />
									<span class="sr-only">Copy Alert ID</span>
								</Button>
							</span>

							<div class="mt-4 flex items-center gap-2 text-sm">
								<Tooltip.Provider>
									<Tooltip.Root delayDuration={0}>
										<Tooltip.Trigger class="flex items-center gap-1">
											<Icons.AlarmClock size="16" />
											<span>{new Date(alert.alert_source_event_time).toLocaleString()}</span>
										</Tooltip.Trigger>
										<Tooltip.Content>Alert source event date</Tooltip.Content>
									</Tooltip.Root>
									<span class="mx-2">|</span>
									<Tooltip.Root delayDuration={0}>
										<Tooltip.Trigger class="flex items-center gap-1">
											<Icons.Calendar size="16" />
											<span>{new Date(alert.alert_creation_time).toLocaleString()}</span>
										</Tooltip.Trigger>
										<Tooltip.Content>Alert creation date</Tooltip.Content>
									</Tooltip.Root>
								</Tooltip.Provider>
							</div>
						</div>
					</div>
					<div class="p-6 text-sm">
						<div class="grid gap-3">
							<div class="font-semibold">Description</div>
							<ul class="grid gap-3">
								<li class="flex items-center">
									<span>{alert.alert_description}</span>
								</li>
							</ul>
							<Separator class="my-2" />
							<div class="font-semibold">General Information</div>
							<ul class="grid gap-1">
								<li class="flex items-center justify-between">
									<span class="text-muted-foreground">Source</span>
									<span>{alert.alert_source}</span>
								</li>
								<li class="flex items-center justify-between">
									<span class="text-muted-foreground">Source link</span>
									<span>{alert.alert_source_link}</span>
								</li>
								<li class="flex items-center justify-between">
									<span class="text-muted-foreground">Source Reference</span>
									<span>{alert.alert_source_reference}</span>
								</li>
							</ul>
							<Separator class="my-2" />
							<div class="font-semibold">Note</div>
							{#if alert.alert_note}
								{alert.alert_note}
							{:else}
								<i class="text-muted-foreground">No note</i>
							{/if}
							<Separator class="my-2" />
							<div class="font-semibold">Assets</div>
							<ul class="grid gap-3">
								{#each alert.assets as asset}
									<li class="flex items-center justify-between">
										<span class="text-muted-foreground">{asset.asset_name}</span>
										<span>{asset.asset_description}</span>
									</li>
								{/each}
							</ul>
							<Separator class="my-2" />
							<div class="font-semibold">IOCs</div>
							<ul class="grid gap-3">
								{#each alert.iocs as ioc}
									<li class="flex items-center justify-between">
										<span class="text-muted-foreground">{ioc.ioc_value}</span>
										<span>{ioc.ioc_description}</span>
									</li>
								{/each}
							</ul>
							<Separator class="my-2" />
							<div class="font-semibold">Comments</div>
							<ul class="grid gap-3">
								{#each alert.comments as comment}
									<li class="flex items-center justify-between">
										<span class="text-muted-foreground">Comment ID</span>
										<span>{comment}</span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
					<div class="flex flex-row items-center border-t bg-muted/50 px-6 py-3">
						<div class="text-xs text-muted-foreground">
							Updated <time dateTime={new Date(alert.alert_creation_time).toISOString()}
								>{new Date(alert.alert_creation_time).toLocaleString()}</time
							>
						</div>
						<div class="ml-auto flex items-center gap-2">
							<Textarea class="p-4" placeholder={`Reply to ${alert.customer.customer_name}...`} />
							<Button size="sm" class="ml-auto">Send</Button>
						</div>
					</div>
				</div>
			</div>
		</ScrollArea>
	{:else}
		<div class="p-8 text-center text-muted-foreground">No alert selected</div>
	{/if}
</div>
