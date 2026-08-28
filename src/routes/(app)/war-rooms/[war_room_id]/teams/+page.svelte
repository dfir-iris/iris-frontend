<!--
  War-room teams. Teams are @-mention targets scoped to the war room —
  every war-room member can see and @ any team, but only users added to
  a team receive notifications when it is mentioned.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Search, Users } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
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
	import { WarRoomTeamsService, type WarRoomTeam } from '$lib/services/war-room-teams.service';
	import { WarRoomsService, type WarRoomMember } from '$lib/services/war-rooms.service';
	import { UsersService, type User } from '$lib/services/users.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let teams = $state<WarRoomTeam[]>([]);
	let members = $state<WarRoomMember[]>([]);
	let allUsers = $state<User[]>([]);
	let loading = $state(true);

	// Create-team dialog
	let createOpen = $state(false);
	let creating = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let newColor = $state<string>('#3b82f6');

	// Add-member dialog
	let addMemberOpen = $state(false);
	let addingMember = $state(false);
	let addTargetTeam = $state<WarRoomTeam | null>(null);
	let memberSearch = $state('');
	let selectedUserId = $state<number | null>(null);

	// Expansion — which team's members are open.
	let expanded = $state<Set<number>>(new Set());

	const load = async () => {
		loading = true;
		const [teamsRes, membersRes, usersRes] = await Promise.all([
			WarRoomTeamsService.list(warRoomId),
			WarRoomsService.listMembers(warRoomId),
			UsersService.list()
		]);
		if (teamsRes.ok && Array.isArray(teamsRes.data)) {
			teams = teamsRes.data;
		}
		if (membersRes.ok && Array.isArray(membersRes.data)) {
			members = membersRes.data;
		}
		if (usersRes.ok && usersRes.data && typeof usersRes.data !== 'string') {
			const payload = usersRes.data as { data?: User[] };
			allUsers = Array.isArray(payload.data) ? payload.data : [];
		}
		loading = false;
	};

	onMount(() => {
		load();
	});

	const memberById = $derived(new Map(members.map((m) => [m.user_id, m])));

	const toggleExpand = (teamId: number) => {
		const next = new Set(expanded);
		if (next.has(teamId)) next.delete(teamId);
		else next.add(teamId);
		expanded = next;
	};

	const openCreate = () => {
		newName = '';
		newDescription = '';
		newColor = '#3b82f6';
		createOpen = true;
	};

	const submitCreate = async () => {
		if (!newName.trim()) return;
		creating = true;
		const res = await WarRoomTeamsService.create(warRoomId, {
			name: newName.trim(),
			description: newDescription.trim() || null,
			color: newColor || null
		});
		creating = false;
		if (res.ok) {
			toast({ title: 'Team created' });
			createOpen = false;
			load();
		} else {
			toast({ title: 'Could not create team', variant: 'destructive' });
		}
	};

	const removeTeam = async (t: WarRoomTeam) => {
		if (!confirm(`Delete team "${t.name}"?`)) return;
		const res = await WarRoomTeamsService.remove(warRoomId, t.team_id);
		if (res.ok) {
			teams = teams.filter((x) => x.team_id !== t.team_id);
		} else {
			toast({ title: 'Could not delete team', variant: 'destructive' });
		}
	};

	const openAddMember = (t: WarRoomTeam) => {
		addTargetTeam = t;
		memberSearch = '';
		selectedUserId = null;
		addMemberOpen = true;
	};

	// Room-member lookup for the "not a war-room member yet — will be
	// added as responder" hint in the add-member dialog.
	const roomMemberIds = $derived(new Set(members.map((m) => m.user_id)));

	type UserCandidate = {
		user_id: number;
		user_login: string;
		user_name: string;
		is_room_member: boolean;
	};

	const memberCandidates = $derived.by<UserCandidate[]>(() => {
		if (!addTargetTeam) return [];
		const already = new Set(addTargetTeam.member_ids ?? []);
		const needle = memberSearch.trim().toLowerCase();
		return allUsers
			.filter((u) => !already.has(u.user_id))
			.filter((u) => {
				if (!needle) return true;
				return (
					u.user_login.toLowerCase().includes(needle) || u.user_name.toLowerCase().includes(needle)
				);
			})
			.map((u) => ({
				user_id: u.user_id,
				user_login: u.user_login,
				user_name: u.user_name,
				is_room_member: roomMemberIds.has(u.user_id)
			}))
			.slice(0, 40);
	});

	const selectedCandidate = $derived(
		memberCandidates.find((c) => c.user_id === selectedUserId) ?? null
	);

	const submitAddMember = async () => {
		if (!addTargetTeam || selectedUserId == null) return;
		addingMember = true;
		const res = await WarRoomTeamsService.addMember(
			warRoomId,
			addTargetTeam.team_id,
			selectedUserId
		);
		addingMember = false;
		if (res.ok) {
			const autoAdded =
				res.data &&
				typeof res.data !== 'string' &&
				(res.data as { auto_added_room_member?: boolean }).auto_added_room_member;
			if (autoAdded) {
				toast({
					title: 'Member added',
					description: 'Also joined the war room as responder.'
				});
			} else {
				toast({ title: 'Member added' });
			}
			addMemberOpen = false;
			load();
		} else {
			toast({ title: 'Could not add member', variant: 'destructive' });
		}
	};

	const removeMember = async (t: WarRoomTeam, userId: number) => {
		const label = memberById.get(userId)?.user_name ?? `#${userId}`;
		if (!confirm(`Remove ${label} from team "${t.name}"?`)) return;
		const res = await WarRoomTeamsService.removeMember(warRoomId, t.team_id, userId);
		if (res.ok) {
			load();
		} else {
			toast({ title: 'Could not remove team member', variant: 'destructive' });
		}
	};
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Teams</h2>
			<p class="text-xs text-muted-foreground">
				Group members together and @-mention the group in chat, notes, and tasks. Every member of a
				mentioned team gets notified.
			</p>
		</div>
		<Button onclick={openCreate}>
			<Plus class="mr-1 h-4 w-4" /> New team
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if teams.length === 0}
		<p class="text-sm text-muted-foreground">
			No teams yet. Create one to start grouping people for @-mentions.
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each teams as t (t.team_id)}
				{@const memberIds = t.member_ids ?? []}
				{@const isOpen = expanded.has(t.team_id)}
				<li class="rounded-md border bg-card/40">
					<div class="flex items-center gap-3 px-3 py-2">
						<span
							class="inline-block h-3 w-3 shrink-0 rounded-full border"
							style={t.color ? `background-color: ${t.color}` : ''}
							aria-hidden="true"
						></span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium">@{t.name}</span>
								<span class="text-2xs text-muted-foreground">
									{memberIds.length} member{memberIds.length === 1 ? '' : 's'}
								</span>
							</div>
							{#if t.description}
								<div class="truncate text-xs text-muted-foreground">
									{t.description}
								</div>
							{/if}
						</div>
						<Button variant="ghost" size="sm" onclick={() => toggleExpand(t.team_id)}>
							<Users class="mr-1 h-3.5 w-3.5" />
							{isOpen ? 'Hide' : 'Show'}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => openAddMember(t)}>
							<Plus class="mr-1 h-3.5 w-3.5" /> Add
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="h-7 w-7 text-destructive hover:text-destructive"
							onclick={() => removeTeam(t)}
							aria-label="Delete team"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
					{#if isOpen}
						<div class="border-t px-3 py-2">
							{#if memberIds.length === 0}
								<p class="text-xs text-muted-foreground">
									No members. Add someone with the Add button above.
								</p>
							{:else}
								<ul class="flex flex-wrap gap-1.5">
									{#each memberIds as uid (uid)}
										{@const m = memberById.get(uid)}
										<li
											class="flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 text-xs"
										>
											<span class="truncate">
												{m ? m.user_name : `#${uid}`}
											</span>
											<button
												type="button"
												class="text-muted-foreground hover:text-destructive"
												onclick={() => removeMember(t, uid)}
												aria-label="Remove from team"
											>
												<Trash2 class="h-3 w-3" />
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Dialog bind:open={createOpen}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>New team</DialogTitle>
			<DialogDescription>
				Teams are per-war-room. Their name is what people type after @.
			</DialogDescription>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="team-name"> Name </label>
				<Input
					id="team-name"
					value={newName}
					oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
					placeholder="e.g. ir-leads"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="team-description">
					Description
				</label>
				<Textarea
					id="team-description"
					value={newDescription}
					oninput={(e) => (newDescription = (e.target as HTMLTextAreaElement).value)}
					placeholder="Optional — who's in this team, what they own"
					rows={2}
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="team-color"> Color </label>
				<input
					id="team-color"
					type="color"
					bind:value={newColor}
					class="h-9 w-16 rounded-md border bg-background"
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

<Dialog bind:open={addMemberOpen}>
	<DialogContent class="sm:max-w-lg">
		<DialogHeader>
			<DialogTitle>
				Add member to @{addTargetTeam?.name ?? ''}
			</DialogTitle>
			<DialogDescription>
				Users who aren't already in this war room will be added as
				<span class="font-medium">responder</span> automatically.
			</DialogDescription>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={memberSearch}
					oninput={(e) => (memberSearch = (e.target as HTMLInputElement).value)}
					placeholder="Search by login or name"
					class="pl-7"
				/>
			</div>
			<div class="max-h-56 overflow-y-auto rounded-md border">
				{#if memberCandidates.length === 0}
					<div class="p-3 text-center text-xs text-muted-foreground">No matching users.</div>
				{:else}
					<ul>
						{#each memberCandidates as m (m.user_id)}
							{@const selected = selectedUserId === m.user_id}
							<li>
								<button
									type="button"
									class={[
										'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
										selected ? 'bg-primary/10' : 'hover:bg-muted/50'
									]}
									onclick={() => (selectedUserId = m.user_id)}
								>
									<span class="flex-1 truncate">{m.user_name}</span>
									<span class="text-2xs text-muted-foreground">
										@{m.user_login}
									</span>
									{#if !m.is_room_member}
										<span
											class="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300"
											title="This user is not in the war room yet — adding them will also add them as responder."
										>
											Not in war room
										</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			{#if selectedCandidate && !selectedCandidate.is_room_member}
				<p
					class="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-2xs text-amber-800 dark:text-amber-300"
				>
					{selectedCandidate.user_name} isn't a war-room member yet. Adding them to this team will also
					add them to the war room as
					<span class="font-medium">responder</span>.
				</p>
			{/if}
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (addMemberOpen = false)} disabled={addingMember}>
				Cancel
			</Button>
			<Button onclick={submitAddMember} disabled={addingMember || selectedUserId == null}>
				{addingMember ? 'Adding…' : 'Add'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
