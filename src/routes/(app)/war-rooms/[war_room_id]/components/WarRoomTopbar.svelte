<!--
  War-room topbar. Mirrors the case topbar visual language:
  icon badge, monospaced ID, title row, inline metadata, status chip,
  trailing action cluster (Datastore toggle).

  Three things are editable in place from this bar — same affordances
  the IC would otherwise reach for via slash commands:

    * Title — click the room name → inline input → Save / Cancel.
    * State — state chip is a dropdown (Open / Active / Standby / Closed).
    * Severity (criticality) — a small skull-style chip next to the
      state, also a dropdown over the live severities list.

  Closed war rooms get a soft red gradient banner to match the case
  closed banner — the visual cue is the same so an operator working
  multiple incidents can tell at a glance which workspace they're in.
-->
<script lang="ts">
	import { getContext, tick } from 'svelte';
	import {
		AlertOctagon,
		ArrowLeftIcon,
		CalendarIcon,
		CheckIcon,
		DatabaseIcon,
		LockIcon,
		PencilIcon,
		RadioTowerIcon,
		ShieldAlert,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/components/ui/toast';
	import {
		WAR_ROOM_CTX,
		type WarRoomContext
	} from '$lib/contexts/war-room.context.svelte';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import {
		WarRoomsService,
		type WarRoom,
		type WarRoomState
	} from '$lib/services/war-rooms.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import { safeHexColor } from '$lib/utils/color';
	import WarRoomPeopleBanner from './WarRoomPeopleBanner.svelte';

	const ctx = getContext<WarRoomContext>(WAR_ROOM_CTX);
	const datastorePanel = getContext<WarRoomDatastorePanelContext>(
		WAR_ROOM_DATASTORE_PANEL_CTX
	);

	const room = $derived(ctx.room);
	const isClosed = $derived(room?.state === 'closed');

	const STATE_OPTIONS: { value: WarRoomState; label: string }[] = [
		{ value: 'open', label: 'Open' },
		{ value: 'active', label: 'Active' },
		{ value: 'standby', label: 'Standby' },
		{ value: 'closed', label: 'Closed' }
	];

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

	// --- Inline title editing ------------------------------------------
	let editingName = $state(false);
	let nameDraft = $state('');
	let nameSaving = $state(false);
	let nameInputEl: HTMLInputElement | null = $state(null);

	const startNameEdit = async () => {
		if (!room) return;
		nameDraft = room.name;
		editingName = true;
		await tick();
		nameInputEl?.focus();
		nameInputEl?.select();
	};

	const cancelNameEdit = () => {
		editingName = false;
		nameDraft = '';
	};

	const saveName = async () => {
		if (!room) return;
		const next = nameDraft.trim();
		if (!next || next === room.name) {
			cancelNameEdit();
			return;
		}
		nameSaving = true;
		const res = await WarRoomsService.update(room.war_room_id, { name: next });
		nameSaving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data as WarRoom);
			editingName = false;
		} else {
			toast({
				title: 'Could not rename war room',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
	};

	const onNameKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			void saveName();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelNameEdit();
		}
	};

	// --- State dropdown ------------------------------------------------
	let stateSaving = $state(false);

	const setState = async (next: WarRoomState) => {
		if (!room || next === room.state || stateSaving) return;
		stateSaving = true;
		const res = await WarRoomsService.update(room.war_room_id, { state: next });
		stateSaving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data as WarRoom);
		} else {
			toast({
				title: 'Could not change state',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
	};

	// --- Severity dropdown (lazy-loaded) -------------------------------
	let severities = $state<Severity[]>([]);
	let severitiesLoaded = $state(false);
	let severitiesLoading = $state(false);
	let severitySaving = $state(false);

	const loadSeverities = async () => {
		if (severitiesLoaded || severitiesLoading) return;
		severitiesLoading = true;
		const res = await SeveritiesService.list();
		severitiesLoading = false;
		// `/manage/severities` is paginated — unwrap `{ data: [...] }`.
		const payload = (res?.data as unknown as { data?: Severity[] }) ?? null;
		const arr = Array.isArray(payload?.data)
			? payload.data
			: Array.isArray(res?.data)
				? (res.data as Severity[])
				: [];
		severities = arr;
		severitiesLoaded = true;
	};

	const currentSeverity = $derived(
		severities.find((s) => s.severity_id === room?.severity_id) ?? null
	);

	// When the room loads with a severity already set, we need the
	// taxonomy in memory so the chip can render its name — otherwise the
	// trigger falls through to the "Criticality" placeholder until the
	// user happens to open the dropdown. Lazy-load was a footgun here:
	// the chip looked unset after every page refresh even though the
	// row had a severity_id persisted.
	$effect(() => {
		if (room?.severity_id != null && !severitiesLoaded && !severitiesLoading) {
			void loadSeverities();
		}
	});

	// Map severity name → chip palette. The taxonomy ships with at
	// least Low/Medium/High/Critical; deployments add custom ones, so
	// the default branch keeps a neutral muted look.
	const severityPalette = (
		name: string | null | undefined
	): { cls: string; dot: string } => {
		const n = (name ?? '').trim().toLowerCase();
		if (n.startsWith('crit'))
			return {
				cls: 'border-red-500/40 bg-red-500/15 text-red-700 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-300',
				dot: 'bg-red-500'
			};
		if (n.startsWith('high'))
			return {
				cls: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/20 dark:text-orange-300',
				dot: 'bg-orange-500'
			};
		if (n.startsWith('med') || n === 'medium')
			return {
				cls: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-300',
				dot: 'bg-amber-500'
			};
		if (n.startsWith('low') || n === 'informational' || n === 'info')
			return {
				cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-300',
				dot: 'bg-emerald-500'
			};
		return {
			cls: 'border-muted bg-muted/60 text-muted-foreground',
			dot: 'bg-muted-foreground'
		};
	};

	const severityChip = $derived(
		severityPalette(currentSeverity?.severity_name)
	);

	const setSeverity = async (id: number | null) => {
		if (!room || severitySaving) return;
		if (id === room.severity_id) return;
		severitySaving = true;
		const res = await WarRoomsService.update(room.war_room_id, {
			severity_id: id
		});
		severitySaving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			ctx.setRoom(res.data as WarRoom);
		} else {
			toast({
				title: 'Could not change criticality',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
	};
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
			{:else if editingName}
				<!--
				  Inline edit. Enter saves, Esc cancels — matches the
				  case-side rename dialog's keyboard contract.
				-->
				<Input
					bind:ref={nameInputEl}
					value={nameDraft}
					oninput={(e) => (nameDraft = (e.target as HTMLInputElement).value)}
					onkeydown={onNameKeydown}
					class="h-7 min-w-0 max-w-md flex-1 text-[15px] font-semibold"
					disabled={nameSaving}
					aria-label="War room name"
				/>
				<button
					type="button"
					class="rounded p-1 text-emerald-600 transition-colors hover:bg-muted hover:text-emerald-700 disabled:opacity-50"
					onclick={saveName}
					disabled={nameSaving || !nameDraft.trim()}
					aria-label="Save name"
					title="Save (Enter)"
				>
					<CheckIcon size={14} />
				</button>
				<button
					type="button"
					class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
					onclick={cancelNameEdit}
					disabled={nameSaving}
					aria-label="Cancel rename"
					title="Cancel (Esc)"
				>
					<XIcon size={14} />
				</button>
			{:else}
				{#if safeAccent}
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						style:background-color={safeAccent}
						aria-hidden="true"
					></span>
				{/if}
				<!--
				  Title behaves like a button: clicking opens the inline
				  editor. We render an <h2> for semantics + a sibling
				  pencil so the affordance is discoverable.
				-->
				<button
					type="button"
					class="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted/60"
					onclick={startNameEdit}
					title="Rename war room"
				>
					<h2
						class="min-w-0 truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground"
					>
						{room.name}
					</h2>
					<PencilIcon
						size={12}
						class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
					/>
				</button>
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
		{#if room && !editingName}
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

				<!-- People summary: avatars + role counts, hover to expand
				     into the grouped roster popover. Sits right next to
				     "Created on" so the metadata row reads as one strip. -->
				<span class="opacity-30">·</span>
				<WarRoomPeopleBanner />

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
			<!--
			  State chip is a clickable trigger. Hover/active styles
			  inherit from the chip palette so the existing visual
			  language stays intact; the dropdown just lets the IC change
			  it without a slash command.
			-->
			<DropdownMenu>
				<DropdownMenuTrigger>
					<span
						class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:brightness-110 {chip.cls}"
						aria-label={`State: ${chip.label}. Click to change.`}
					>
						<RadioTowerIcon size={12} />
						<span>{chip.label}</span>
					</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" class="min-w-[180px]">
					<DropdownMenuLabel>Change war-room state</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{#each STATE_OPTIONS as opt (opt.value)}
						{@const isCurrent = room?.state === opt.value}
						<DropdownMenuItem
							disabled={isCurrent || stateSaving}
							onclick={() => !isCurrent && setState(opt.value)}
						>
							<span class="flex w-full items-center justify-between gap-2">
								<span>{opt.label}</span>
								{#if isCurrent}
									<CheckIcon size={12} class="shrink-0 text-emerald-500" />
								{/if}
							</span>
						</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			<!--
			  Criticality (severity) chip. Lazy-loads the taxonomy on
			  first open so the topbar render path stays free of a list
			  fetch when nobody touches it.
			-->
			<DropdownMenu onOpenChange={(o) => o && loadSeverities()}>
				<DropdownMenuTrigger>
					{#if currentSeverity}
						<span
							class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:brightness-110 {severityChip.cls}"
							aria-label={`Criticality: ${currentSeverity.severity_name}. Click to change.`}
						>
							<AlertOctagon size={12} />
							<span>{currentSeverity.severity_name}</span>
						</span>
					{:else}
						<span
							class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
							aria-label="Set criticality"
						>
							<AlertOctagon size={12} />
							<span>Criticality</span>
						</span>
					{/if}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" class="min-w-[200px]">
					<DropdownMenuLabel>Change criticality</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{#if severitiesLoading && severities.length === 0}
						<div class="px-2 py-1.5 text-xs text-muted-foreground">
							Loading severities…
						</div>
					{:else if severities.length === 0}
						<div class="px-2 py-1.5 text-xs text-muted-foreground">
							No severities defined
						</div>
					{:else}
						{#each severities as sev (sev.severity_id)}
							{@const isCurrent = room?.severity_id === sev.severity_id}
							{@const palette = severityPalette(sev.severity_name)}
							<DropdownMenuItem
								disabled={isCurrent || severitySaving}
								onclick={() => !isCurrent && setSeverity(sev.severity_id)}
							>
								<span class="flex w-full items-center justify-between gap-2">
									<span class="flex items-center gap-2">
										<span
											class={`h-2 w-2 shrink-0 rounded-full ${palette.dot}`}
											aria-hidden="true"
										></span>
										<span>{sev.severity_name}</span>
									</span>
									{#if isCurrent}
										<CheckIcon size={12} class="shrink-0 text-emerald-500" />
									{/if}
								</span>
							</DropdownMenuItem>
						{/each}
						{#if room?.severity_id != null}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								class="text-muted-foreground"
								onclick={() => setSeverity(null)}
							>
								Clear criticality
							</DropdownMenuItem>
						{/if}
					{/if}
				</DropdownMenuContent>
			</DropdownMenu>
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
