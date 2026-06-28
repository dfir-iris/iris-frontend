<script lang="ts">
	import { onMount, setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomsService,
		type WarRoom
	} from '$lib/services/war-rooms.service';
	import {
		createWarRoomContext,
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import {
		createWarRoomDatastorePanelContext,
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import WarRoomTopbar from './components/WarRoomTopbar.svelte';
	import WarRoomTabs from './components/WarRoomTabs.svelte';
	import WarRoomPeopleBanner from './components/WarRoomPeopleBanner.svelte';
	import WarRoomWorkspace from './components/WarRoomWorkspace.svelte';

	let { children }: { children: Snippet } = $props();

	const warRoomId = $derived(Number(page.params.war_room_id));

	const ctx = createWarRoomContext(() => warRoomId);
	setContext<WarRoomContext>(WAR_ROOM_CTX, ctx);

	// Datastore side-panel toggle. One instance per layout so navigating
	// between sub-tabs (Stream / Graph / Timelines / …) doesn't tear
	// down the panel if the operator already has it open.
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
</script>

<div class="flex h-full w-full flex-col bg-background">
	<WarRoomTopbar />
	<WarRoomPeopleBanner />
	<WarRoomTabs />

	<div class="flex-1 overflow-hidden">
		<WarRoomWorkspace>
			{@render children()}
		</WarRoomWorkspace>
	</div>
</div>
