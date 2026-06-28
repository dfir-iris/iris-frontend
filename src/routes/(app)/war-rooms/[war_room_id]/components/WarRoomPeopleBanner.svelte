<!--
  "Who's on the war" strip between the topbar and the tab nav.

  Design constraints learnt the hard way after two messy iterations:

    1. Avatars OVERLAP each other (Slack-style), not stack with rings.
       Each ring on every avatar was the source of the previous rainbow
       look. Now we use one shared 2px white/card-coloured separator
       between overlapping avatars and that's it.
    2. Show FEW avatars (max 6) at this size; the popover is where the
       full list lives. The strip is a glanceable summary, not the
       directory.
    3. Role signal is one tiny indicator next to the count, not a halo
       per avatar.
    4. Click `+N` opens the popover; hovering any avatar pops a
       Tooltip *instantly* (no 300ms wait).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Crown, Search, Users } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Popover from '$lib/components/ui/popover';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import {
		WarRoomsService,
		type WarRoomPerson
	} from '$lib/services/war-rooms.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let people = $state<WarRoomPerson[]>([]);
	let loading = $state(true);
	let lastLoadedId: number | null = null;
	let listOpen = $state(false);
	let listFilter = $state('');

	const load = async () => {
		if (!warRoomId) return;
		loading = true;
		const res = await WarRoomsService.listPeople(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			people = res.data;
		}
		loading = false;
	};

	$effect(() => {
		if (warRoomId !== lastLoadedId) {
			lastLoadedId = warRoomId;
			void load();
		}
	});

	onMount(load);

	// Keep the avatar count tight. Six is enough to communicate "there
	// are several people here"; the popover behind `+N` does the heavy
	// lifting when the operator wants the actual roster.
	const MAX_VISIBLE = 6;
	const visible = $derived(people.slice(0, MAX_VISIBLE));
	const overflow = $derived(Math.max(0, people.length - MAX_VISIBLE));

	type PersonClass = 'lead' | 'member' | 'owner' | 'access';

	const classify = (p: WarRoomPerson): PersonClass => {
		if (p.is_member && p.role === 'lead') return 'lead';
		if (p.is_member) return 'member';
		if (p.is_owner) return 'owner';
		return 'access';
	};

	const roleLabel = (p: WarRoomPerson) => {
		if (p.is_member && p.role) return p.role;
		if (p.is_owner) return 'case owner';
		return 'case access';
	};

	const memberCount = $derived(people.filter((p) => p.is_member).length);
	const leadCount = $derived(
		people.filter((p) => p.is_member && p.role === 'lead').length
	);
	const ownerCount = $derived(
		people.filter((p) => p.is_owner && !p.is_member).length
	);
	const accessCount = $derived(
		people.filter((p) => !p.is_member && !p.is_owner).length
	);

	const filteredPeople = $derived.by(() => {
		const needle = listFilter.trim().toLowerCase();
		if (!needle) return people;
		return people.filter(
			(p) =>
				(p.name ?? '').toLowerCase().includes(needle) ||
				(p.login ?? '').toLowerCase().includes(needle) ||
				(p.email ?? '').toLowerCase().includes(needle)
		);
	});

	const groupedForPopover = $derived.by(() => {
		const groups: { label: string; rows: WarRoomPerson[] }[] = [];
		const push = (label: string, predicate: (p: WarRoomPerson) => boolean) => {
			const rows = filteredPeople.filter(predicate);
			if (rows.length) groups.push({ label, rows });
		};
		push('Leads', (p) => p.is_member && p.role === 'lead');
		push('Members', (p) => p.is_member && p.role !== 'lead');
		push('Case owners', (p) => !p.is_member && p.is_owner);
		push('Case access', (p) => !p.is_member && !p.is_owner);
		return groups;
	});
</script>

<div
	class="flex shrink-0 items-center gap-3 border-b bg-card/40 px-4 py-1.5"
	aria-label="People on this war room"
>
	<div class="flex shrink-0 items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
		<Users class="h-3 w-3" />
		On the war
		{#if !loading}
			<span class="text-foreground tabular-nums">({people.length})</span>
		{/if}
	</div>

	{#if loading}
		<div class="flex items-center gap-1.5">
			{#each Array(5) as _}
				<Skeleton class="h-6 w-6 rounded-full" />
			{/each}
		</div>
	{:else if people.length === 0}
		<p class="text-2xs text-muted-foreground">
			No-one yet — add members or attach cases.
		</p>
	{:else}
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<!--
			  Overlapping avatar strip. The single shared ring is on the
			  CONTAINER's children via `[&>*]:ring-2 [&>*]:ring-card` —
			  that gives each avatar exactly one card-coloured separator
			  ring against its neighbours, no rainbow ring stack.
			-->
			<TooltipProvider delayDuration={0}>
				<div class="flex items-center -space-x-1.5 [&>div]:ring-2 [&>div]:ring-card">
					{#each visible as p (p.user_id)}
						{@const cls = classify(p)}
						<Tooltip>
							<TooltipTrigger>
								<div
									class="relative rounded-full transition-transform hover:z-10 hover:scale-110"
								>
									<UserAvatar
										userId={p.user_id}
										name={p.name || p.login}
										size="size-6"
									/>
									{#if cls === 'lead'}
										<!-- Tiny crown for the IC. No tinted ring, no
										     halo — just one glyph in the corner. -->
										<Crown
											class="absolute -right-1 -top-1.5 h-2.5 w-2.5 fill-amber-400 text-amber-600 drop-shadow"
										/>
									{/if}
								</div>
							</TooltipTrigger>
							<TooltipContent side="bottom" align="start" class="max-w-xs">
								<p class="text-xs font-semibold">{p.name || p.login}</p>
								<p class="text-2xs text-muted-foreground">
									@{p.login} · {roleLabel(p)}
								</p>
								{#if p.case_ids.length > 0}
									<p class="mt-0.5 text-2xs text-muted-foreground">
										Access to {p.case_ids.length} case{p.case_ids.length === 1
											? ''
											: 's'}
									</p>
								{/if}
							</TooltipContent>
						</Tooltip>
					{/each}
				</div>
			</TooltipProvider>

			{#if overflow > 0}
				<Popover.Root bind:open={listOpen}>
					<Popover.Trigger
						class="ml-1 flex h-6 shrink-0 items-center justify-center rounded-full border bg-muted px-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
						aria-label={`Show all ${people.length} people on the war`}
					>
						+{overflow}
					</Popover.Trigger>
					<Popover.Content
						align="start"
						side="bottom"
						class="w-80 p-0"
					>
						<div class="border-b px-3 py-2">
							<p class="text-xs font-semibold">On the war ({people.length})</p>
							<p class="text-2xs text-muted-foreground">
								{memberCount} member{memberCount === 1 ? '' : 's'}
								{#if ownerCount > 0}
									· {ownerCount} owner{ownerCount === 1 ? '' : 's'}
								{/if}
								{#if accessCount > 0}
									· {accessCount} case-access
								{/if}
							</p>
						</div>
						<div class="border-b px-3 py-2">
							<div class="relative">
								<Search
									class="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									value={listFilter}
									oninput={(e) =>
										(listFilter = (e.target as HTMLInputElement).value)}
									placeholder="Search name, login, email"
									class="h-7 pl-7 text-xs"
								/>
							</div>
						</div>
						<div class="max-h-80 overflow-y-auto py-1">
							{#if groupedForPopover.length === 0}
								<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
									No matches.
								</p>
							{:else}
								{#each groupedForPopover as group (group.label)}
									<p class="mt-1 px-3 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
										{group.label}
										<span class="ml-1 tabular-nums">({group.rows.length})</span>
									</p>
									<ul class="flex flex-col">
										{#each group.rows as p (p.user_id)}
											{@const cls = classify(p)}
											<li
												class="flex items-center gap-2 px-3 py-1 hover:bg-muted/40"
											>
												<div class="relative shrink-0">
													<UserAvatar
														userId={p.user_id}
														name={p.name || p.login}
														size="size-6"
													/>
													{#if cls === 'lead'}
														<Crown
															class="absolute -right-1 -top-1.5 h-2.5 w-2.5 fill-amber-400 text-amber-600"
														/>
													{/if}
												</div>
												<div class="min-w-0 flex-1">
													<p class="truncate text-xs font-medium">
														{p.name || p.login}
													</p>
													<p class="truncate text-2xs text-muted-foreground">
														@{p.login} ·
														{#if p.case_ids.length > 0}
															{p.case_ids.length} case{p.case_ids.length === 1
																? ''
																: 's'}
														{:else}
															{roleLabel(p)}
														{/if}
													</p>
												</div>
											</li>
										{/each}
									</ul>
								{/each}
							{/if}
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}

			<!--
			  Right-edge breakdown: thin counters by relationship. Lives
			  on lg+ to avoid wrapping on narrow viewports. No coloured
			  dots — they were doing the same job as the rings and
			  contributed to the previous mess.
			-->
			<div class="ml-auto hidden flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground lg:flex">
				{#if leadCount > 0}
					<span class="inline-flex items-center gap-1">
						<Crown class="h-2.5 w-2.5 fill-amber-400 text-amber-600" />
						<span class="tabular-nums">
							{leadCount} lead{leadCount === 1 ? '' : 's'}
						</span>
					</span>
				{/if}
				{#if memberCount - leadCount > 0}
					<span class="tabular-nums">
						{memberCount - leadCount} member{memberCount - leadCount === 1
							? ''
							: 's'}
					</span>
				{/if}
				{#if ownerCount > 0}
					<span class="tabular-nums">
						{ownerCount} owner{ownerCount === 1 ? '' : 's'}
					</span>
				{/if}
				{#if accessCount > 0}
					<span class="tabular-nums">
						{accessCount} access
					</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
