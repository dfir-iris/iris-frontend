<!--
  Horizontal "who's on the war" banner that lives between the topbar
  and the tab nav. Renders an avatar strip of every person involved:
  explicit war-room members, attached-case owners, and anyone with
  effective access to an attached case. Members get a role chip
  (lead / responder / observer); owners get a crown badge.

  Refreshes when the underlying war-room id changes (route swap). The
  data is read-only — the Members tab still owns add/remove flows.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Crown, Users } from 'lucide-svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
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

	const MAX_VISIBLE = 12;
	const visible = $derived(people.slice(0, MAX_VISIBLE));
	const overflow = $derived(Math.max(0, people.length - MAX_VISIBLE));

	const memberCount = $derived(people.filter((p) => p.is_member).length);
	const ownerCount = $derived(people.filter((p) => p.is_owner).length);
	const accessCount = $derived(
		people.filter((p) => !p.is_member && !p.is_owner).length
	);

	const roleLabel = (p: WarRoomPerson) => {
		if (p.is_member && p.role) return p.role;
		if (p.is_owner) return 'case owner';
		return 'case access';
	};
</script>

<div
	class="flex shrink-0 items-center gap-3 border-b bg-card/40 px-4 py-2"
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
				<Skeleton class="h-7 w-7 rounded-full" />
			{/each}
		</div>
	{:else if people.length === 0}
		<p class="text-2xs text-muted-foreground">
			No-one yet — add members or attach cases.
		</p>
	{:else}
		<div class="flex min-w-0 flex-1 items-center gap-1">
			<!--
			  Tight avatar strip with overlap. Each avatar is its own
			  tooltip trigger so the operator can hover to see name +
			  role + case-access count without leaving the topbar area.
			-->
			<div class="flex items-center -space-x-1.5">
				{#each visible as p (p.user_id)}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<div class="relative">
									<UserAvatar
										userId={p.user_id}
										name={p.name || p.login}
										size="size-7"
										class="ring-2 ring-card transition-transform hover:scale-110 hover:ring-primary/40"
									/>
									{#if p.is_member && p.role === 'lead'}
										<!-- Crown sits over the avatar so the IC is
										     unmistakable at a glance — same affordance the
										     Members tab uses. -->
										<Crown
											class="absolute -right-0.5 -top-1 h-3 w-3 fill-amber-400 text-amber-600 drop-shadow"
										/>
									{:else if p.is_owner && !p.is_member}
										<span
											class="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-white shadow"
											title="Case owner"
										>
											O
										</span>
									{/if}
								</div>
							</TooltipTrigger>
							<TooltipContent side="bottom" align="start" class="max-w-xs">
								<p class="text-xs font-semibold">{p.name || p.login}</p>
								<p class="text-2xs text-muted-foreground">
									@{p.login} · {roleLabel(p)}
								</p>
								{#if p.case_ids.length > 0}
									<p class="mt-1 text-2xs text-muted-foreground">
										Access to {p.case_ids.length} case{p.case_ids.length === 1
											? ''
											: 's'}: {p.case_ids
											.slice(0, 4)
											.map((id) => `#${id}`)
											.join(', ')}{p.case_ids.length > 4
											? ` + ${p.case_ids.length - 4} more`
											: ''}
									</p>
								{/if}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				{/each}
			</div>

			{#if overflow > 0}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<span
								class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-2xs font-medium text-muted-foreground"
							>
								+{overflow}
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom" align="start">
							<p class="text-2xs">{overflow} more people</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			{/if}

			<!-- Tiny breakdown legend on the right edge — helps the IC know
			     why every person is on the list at a glance. -->
			<div class="ml-auto hidden flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground md:flex">
				{#if memberCount > 0}
					<span class="tabular-nums">
						{memberCount} member{memberCount === 1 ? '' : 's'}
					</span>
				{/if}
				{#if ownerCount > 0}
					<span class="tabular-nums">
						{ownerCount} owner{ownerCount === 1 ? '' : 's'}
					</span>
				{/if}
				{#if accessCount > 0}
					<span class="tabular-nums">
						{accessCount} case-access
					</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
