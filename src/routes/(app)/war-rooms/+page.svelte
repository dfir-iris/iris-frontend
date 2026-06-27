<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { Plus, ShieldAlert, Search, Radio, Moon, Archive } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { safeHexColor } from '$lib/utils/color';
	import {
		WarRoomsService,
		type WarRoom,
		type WarRoomState
	} from '$lib/services/war-rooms.service';

	const userCtx = getContext<UserCtx>(USER_CTX);

	let rooms = $state<WarRoom[]>([]);
	let loading = $state(true);
	let stateFilter = $state<WarRoomState | ''>('');
	let search = $state('');

	let createOpen = $state(false);
	let creating = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let newColor = $state('#dc2626');

	const canCreate = $derived(userCtx.can('war_rooms_create'));

	const stateChips: { label: string; value: WarRoomState | ''; icon: typeof ShieldAlert }[] = [
		{ label: 'All', value: '', icon: Search },
		{ label: 'Open', value: 'open', icon: ShieldAlert },
		{ label: 'Active', value: 'active', icon: Radio },
		{ label: 'Standby', value: 'standby', icon: Moon },
		{ label: 'Closed', value: 'closed', icon: Archive }
	];

	const load = async () => {
		loading = true;
		const res = await WarRoomsService.list({
			state: stateFilter || undefined,
			search: search.trim() || undefined
		});
		if (res.ok && Array.isArray(res.data)) {
			rooms = res.data;
		}
		loading = false;
	};

	onMount(load);

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const onSearch = (value: string) => {
		search = value;
		if (searchTimer) clearTimeout(searchTimer);
		// Debounce the search so we don't flood the backend while the
		// operator types out a war-room name.
		searchTimer = setTimeout(load, 250);
	};

	const submitCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		creating = true;
		const res = await WarRoomsService.create({
			name,
			description: newDescription.trim() || null,
			color: newColor || null
		});
		creating = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			toast({ title: `War room "${(res.data as WarRoom).name}" created` });
			createOpen = false;
			newName = '';
			newDescription = '';
			goto(`/war-rooms/${(res.data as WarRoom).war_room_id}`);
		} else {
			toast({
				title: 'Could not create war room',
				description:
					typeof res.data === 'string'
						? res.data
						: res.error
							? res.error.message
							: 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const stateColor = (state: WarRoomState) => {
		switch (state) {
			case 'active':
				return 'bg-red-500/10 text-red-500 ring-red-500/30';
			case 'open':
				return 'bg-amber-500/10 text-amber-500 ring-amber-500/30';
			case 'standby':
				return 'bg-blue-500/10 text-blue-500 ring-blue-500/30';
			case 'closed':
				return 'bg-muted text-muted-foreground ring-border';
		}
	};
</script>

<div class="flex h-full w-full flex-col gap-4 p-6">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex items-center gap-3">
			<ShieldAlert class="h-7 w-7 text-red-500" />
			<div>
				<h1 class="text-2xl font-semibold leading-tight">War Rooms</h1>
				<p class="text-sm text-muted-foreground">
					Multi-case crisis-coordination workspaces.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={search}
					oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
					placeholder="Search by name or description"
					class="h-9 w-72 pl-7 text-sm"
				/>
			</div>
			{#if canCreate}
				<Button class="h-9" onclick={() => (createOpen = true)}>
					<Plus class="mr-1 h-4 w-4" /> New war room
				</Button>
			{/if}
		</div>
	</header>

	<div class="flex flex-wrap items-center gap-1.5">
		{#each stateChips as chip (chip.value)}
			{@const active = stateFilter === chip.value}
			<button
				type="button"
				class={[
					'flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
					active
						? 'border-primary bg-primary/10 text-primary'
						: 'border-border bg-card/40 text-muted-foreground hover:bg-muted/50'
				]}
				onclick={() => {
					stateFilter = chip.value;
					load();
				}}
			>
				<chip.icon class="h-3 w-3" />
				{chip.label}
			</button>
		{/each}
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{#each Array(3) as _}
					<Skeleton class="h-32 w-full" />
				{/each}
			</div>
		{:else if rooms.length === 0}
			<div class="flex h-full flex-col items-center justify-center gap-2 text-center">
				<ShieldAlert class="h-10 w-10 text-muted-foreground/50" />
				<p class="text-sm text-muted-foreground">No war rooms yet.</p>
				{#if canCreate}
					<Button variant="outline" onclick={() => (createOpen = true)}>
						<Plus class="mr-1 h-4 w-4" /> Create your first war room
					</Button>
				{/if}
			</div>
		{:else}
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{#each rooms as room (room.war_room_id)}
					<a
						href={`/war-rooms/${room.war_room_id}`}
						class="group flex h-full flex-col gap-2 rounded-lg border bg-card/50 p-4 transition-colors hover:bg-card"
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								{#if room.color}
									<span
										class="h-3 w-3 shrink-0 rounded-full"
										style={`background-color: ${room.color};`}
										aria-hidden="true"
									></span>
								{/if}
								<h2 class="truncate text-sm font-semibold">{room.name}</h2>
							</div>
							<span
								class={[
									'shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wider ring-1',
									stateColor(room.state)
								]}
							>
								{room.state}
							</span>
						</div>
						{#if room.description}
							<p class="line-clamp-2 text-xs text-muted-foreground">
								{room.description}
							</p>
						{/if}
						<div class="mt-auto flex items-center gap-3 text-2xs text-muted-foreground">
							{#if room.created_at}
								<span>Created {new Date(room.created_at).toLocaleDateString()}</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Dialog bind:open={createOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Create a war room</DialogTitle>
			<DialogDescription>
				Spin up a coordination workspace for a multi-case crisis. You can attach cases and
				invite members from inside the war room.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="war-room-name">
					Name
				</label>
				<Input
					id="war-room-name"
					value={newName}
					oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
					placeholder="e.g. Ransomware sweep 2026-06"
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="war-room-description">
					Description (optional)
				</label>
				<Input
					id="war-room-description"
					value={newDescription}
					oninput={(e) => (newDescription = (e.target as HTMLInputElement).value)}
					placeholder="Short context for responders"
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="war-room-color">
					Accent color
				</label>
				<input
					id="war-room-color"
					type="color"
					bind:value={newColor}
					class="mt-1 h-8 w-16 cursor-pointer rounded border bg-transparent p-0"
				/>
			</div>
		</div>

		<DialogFooter>
			<Button variant="ghost" onclick={() => (createOpen = false)} disabled={creating}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={creating || !newName.trim()}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
