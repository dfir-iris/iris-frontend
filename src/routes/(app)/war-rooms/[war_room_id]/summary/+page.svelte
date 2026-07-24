<!--
  War room summary. Mirrors the case summary experience: a single
  collaborative markdown editor keyed by `war-room-summary:<id>` so
  everyone in the room sees the same living document. Backing store
  is `WarRoom.description` — the collab flush writes back to it on
  last-client-disconnect (see `iris_engine/collab/render.py` +
  `business/collab.flush_to_source`).
-->
<script lang="ts">
	import { getContext, onDestroy, onMount } from 'svelte';
	import {
		CheckCircle2Icon,
		CircleAlertIcon,
		CircleDotIcon,
		FileTextIcon,
		LoaderIcon,
		RefreshCwIcon,
		SaveIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import {
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import { WarRoomsService } from '$lib/services/war-rooms.service';

	const ctx = getContext<WarRoomContext>(WAR_ROOM_CTX);
	const warRoomId = $derived(ctx.idGetter());
	const room = $derived(ctx.room);

	let description = $state('');
	let baseDescription = $state('');

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let savedAt = $state(0);

	let loadedTime = $state(new Date());
	let now = $state(new Date());

	const dirty = $derived(description !== baseDescription);

	// Blank the editor state synchronously on room switch so the
	// {#key warRoomId} remount below doesn't briefly seed the new
	// editor with the previous room's description before the context
	// updates. Without this, `room` still points at the previous room
	// for the first tick after the URL changes, so the seed effect
	// below would flash the wrong content.
	let lastLoadedWarRoomId = -1;
	$effect(() => {
		const id = warRoomId;
		if (!Number.isFinite(id) || id === lastLoadedWarRoomId) return;
		lastLoadedWarRoomId = id;
		description = '';
		baseDescription = '';
	});

	// Seed the editor from the war room the layout already loaded.
	// The MarkDownEditor's collab layer will replace this with the
	// authoritative y_state as soon as it joins the doc; keeping a
	// local seed here means view-mode has something to render before
	// sync-init arrives.
	$effect(() => {
		const value = room?.description ?? '';
		if (value !== baseDescription) {
			baseDescription = value;
			description = value;
		}
	});

	const refresh = async () => {
		loading = true;
		lastError = null;
		const res = await WarRoomsService.get(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data);
			loadedTime = new Date();
		} else {
			lastError =
				typeof res.data === 'string' ? res.data : (res.error?.message ?? 'Failed to refresh');
		}
		loading = false;
	};

	// Explicit save button. The collab layer will also flush the
	// server-side snapshot on last-client-disconnect, but a manual
	// save via the REST patch keeps the muscle memory identical to
	// the case summary and gives the user a "known good" moment.
	const save = async () => {
		if (!room) return;
		saving = true;
		lastError = null;
		const res = await WarRoomsService.update(warRoomId, { description });
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data);
			baseDescription = description;
			loadedTime = new Date();
			savedAt = Date.now();
		} else {
			lastError =
				typeof res.data === 'string' ? res.data : (res.error?.message ?? 'Failed to save');
			toast({
				title: 'Could not save summary',
				description: lastError ?? undefined,
				variant: 'destructive'
			});
		}
		saving = false;
	};

	const relativeTime = (from: Date, to: Date): string => {
		const diff = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
		if (diff < 5) return 'just now';
		if (diff < 60) return `${diff}s ago`;
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return from.toLocaleDateString();
	};

	const lastSyncedRelative = $derived(relativeTime(loadedTime, now));
	const lastSyncedAbsolute = $derived(loadedTime.toLocaleTimeString());

	let tickHandle: ReturnType<typeof setInterval> | null = null;
	onMount(() => {
		tickHandle = setInterval(() => (now = new Date()), 15_000);
	});
	onDestroy(() => {
		if (tickHandle) clearInterval(tickHandle);
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-y-auto p-4">
	{#if room}
		<section
			class="overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-elevation-2 transition-shadow duration-200"
		>
			<header
				class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-5 py-3"
			>
				<div class="flex min-w-0 items-center gap-2">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
					>
						<FileTextIcon size={16} />
					</div>
					<div class="min-w-0">
						<h2 class="truncate text-sm font-semibold leading-tight">
							{room.name}
						</h2>
						<p class="truncate text-xs text-muted-foreground">War room summary</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#if lastError}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
						>
							<CircleAlertIcon size={12} />
							Error
						</span>
					{:else if saving}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
						>
							<LoaderIcon size={12} class="animate-spin" />
							Saving…
						</span>
					{:else if dirty}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
						>
							<CircleDotIcon size={12} />
							Unsaved changes
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
						>
							<CheckCircle2Icon size={12} />
							All changes saved
						</span>
					{/if}

					<span
						class="hidden text-xs text-muted-foreground sm:inline"
						title={`Last synced at ${lastSyncedAbsolute}`}
					>
						Synced {lastSyncedRelative}
					</span>

					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="xs"
							disabled={loading}
							onclick={refresh}
							title="Refresh"
						>
							<RefreshCwIcon size={12} class={loading ? 'animate-spin' : ''} />
							<span class="ml-1 hidden sm:inline">Refresh</span>
						</Button>

						<Button
							variant="default"
							size="xs"
							disabled={saving || !dirty}
							onclick={save}
							title="Save"
						>
							<SaveIcon size={12} />
							<span class="ml-1 hidden sm:inline">Save</span>
						</Button>
					</div>
				</div>
			</header>

			{#if lastError}
				<div
					class="border-b border-destructive/30 bg-destructive/5 px-5 py-2 text-xs text-destructive"
				>
					{lastError}
				</div>
			{/if}

			<div class="max-h-[calc(100vh-14rem)] min-h-[20rem] overflow-y-auto p-5">
				<!--
				  Keyed on `warRoomId` for the same reason as the case-summary
				  editor: SvelteKit reuses this page component across a room
				  switch (topbar picker jumps between rooms) and the editor's
				  Yjs binding is captured at construction, so a bare mount
				  would keep showing the previous room's document.
				-->
				{#key warRoomId}
					<MarkDownEditor
						value={description}
						onChange={(v) => (description = v)}
						onSave={() => save()}
						collabMode="war-room-summary"
						{warRoomId}
						{savedAt}
					/>
				{/key}
			</div>
		</section>
	{:else}
		<div class="flex h-32 w-full items-center justify-center text-sm text-muted-foreground">
			Loading…
		</div>
	{/if}
</div>
