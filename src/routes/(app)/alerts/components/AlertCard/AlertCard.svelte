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
	import type { Alert } from '$lib/types/resources/alert';
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
		expanded = false,
		onExpandedChange,
		onAssign,
		onAssignToCurrentUser,
		onSetStatus,
		onShowEdit,
		onShowHistory,
		onDelete
	}: {
		alert: Alert;
		alertStatuses: AlertStatus[];
		expanded?: boolean;
		onExpandedChange: (v: boolean) => void;
		onAssign: () => void;
		onAssignToCurrentUser: () => void;
		onSetStatus: (status_id: number) => void;
		onShowEdit: () => void;
		onShowHistory: () => void;
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
				return 'bg-gray-500';
		}
	};

	let isAssignMenuOpen = $state(false);
	let isSetStatusMenuOpen = $state(false);
	let isMenuOpen = $state(false);

	const showHeaderActions = $derived(isAssignMenuOpen || isSetStatusMenuOpen || isMenuOpen);
</script>

<Card.Root class="group flex grow">
	<Collapsible.Root open={expanded} onOpenChange={onExpandedChange}>
		<Card.Header class="!flex !flex-row !items-center !justify-between !space-y-0 pb-2">
			<div class="flex min-w-0 flex-1 items-center gap-4">
				<div class="relative flex h-12 w-14 shrink-0">
					<Collapsible.Trigger>
						<button
							class={`absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full text-white hover:z-50 ${getBackgroundBySeverity(alert.severity.severity_name)}`}
						>
							<FlameIcon size="32" />
						</button>
					</Collapsible.Trigger>

					<button
						class={`absolute left-6 top-4 z-0 flex h-10 w-10 items-center justify-center rounded-full text-xl text-white ${alert.owner ? 'bg-blue-300' : 'bg-orange-800'}`}
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
					class="min-w-0 flex-1 cursor-pointer text-left transition-all hover:opacity-50"
				>
					<h3 class="truncate text-lg font-bold">{alert.alert_title}</h3>
					<h4 class="truncate text-sm italic opacity-85">
						#{alert.alert_id} - {alert.alert_uuid}
					</h4>
				</Collapsible.Trigger>
			</div>

			<div class="flex shrink-0 items-center gap-8">
				<div
					class={`flex gap-4 transition-opacity ${showHeaderActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
				>
					<DropdownMenu bind:open={isAssignMenuOpen}>
						<DropdownMenuTrigger>
							<Button variant="outline">
								Assign

								<ChevronDownIcon />
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
							<Button variant="outline">
								Set status

								<ChevronDownIcon />
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

					<Button variant="default" onclick={() => {}}>Set In Progress</Button>
				</div>

				<div class="flex gap-4">
					<button title="comments" class="transition-all hover:opacity-50">
						<MessagesSquareIcon size="16" />
					</button>

					<button title="edit" onclick={onShowEdit} class="transition-all hover:opacity-50">
						<PencilIcon size="16" />
					</button>

					<DropdownMenu bind:open={isMenuOpen}>
						<DropdownMenuTrigger>
							<button title="menu" class="transition-all hover:opacity-50">
								<EllipsisVerticalIcon size="16" />
							</button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							<DropdownMenuItem onclick={() => {}}><ForwardIcon /> Share</DropdownMenuItem>

							<DropdownMenuItem onclick={() => {}}
								><FileSymlinkIcon /> Markdown Link</DropdownMenuItem
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

		<Card.Content>
			{alert.alert_description}

			<Collapsible.Content
				class="overflow-hidden pt-4 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
			>
				<AlertCardDetails {alert} />
			</Collapsible.Content>
		</Card.Content>

		<AlertCardFooter {alert} />
	</Collapsible.Root>
</Card.Root>
