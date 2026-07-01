<!--
  Compact "people on this war" inline strip.

  Lives inside `WarRoomTopbar`'s metadata row (next to "Created on") so
  the operator gets a roster summary without burning a second header
  row. Hovering the strip peeks the full grouped list (Leads / Members /
  Case owners / Case access) with a search box; the peek auto-dismisses
  once the cursor leaves the panel. Clicking the strip *commits* the
  popover open — from that point the panel stays open until dismissed
  explicitly (X, Escape, click-outside, or a second click on the strip),
  which is what the user needs when they actually want to read the list
  or type into the search field without the popover snapping shut.

  Design notes (kept from the earlier banner version):
    1. Avatars OVERLAP each other (Slack-style) with one shared
       card-coloured ring as the separator.
    2. At most 5 avatars in the strip; `+N` opens the popover with the
       full list.
    3. Lead role is signalled by a tiny crown on the avatar — no
       coloured rings / halos.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Crown, Search, X } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Popover from '$lib/components/ui/popover';
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

	// Tight cap: the strip is a summary, the popover is the directory.
	const MAX_VISIBLE = 5;
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

	// Two-mode open state:
	//   * "peek"   — opened by hovering the trigger; auto-closes on
	//                mouseleave (with a short grace period so the cursor
	//                can travel from trigger to content).
	//   * "commit" — opened by clicking, or by the cursor entering the
	//                content panel. Only closes on explicit dismissal
	//                (X, Escape, click-outside, or a second click on
	//                the trigger).
	// Once committed, mouseleave does NOT close the popover — otherwise
	// the user can't reach the X or the search input without the panel
	// snapping shut.
	let closeTimer: ReturnType<typeof setTimeout> | null = null;
	let reopenLockUntil = 0;
	let committed = $state(false);
	const clearCloseTimer = () => {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	};
	// After an explicit dismiss the portalled content unmounts and the
	// browser fires mouseenter on whatever is now the topmost element
	// under the cursor — which, since the trigger sits directly under the
	// popover, is the trigger itself. Without this lockout the popover
	// reopens instantly and the X, Escape, click-outside all appear to do
	// nothing. Using `performance.now()` keeps this SSR-safe.
	const inReopenLockout = () =>
		typeof performance !== 'undefined' && performance.now() < reopenLockUntil;
	const openHover = () => {
		if (inReopenLockout()) return;
		clearCloseTimer();
		listOpen = true;
	};
	const scheduleClose = () => {
		if (committed) return;
		clearCloseTimer();
		closeTimer = setTimeout(() => {
			listOpen = false;
			closeTimer = null;
		}, 120);
	};
	// Any pointer-down inside the panel commits — the user is
	// interacting, so we're past the peek phase.
	const commitOnEnter = () => {
		if (inReopenLockout()) return;
		clearCloseTimer();
		committed = true;
		listOpen = true;
	};
	// Click on the trigger toggles: if already open, dismiss; otherwise
	// commit-open. This lets a user click the strip to close the
	// popover without having to reach for the X.
	const toggleCommit = () => {
		clearCloseTimer();
		if (listOpen) {
			dismiss();
		} else {
			committed = true;
			listOpen = true;
		}
	};
	const dismiss = () => {
		committed = false;
		listOpen = false;
		clearCloseTimer();
		if (typeof performance !== 'undefined') {
			// 400ms is comfortably longer than the popover close animation
			// (~150ms) and any synthetic mouseenter that fires as the
			// portal unmounts, but short enough that a deliberate re-hover
			// still opens the popover as usual.
			reopenLockUntil = performance.now() + 400;
		}
	};

	// Reset the committed flag whenever the popover fully closes so the
	// next hover-open behaves the same as the first.
	$effect(() => {
		if (!listOpen) committed = false;
	});
</script>

<Popover.Root bind:open={listOpen}>
	<Popover.Trigger
		class="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		aria-label={`${people.length} people on this war room`}
		onmouseenter={openHover}
		onmouseleave={scheduleClose}
		onfocus={openHover}
		onclick={(e) => {
			// Prevent Popover.Trigger's built-in toggle so our
			// committed-state toggle wins (otherwise the two flips cancel
			// and the popover state never changes on click).
			e.preventDefault();
			toggleCommit();
		}}
	>
		{#if loading}
			<div class="flex items-center -space-x-1.5">
				{#each Array(3) as _}
					<Skeleton class="h-5 w-5 rounded-full" />
				{/each}
			</div>
		{:else if people.length === 0}
			<span>No people yet</span>
		{:else}
			<!--
			  Overlapping avatar strip. Shared card-coloured separator
			  ring via `[&>div]:ring-2 [&>div]:ring-card`.
			-->
			<div class="flex items-center -space-x-1.5 [&>div]:ring-2 [&>div]:ring-card">
				{#each visible as p (p.user_id)}
					{@const cls = classify(p)}
					<div class="relative rounded-full">
						<UserAvatar
							userId={p.user_id}
							name={p.name || p.login}
							size="size-5"
						/>
						{#if cls === 'lead'}
							<Crown
								class="absolute -right-1 -top-1 h-2 w-2 fill-amber-400 text-amber-600 drop-shadow"
							/>
						{/if}
					</div>
				{/each}
				{#if overflow > 0}
					<div
						class="flex h-5 min-w-5 items-center justify-center rounded-full border bg-muted px-1 text-[10px] font-medium tabular-nums"
						aria-label={`+${overflow} more`}
					>
						+{overflow}
					</div>
				{/if}
			</div>

			<!-- Inline role breakdown. Hidden on narrow viewports so the
			     strip can shrink to just avatars. -->
			<span class="hidden items-center gap-2 lg:inline-flex">
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
					<span class="tabular-nums">{accessCount} access</span>
				{/if}
			</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content
		align="start"
		side="bottom"
		class="w-80 p-0"
		onmouseenter={commitOnEnter}
		onEscapeKeydown={dismiss}
		onInteractOutside={dismiss}
	>
		<div class="flex items-start justify-between gap-2 border-b px-3 py-2">
			<div class="min-w-0">
				<p class="text-xs font-semibold">{people.length} on this war room</p>
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
			<Popover.Close
				class="-mr-1 -mt-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				onclick={dismiss}
				aria-label="Close"
				title="Close (Esc)"
			>
				<X class="h-3.5 w-3.5" />
			</Popover.Close>
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
