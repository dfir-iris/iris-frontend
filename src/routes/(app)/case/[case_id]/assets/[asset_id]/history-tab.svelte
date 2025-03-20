<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
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

	let { asset }: { asset: Asset } = $props();
	
	// Process the modification history from the provided data structure
	function processHistoryEvents() {
		const events = [];
		
		// Add events from modification_history if available
		if (asset.modification_history) {
			Object.entries(asset.modification_history)
				.forEach(([timestamp, data]) => {
					events.push({
						date: new Date(parseFloat(timestamp) * 1000), // Convert Unix timestamp to JS Date
						timestamp: parseFloat(timestamp),
						user: data.user,
						userId: data.user_id,
						action: data.action,
						// Add more fields as they become available in the API
					});
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
	
	// Update history events when asset changes
	$effect(() => {
		historyEvents = processHistoryEvents();
	});
	
	// Function to get a human-readable description of the action
	function getActionDescription(action: string) {
		switch (action.toLowerCase()) {
			case 'created':
				return 'Created this asset';
			case 'updated':
				return 'Updated asset details';
			case 'status_changed':
				return 'Changed analysis status';
			case 'compromise_changed':
				return 'Updated compromise status';
			case 'tags_updated':
				return 'Modified asset tags';
			default:
				return `Performed ${action} action`;
		}
	}
</script>

<div class="space-y-6">
	<header class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<HistoryIcon class="h-5 w-5 text-primary" />
			<h2 class="text-xl font-semibold">Activity History</h2>
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
				<div 
					class="group relative"
					in:slide={{ duration: 300, delay: index * 50 }}
				>
					<!-- Timeline connector -->
					{#if index < historyEvents.length - 1}
						<div class="absolute left-3 top-8 bottom-0 w-0.5 bg-border/50 group-last:hidden"></div>
					{/if}
					
					<div class="flex gap-4">
						<!-- Icon -->
						<div class="relative z-10 shrink-0">
							<div class={cn(
								"h-6 w-6 rounded-full flex items-center justify-center text-white",
								getActionColor(event.action)
							)}>
								<svelte:component this={getActionIcon(event.action)} class="h-3.5 w-3.5" />
							</div>
						</div>
						
						<!-- Content -->
						<div class="flex-1 bg-card rounded-lg p-4 shadow-sm border border-border/30 hover:border-border/60 transition-all duration-200">
							<div class="flex flex-col gap-2">
								<!-- Header with user and time -->
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
								
								<!-- Description -->
								<p class="text-sm text-foreground/90">
									{getActionDescription(event.action)}
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
			<h3 class="text-lg font-medium mb-1">No activity yet</h3>
			<p class="text-muted-foreground text-sm max-w-md">
				When changes are made to this asset, they'll be recorded here in the activity history.
			</p>
		</div>
	{/if}
</div>