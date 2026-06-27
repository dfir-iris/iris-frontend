<script lang="ts">
	import { onMount, setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import {
		ActivityIcon,
		ArrowLeftIcon,
		DatabaseIcon,
		MessageSquareIcon,
		WaypointsIcon,
		ListChecksIcon,
		ClockIcon,
		FileTextIcon,
		FilesIcon,
		UsersIcon,
		HardDriveUploadIcon,
		ShieldAlert
	} from 'lucide-svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomsService,
		type WarRoom
	} from '$lib/services/war-rooms.service';
	import { safeHexColor } from '$lib/utils/color';
	import {
		createWarRoomContext,
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import {
		createWarRoomActivityPanelContext,
		createWarRoomDatastorePanelContext,
		WAR_ROOM_ACTIVITY_PANEL_CTX,
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomActivityPanelContext,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import WarRoomWorkspace from './components/WarRoomWorkspace.svelte';

	let { children }: { children: Snippet } = $props();

	const warRoomId = $derived(Number(page.params.war_room_id));

	const ctx = createWarRoomContext(() => warRoomId);
	setContext<WarRoomContext>(WAR_ROOM_CTX, ctx);

	// Side-panel toggles. One instance per layout, so navigating between
	// chat / graph / timelines / etc. doesn't tear down the open panel.
	const activityPanel = createWarRoomActivityPanelContext();
	setContext<WarRoomActivityPanelContext>(WAR_ROOM_ACTIVITY_PANEL_CTX, activityPanel);
	const datastorePanel = createWarRoomDatastorePanelContext();
	setContext<WarRoomDatastorePanelContext>(WAR_ROOM_DATASTORE_PANEL_CTX, datastorePanel);

	let loadingFirst = $state(true);

	const refresh = async () => {
		const res = await WarRoomsService.get(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data as WarRoom);
		} else {
			toast({
				title: 'Could not load war room',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
		loadingFirst = false;
	};

	onMount(refresh);

	// Reactive guard — if the route changes to a different war room, refetch.
	$effect(() => {
		if (warRoomId && ctx.room?.war_room_id !== warRoomId) {
			loadingFirst = true;
			refresh();
		}
	});

	const tabs = [
		{ label: 'Chat', path: 'chat', icon: MessageSquareIcon },
		{ label: 'Graph', path: 'graph', icon: WaypointsIcon },
		{ label: 'Timelines', path: 'timelines', icon: ClockIcon },
		{ label: 'Tasks', path: 'tasks', icon: ListChecksIcon },
		{ label: 'Notes', path: 'notes', icon: FileTextIcon },
		{ label: 'SitReps', path: 'sitreps', icon: FilesIcon },
		{ label: 'Datastore', path: 'datastore', icon: HardDriveUploadIcon },
		{ label: 'Cases', path: 'cases', icon: WaypointsIcon },
		{ label: 'Members', path: 'members', icon: UsersIcon }
	];

	const tabActive = (tab: { path: string }) => {
		const base = `/war-rooms/${warRoomId}/${tab.path}`;
		return page.url.pathname === base || page.url.pathname.startsWith(`${base}/`);
	};

	const stateColorClass = (state?: string) => {
		switch (state) {
			case 'active':
				return 'bg-red-500/10 text-red-500 ring-red-500/30';
			case 'open':
				return 'bg-amber-500/10 text-amber-500 ring-amber-500/30';
			case 'standby':
				return 'bg-blue-500/10 text-blue-500 ring-blue-500/30';
			case 'closed':
				return 'bg-muted text-muted-foreground ring-border';
			default:
				return 'bg-muted text-muted-foreground ring-border';
		}
	};
</script>

<div class="flex h-full w-full flex-col">
	<header class="flex items-center gap-3 border-b bg-background/80 px-4 py-2.5">
		<a
			href="/war-rooms"
			class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
			aria-label="Back to war rooms"
		>
			<ArrowLeftIcon class="h-4 w-4" />
		</a>
		<ShieldAlert class="h-5 w-5 text-red-500" />
		{#if loadingFirst}
			<Skeleton class="h-5 w-48" />
		{:else if ctx.room}
			{@const safeColor = safeHexColor(ctx.room.color)}
			{#if safeColor}
				<span
					class="h-3 w-3 shrink-0 rounded-full"
					style:background-color={safeColor}
					aria-hidden="true"
				></span>
			{/if}
			<h1 class="truncate text-sm font-semibold">{ctx.room.name}</h1>
			<span
				class={[
					'shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wider ring-1',
					stateColorClass(ctx.room.state)
				]}
			>
				{ctx.room.state}
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-1">
			<Button
				variant={activityPanel.state.open ? 'secondary' : 'ghost'}
				size="sm"
				class="h-7 gap-1 px-2 text-xs"
				onclick={() => activityPanel.toggle()}
				aria-pressed={activityPanel.state.open}
				aria-label="Toggle activity panel"
			>
				<ActivityIcon class="h-3.5 w-3.5" />
				<span class="hidden md:inline">Activity</span>
			</Button>
			<Button
				variant={datastorePanel.state.open ? 'secondary' : 'ghost'}
				size="sm"
				class="h-7 gap-1 px-2 text-xs"
				onclick={() => datastorePanel.toggle()}
				aria-pressed={datastorePanel.state.open}
				aria-label="Toggle datastore panel"
			>
				<DatabaseIcon class="h-3.5 w-3.5" />
				<span class="hidden md:inline">Datastore</span>
			</Button>
		</div>
	</header>

	<nav class="flex items-center gap-1 border-b px-3" aria-label="War room sections">
		{#each tabs as tab (tab.path)}
			{@const active = tabActive(tab)}
			<a
				href={`/war-rooms/${warRoomId}/${tab.path}`}
				class={[
					'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors',
					active
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground hover:text-foreground'
				]}
			>
				<tab.icon class="h-3.5 w-3.5" />
				{tab.label}
			</a>
		{/each}
	</nav>

	<div class="flex-1 overflow-hidden">
		<WarRoomWorkspace bare class="overflow-hidden">
			{@render children()}
		</WarRoomWorkspace>
	</div>
</div>
