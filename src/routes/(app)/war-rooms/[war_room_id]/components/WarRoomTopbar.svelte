<!--
  War-room topbar. Mirrors the case topbar visual language:
  icon badge, monospaced ID, title row, inline metadata, status chip,
  trailing action cluster (Activity / Datastore toggles).

  Closed war rooms get a soft red gradient banner to match the case
  closed banner — the visual cue is the same so an operator working
  multiple incidents can tell at a glance which workspace they're in.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		ArrowLeftIcon,
		CalendarIcon,
		DatabaseIcon,
		LockIcon,
		RadioTowerIcon,
		ShieldAlert,
		UserRoundIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Popover from '$lib/components/ui/popover';
	import {
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import type { WarRoomState } from '$lib/services/war-rooms.service';
	import { safeHexColor } from '$lib/utils/color';

	const ctx = getContext<WarRoomContext>(WAR_ROOM_CTX);
	const datastorePanel = getContext<WarRoomDatastorePanelContext>(
		WAR_ROOM_DATASTORE_PANEL_CTX
	);

	const room = $derived(ctx.room);
	const isClosed = $derived(room?.state === 'closed');

	const stateChip = (state?: WarRoomState | string) => {
		// Lined up with the SOC IR severity palette: active = red (live
		// incident), open = amber (engaged but not on fire), standby =
		// blue (monitoring), closed = neutral.
		switch (state) {
			case 'active':
				return {
					label: 'Active',
					cls: 'border-red-500/40 bg-red-500/15 text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-300'
				};
			case 'open':
				return {
					label: 'Open',
					cls: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-300'
				};
			case 'standby':
				return {
					label: 'Standby',
					cls: 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-300'
				};
			case 'closed':
				return {
					label: 'Closed',
					cls: 'border-muted bg-muted/60 text-muted-foreground'
				};
			default:
				return {
					label: state ?? 'Unknown',
					cls: 'border-muted bg-muted/60 text-muted-foreground'
				};
		}
	};

	const chip = $derived(stateChip(room?.state));
	const safeAccent = $derived(safeHexColor(room?.color ?? null));

	const fmtDate = (iso: string | null | undefined) => {
		if (!iso) return null;
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				month: 'short',
				day: '2-digit',
				year: 'numeric'
			});
		} catch {
			return null;
		}
	};
	const createdLabel = $derived(fmtDate(room?.created_at));
</script>

<div
	class="relative flex items-center gap-2 border-b px-3 py-2 sm:gap-4 sm:px-5 sm:py-2.5 {isClosed
		? 'border-b-red-500/40 bg-gradient-to-r from-red-100 via-rose-50 to-red-50/40 dark:border-b-red-500/50 dark:from-red-950/60 dark:via-rose-950/40 dark:to-red-950/20'
		: 'bg-card'}"
>
	<!-- Back to war-rooms list -->
	<a
		href="/war-rooms"
		class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
		aria-label="Back to war rooms"
	>
		<ArrowLeftIcon size={16} />
	</a>

	<!-- Icon badge -->
	<div
		class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 ring-1 ring-inset ring-black/5 sm:flex"
	>
		<ShieldAlert size={16} class="text-red-600 dark:text-red-400" />
	</div>

	<!-- Title + metadata column -->
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<div class="flex min-w-0 items-center gap-2">
			{#if room?.war_room_id}
				<span class="shrink-0 font-mono text-xs text-muted-foreground">
					WR#{room.war_room_id}
				</span>
			{/if}

			{#if !room}
				<Skeleton class="h-5 w-48" />
			{:else}
				{#if safeAccent}
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						style:background-color={safeAccent}
						aria-hidden="true"
					></span>
				{/if}
				<h2
					class="min-w-0 truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground"
					title={room.name}
				>
					{room.name}
				</h2>
				{#if isClosed}
					<span
						class="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-300"
					>
						<LockIcon size={10} />
						Closed
					</span>
				{/if}
			{/if}
		</div>

		<!-- Inline metadata: only on md+ to keep small screens uncluttered -->
		{#if room}
			<div
				class="hidden flex-wrap items-center gap-x-1 gap-y-0.5 text-2xs text-muted-foreground md:flex"
			>
				{#if createdLabel}
					<span
						class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
					>
						<CalendarIcon size={11} class="opacity-70" />
						<span>Created {createdLabel}</span>
					</span>
				{/if}
				{#if room.description}
					<span class="opacity-30">·</span>
					<span class="max-w-[36rem] truncate" title={room.description}>
						{room.description}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Right cluster -->
	<div class="flex shrink-0 items-center gap-1.5">
		{#if room}
			<span
				class="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium {chip.cls}"
				aria-label={chip.label}
			>
				<RadioTowerIcon size={12} />
				<span>{chip.label}</span>
			</span>
		{/if}

		<div class="hidden h-5 w-px bg-border sm:block" aria-hidden="true"></div>

		<Button
			variant={datastorePanel.state.open ? 'secondary' : 'ghost'}
			size="sm"
			class="h-7 gap-1.5 px-2 text-xs"
			onclick={() => datastorePanel.toggle()}
			aria-pressed={datastorePanel.state.open}
			aria-label="Toggle datastore panel"
		>
			<DatabaseIcon size={13} />
			<span class="hidden md:inline">Datastore</span>
		</Button>
	</div>
</div>
