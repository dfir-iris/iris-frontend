<script lang="ts">
	import {
		HistoryIcon,
		PencilIcon,
		PlusIcon,
		TrashIcon,
		CheckCircleIcon,
		ShieldIcon,
		TagIcon,
		ClockIcon
	} from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	export interface HistoryEventBase {
		user: string;
		user_id: number;
		action: string;
	}

	interface HistoryEvent extends HistoryEventBase {
		date: Date;
		timestamp: number;
		user: string;
		userId: number;
		action: string;
	}

	export type HistoryData =
		| {
				[timestamp: string]: HistoryEventBase;
		  }
		| object
		| null;

	interface ActivityHistoryProps {
		modificationHistory: HistoryData | null | undefined;
		entityType?: string;
		title?: string;
		emptyStateTitle?: string;
		emptyStateDescription?: string;
	}

	let {
		modificationHistory,
		entityType = 'item',
		title = 'Activity History',
		emptyStateTitle = 'No activity yet',
		emptyStateDescription = "When changes are made to this item, they'll be recorded here in the activity history."
	}: ActivityHistoryProps = $props();

	// Process the modification history from the provided data structure
	function processHistoryEvents(): HistoryEvent[] {
		const events: HistoryEvent[] = [];

		// Add events from modification_history if available
		if (modificationHistory && typeof modificationHistory === 'object') {
			// Check if it has the expected structure
			Object.entries(modificationHistory).forEach(([timestamp, data]) => {
				// Type guard to ensure data has the expected structure
				if (
					data &&
					typeof data === 'object' &&
					'user' in data &&
					'user_id' in data &&
					'action' in data
				) {
					events.push({
						date: new Date(parseFloat(timestamp) * 1000), // Convert Unix timestamp to JS Date
						timestamp: parseFloat(timestamp),
						user: data.user as string,
						user_id: data.user_id as number,
						userId: data.user_id as number,
						action: data.action as string
					});
				}
			});
		}

		// Sort by most recent first
		return events.sort((a, b) => b.timestamp - a.timestamp);
	}

	let historyEvents = $state(processHistoryEvents());

	// Function to format dates in a readable way
	function formatDate(date: Date) {
		return mediumDateTimeFormatter(date);
	}

	// Function to get the appropriate icon for an action
	function getActionIcon(action: string) {
		switch (action.toLowerCase()) {
			case 'created':
				return PlusIcon;
			case 'updated':
				return PencilIcon;
			case 'deleted':
				return TrashIcon;
			case 'status_changed':
				return CheckCircleIcon;
			case 'compromise_changed':
				return ShieldIcon;
			case 'tags_updated':
				return TagIcon;
			default:
				return PencilIcon;
		}
	}

	// Function to get color classes based on action
	function getActionColor(action: string) {
		switch (action.toLowerCase()) {
			case 'created':
				return 'bg-green-500';
			case 'updated':
				return 'bg-blue-500';
			case 'deleted':
				return 'bg-red-500';
			case 'status_changed':
				return 'bg-amber-500';
			case 'compromise_changed':
				return 'bg-purple-500';
			case 'tags_updated':
				return 'bg-indigo-500';
			default:
				return 'bg-gray-500';
		}
	}

	// Function to get text color classes based on action
	function getActionTextColor(action: string) {
		switch (action.toLowerCase()) {
			case 'created':
				return 'text-green-500';
			case 'updated':
				return 'text-blue-500';
			case 'deleted':
				return 'text-red-500';
			case 'status_changed':
				return 'text-amber-500';
			case 'compromise_changed':
				return 'text-purple-500';
			case 'tags_updated':
				return 'text-indigo-500';
			default:
				return 'text-gray-500';
		}
	}

	// Update history events when modification history changes
	$effect(() => {
		historyEvents = processHistoryEvents();
	});

	// Function to get a human-readable description of the action
	function getActionDescription(action: string, entityType: string) {
		switch (action.toLowerCase()) {
			case 'created':
				return `Created this ${entityType}`;
			case 'updated':
				return `Updated ${entityType} details`;
			case 'status_changed':
				return 'Changed analysis status';
			case 'compromise_changed':
				return 'Updated compromise status';
			case 'tags_updated':
				return `Modified ${entityType} tags`;
			default:
				return `${action}`;
		}
	}
</script>

<div class="space-y-6">
	<header class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<HistoryIcon class="h-5 w-5 text-primary" />
			<h2 class="text-xl font-semibold">{title}</h2>
		</div>

		{#if historyEvents.length > 0}
			<Badge variant="secondary" class="px-2 py-0.5">
				{historyEvents.length}
				{historyEvents.length === 1 ? 'event' : 'events'}
			</Badge>
		{/if}
	</header>

	{#if historyEvents.length > 0}
		<div class="space-y-4">
			{#each historyEvents as event, index (event.timestamp)}
				{@const IconComponent = getActionIcon(event.action)}
				<div class="group relative" in:slide={{ duration: 300, delay: index * 50 }}>
					{#if index < historyEvents.length - 1}
						<div class="absolute bottom-0 left-3 top-8 w-0.5 bg-border/50 group-last:hidden"></div>
					{/if}

					<div class="flex gap-4">
						<div class="relative z-10 shrink-0">
							<div
								class={cn(
									'flex h-6 w-6 items-center justify-center rounded-full text-white',
									getActionColor(event.action)
								)}
							>
								<IconComponent class="h-3.5 w-3.5" />
							</div>
						</div>

						<div
							class="flex-1 rounded-lg border border-border/30 bg-card p-4 shadow-sm transition-all duration-200 hover:border-border/60"
						>
							<div class="flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<UserAvatar userId={event.user_id} name={event.user} size="size-6" />
										<span class="text-sm font-medium">{event.user}</span>
										<Badge
											variant="outline"
											class={cn('text-xs font-normal capitalize', getActionTextColor(event.action))}
										>
											{event.action}
										</Badge>
									</div>
									<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
										<ClockIcon class="h-3 w-3" />
										<time datetime={event.date.toISOString()}>
											{formatDate(event.date)}
										</time>
									</div>
								</div>

								<p class="text-sm text-foreground/90">
									{getActionDescription(event.action, entityType)}
								</p>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/30 p-10 text-center"
			in:fade
		>
			<div class="mb-4 rounded-full bg-muted/50 p-4">
				<HistoryIcon class="h-8 w-8 text-muted-foreground/60" />
			</div>
			<h3 class="mb-1 text-lg font-medium">{emptyStateTitle}</h3>
			<p class="max-w-md text-sm text-muted-foreground">
				{emptyStateDescription}
			</p>
		</div>
	{/if}
</div>
