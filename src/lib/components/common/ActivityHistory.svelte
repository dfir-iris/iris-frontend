<script lang="ts">
	import { 
		HistoryIcon, 
		PencilIcon, 
		PlusIcon, 
		TrashIcon, 
		CheckCircleIcon,
		ShieldIcon,
		TagIcon,
		ClockIcon,
		UserIcon
	} from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';

	type HistoryEvent = {
		date: Date;
		timestamp: number;
		user: string;
		userId: number;
		action: string;
	};

	type HistoryData = {
		[timestamp: string]: {
			user: string;
			user_id: number;
			action: string;
		};
	} | object | null;

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
		emptyStateDescription = 'When changes are made to this item, they\'ll be recorded here in the activity history.'
	}: ActivityHistoryProps = $props();
	
	// Process the modification history from the provided data structure
	function processHistoryEvents(): HistoryEvent[] {
		const events: HistoryEvent[] = [];
		
		// Add events from modification_history if available
		if (modificationHistory && typeof modificationHistory === 'object') {
			// Check if it has the expected structure
			Object.entries(modificationHistory)
				.forEach(([timestamp, data]) => {
					// Type guard to ensure data has the expected structure
					if (data && typeof data === 'object' && 'user' in data && 'user_id' in data && 'action' in data) {
						events.push({
							date: new Date(parseFloat(timestamp) * 1000), // Convert Unix timestamp to JS Date
							timestamp: parseFloat(timestamp),
							user: data.user as string,
							userId: data.user_id as number,
							action: data.action as string,
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
	
	// Function to get a user's initials for the avatar
	function getUserInitials(username: string) {
		return username.substring(0, 2).toUpperCase();
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
				{historyEvents.length} {historyEvents.length === 1 ? 'event' : 'events'}
			</Badge>
		{/if}
	</header>
	
	{#if historyEvents.length > 0}
		<div class="space-y-4">
			{#each historyEvents as event, index (event.timestamp)}
				{@const IconComponent = getActionIcon(event.action)}
				<div 
					class="group relative"
					in:slide={{ duration: 300, delay: index * 50 }}
				>
					{#if index < historyEvents.length - 1}
						<div class="absolute left-3 top-8 bottom-0 w-0.5 bg-border/50 group-last:hidden"></div>
					{/if}
					
					<div class="flex gap-4">
						<div class="relative z-10 shrink-0">
							<div class={cn(
								"h-6 w-6 rounded-full flex items-center justify-center text-white",
								getActionColor(event.action)
							)}>
								<IconComponent class="h-3.5 w-3.5" />
							</div>
						</div>
						
						<div class="flex-1 bg-card rounded-lg p-4 shadow-sm border border-border/30 hover:border-border/60 transition-all duration-200">
							<div class="flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<Avatar class="h-6 w-6">
											<AvatarFallback class="bg-muted text-xs">{getUserInitials(event.user)}</AvatarFallback>
										</Avatar>
										<span class="font-medium text-sm">{event.user}</span>
										<Badge 
											variant="outline" 
											class={cn(
												"text-xs capitalize font-normal",
												getActionTextColor(event.action)
											)}
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
			class="flex flex-col items-center justify-center p-10 text-center bg-muted/30 rounded-lg border border-dashed border-border/50"
			in:fade
		>
			<div class="bg-muted/50 p-4 rounded-full mb-4">
				<HistoryIcon class="h-8 w-8 text-muted-foreground/60" />
			</div>
			<h3 class="text-lg font-medium mb-1">{emptyStateTitle}</h3>
			<p class="text-muted-foreground text-sm max-w-md">
				{emptyStateDescription}
			</p>
		</div>
	{/if}
</div>
