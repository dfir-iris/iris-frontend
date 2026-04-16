<script lang="ts">
	import {
		ChevronDownIcon,
		EllipsisVerticalIcon,
		FileSymlinkIcon,
		FlameIcon,
		ForwardIcon,
		HandIcon,
		HistoryIcon,
		MessagesSquareIcon,
		PencilIcon,
		TrashIcon
	} from 'lucide-svelte';
	import { Collapsible } from 'bits-ui';
	import { page } from '$app/state';
	import type { Alert } from '$lib/types/resources/alert';
	import { toast } from '$lib/stores/toast.store';
	import { getInitials } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import AlertCardFooter from './AlertCardFooter.svelte';
	import AlertCardDetails from './AlertCardDetails.svelte';
	import type { AlertStatus } from '$lib/services/alert-status.service';

	let {
		alert,
		alertStatuses,
		expanded = $bindable(),
		alwaysExpanded = false,
		onExpandedChange,
		onAssign,
		onAssignToCurrentUser,
		onSetStatus,
		onShowEdit,
		onShowHistory,
		onShowComments,
		onShowMerge,
		onShowClose,
		onUnlinkCase,
		onDelete
	}: {
		alert: Alert;
		alertStatuses: AlertStatus[];
		expanded?: boolean;
		alwaysExpanded?: boolean;
		onExpandedChange?: (v: boolean) => void;
		onAssign: () => void;
		onAssignToCurrentUser: () => void;
		onSetStatus: (status_id: number) => void;
		onShowEdit: () => void;
		onShowHistory: () => void;
		onShowComments: () => void;
		onShowMerge: () => void;
		onShowClose: (withNote: boolean) => void;
		onUnlinkCase: (case_id: number) => void;
		onDelete: () => void;
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
				return 'bg-muted-foreground';
		}
	};

	let isAssignMenuOpen = $state(false);
	let isSetStatusMenuOpen = $state(false);
	let isMenuOpen = $state(false);
	let detailsLoaded = $state(alwaysExpanded || expanded);

	$effect(() => {
		if (alwaysExpanded || expanded) {
			detailsLoaded = true;
		}
	});

	const showHeaderActions = $derived(
		isAssignMenuOpen || isSetStatusMenuOpen || isMenuOpen || alwaysExpanded
	);

	const isProcessed = $derived(() => {
		const name = alert.status?.status_name?.toLowerCase().trim() ?? '';
		return name !== 'new' && name !== 'unspecified';
	});

	const isFocused = $derived(alwaysExpanded || expanded);

	const getAlertUrl = () => {
		const url = new URL(page.url);
		return `${url.origin}${url.pathname}/${alert.alert_id}`;
	};
</script>

<Card.Root
	class={`group min-w-0 flex grow overflow-hidden transition-shadow duration-300 ${isFocused ? 'ring-1 ring-iris-blue/30 shadow-glow-blue' : ''} ${isProcessed() ? 'opacity-60 border-border/40' : ''}`}
>
	<Collapsible.Root
		open={alwaysExpanded ? true : expanded}
		onOpenChange={alwaysExpanded ? undefined : onExpandedChange}
		disabled={alwaysExpanded}
	>
		<Card.Header class="!flex !flex-col !gap-3 !space-y-0 !p-4 !pb-2 sm:!flex-row sm:!items-center sm:!justify-between">
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<div class="relative flex h-10 w-12 shrink-0">
					<Collapsible.Trigger>
						<button
							class={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-white ${alwaysExpanded ? 'cursor-default' : 'hover:z-50 hover:brightness-110'} ${getBackgroundBySeverity(alert.severity.severity_name)}`}
						>
							<FlameIcon size="20" />
						</button>
					</Collapsible.Trigger>

					<button
						class={`absolute left-5 top-3 z-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${alert.owner ? 'bg-blue-400' : 'bg-orange-700'}`}
						title="Reasign alert"
						onclick={onAssign}
					>
						{#if alert.owner}
							{getInitials(alert.owner.user_name ?? '')}
						{:else}
							<HandIcon size="20" />
						{/if}
					</button>
				</div>

				<Collapsible.Trigger
					class={`min-w-0 flex-1 text-left transition-colors ${alwaysExpanded ? '' : 'cursor-pointer hover:text-primary'}`}
				>
					<h3 class="text-sm font-semibold sm:truncate">{alert.alert_title}</h3>
					<p class="truncate text-xs text-muted-foreground">
						#{alert.alert_id} - {alert.alert_uuid}
					</p>
				</Collapsible.Trigger>
			</div>

			<div class="flex min-w-0 flex-wrap items-center gap-3 sm:gap-6">
				<div
					class={`hidden flex-wrap items-center gap-2 transition-opacity sm:flex ${showHeaderActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
				>
					<Button variant="outline" size="xs" onclick={onShowMerge}>Merge</Button>

					<DropdownMenu bind:open={isAssignMenuOpen}>
						<DropdownMenuTrigger>
							<Button variant="outline" size="xs">
								Assign

								<ChevronDownIcon size="14" />
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onclick={() => {
									onAssignToCurrentUser();
								}}>Assign to me</DropdownMenuItem
							>

							<DropdownMenuItem onclick={() => onAssign()}>Assign</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu bind:open={isSetStatusMenuOpen}>
						<DropdownMenuTrigger>
							<Button variant="outline" size="xs">
								Set status

								<ChevronDownIcon size="14" />
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							{#each alertStatuses as alertStatus}
								<DropdownMenuItem onclick={() => onSetStatus(alertStatus.status_id)}>
									{alertStatus.status_name}</DropdownMenuItem
								>
							{/each}
						</DropdownMenuContent>
					</DropdownMenu>

					{#if alert.status.status_name.toLowerCase() === 'in progress'}
						<Button variant="destructive" size="xs" onclick={() => onShowClose(true)}
							>Close with note</Button
						>
						<Button variant="destructive" size="xs" onclick={() => onShowClose(false)}>Close</Button
						>
					{:else}
						<Button
							variant="default"
							size="xs"
							onclick={() =>
								onSetStatus(
									alertStatuses.find((s) => s.status_name.toLowerCase().trim() === 'in progress')
										?.status_id ?? alertStatuses.length
								)}>Set In Progress</Button
						>
					{/if}
				</div>

				<div class="relative flex items-center gap-3">
					<button
						title="comments"
						onclick={onShowComments}
						class="relative flex text-muted-foreground transition-colors hover:text-foreground"
					>
						<MessagesSquareIcon class="absolute -bottom-2 right-0" size="16" />

						{#if alert.comments?.length}
							<div
								class="absolute -right-2 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-2xs text-white"
							>
								{alert.comments.length}
							</div>
						{/if}
					</button>

					<button
						title="edit"
						onclick={onShowEdit}
						class="text-muted-foreground transition-colors hover:text-foreground"
					>
						<PencilIcon size="16" />
					</button>

					<DropdownMenu bind:open={isMenuOpen}>
						<DropdownMenuTrigger>
							<button
								title="menu"
								class="text-muted-foreground transition-colors hover:text-foreground"
							>
								<EllipsisVerticalIcon size="16" />
							</button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onclick={() => {
									navigator.clipboard
										.writeText(getAlertUrl())
										.then(() => {
											toast({
												title: 'Link copied',
												variant: 'success'
											});
										})
										.catch((e) => {
											console.error('Clipboard copy error:', e);

											toast({
												title: 'Could not copy link',
												variant: 'destructive'
											});
										});
								}}><ForwardIcon /> Share</DropdownMenuItem
							>

							<DropdownMenuItem
								onclick={() => {
									navigator.clipboard
										.writeText(`[<i class="fa-solid fa-bell"></i> #25](${getAlertUrl()})`)
										.then(() => {
											toast({
												title: 'Link copied',
												variant: 'success'
											});
										})
										.catch((e) => {
											console.error('Clipboard copy error:', e);

											toast({
												title: 'Could not copy link',
												variant: 'destructive'
											});
										});
								}}><FileSymlinkIcon /> Markdown Link</DropdownMenuItem
							>

							<Separator />

							<DropdownMenuItem onclick={onShowHistory}><HistoryIcon /> History</DropdownMenuItem>

							<Separator />

							<DropdownMenuItem onclick={onDelete} class="text-red-500 hover:!text-red-600"
								><TrashIcon /> Delete alert</DropdownMenuItem
							>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</Card.Header>

		<Card.Content class="min-w-0 !px-4 !py-3">
			<p class="text-sm text-muted-foreground">{alert.alert_description}</p>

			<Collapsible.Content
				class="overflow-hidden pt-4 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
			>
				{#if detailsLoaded}
					<AlertCardDetails {alert} />
				{/if}
			</Collapsible.Content>
		</Card.Content>

		<AlertCardFooter {alert} {onUnlinkCase} />
	</Collapsible.Root>
</Card.Root>
