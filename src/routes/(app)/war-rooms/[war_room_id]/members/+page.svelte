<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Search, Crown } from 'lucide-svelte';
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
	import {
		WarRoomsService,
		type WarRoomMember,
		type WarRoomMemberRole
	} from '$lib/services/war-rooms.service';
	import { UsersService, type User } from '$lib/services/users.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let members = $state<WarRoomMember[]>([]);
	let loading = $state(true);

	let addOpen = $state(false);
	let adding = $state(false);
	let userSearch = $state('');
	let allUsers = $state<User[]>([]);
	let selectedUserId = $state<number | null>(null);
	let selectedRole = $state<WarRoomMemberRole>('responder');
	// Access level: 2 = read_only, 4 = full_access.
	let selectedAccess = $state<number>(4);

	const load = async () => {
		loading = true;
		const res = await WarRoomsService.listMembers(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			members = res.data;
		}
		loading = false;
	};

	const loadUsers = async () => {
		const res = await UsersService.list();
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as { data?: User[] };
			allUsers = Array.isArray(payload.data) ? payload.data : [];
		}
	};

	onMount(() => {
		load();
		loadUsers();
	});

	const candidates = $derived.by(() => {
		const have = new Set(members.map((m) => m.user_id));
		const needle = userSearch.trim().toLowerCase();
		return allUsers
			.filter((u) => !have.has(u.user_id))
			.filter((u) => {
				if (!needle) return true;
				return (
					u.user_login.toLowerCase().includes(needle) ||
					u.user_name.toLowerCase().includes(needle)
				);
			})
			.slice(0, 40);
	});

	const openAdd = () => {
		userSearch = '';
		selectedUserId = null;
		selectedRole = 'responder';
		selectedAccess = 4;
		addOpen = true;
	};

	const submitAdd = async () => {
		if (selectedUserId == null) return;
		adding = true;
		const res = await WarRoomsService.addMember(warRoomId, {
			user_id: selectedUserId,
			role: selectedRole,
			access_level: selectedAccess
		});
		adding = false;
		if (res.ok) {
			toast({ title: 'Member added' });
			addOpen = false;
			load();
		} else {
			toast({ title: 'Could not add member', variant: 'destructive' });
		}
	};

	const remove = async (m: WarRoomMember) => {
		if (!confirm(`Remove ${m.user_name} from the war room?`)) return;
		const res = await WarRoomsService.removeMember(warRoomId, m.user_id);
		if (res.ok) {
			members = members.filter((x) => x.user_id !== m.user_id);
		} else {
			toast({ title: 'Could not remove member', variant: 'destructive' });
		}
	};
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Members</h2>
			<p class="text-xs text-muted-foreground">
				People with access to this war room. Leads coordinate, responders execute,
				observers watch.
			</p>
		</div>
		<Button onclick={openAdd}>
			<Plus class="mr-1 h-4 w-4" /> Add member
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-12 w-full" />
			{/each}
		</div>
	{:else if members.length === 0}
		<p class="text-sm text-muted-foreground">No members yet.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each members as m (m.user_id)}
				<li class="flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							{#if m.role === 'lead'}
								<Crown class="h-3.5 w-3.5 text-amber-500" />
							{/if}
							<span class="truncate text-sm font-medium">{m.user_name}</span>
							<span class="text-2xs text-muted-foreground">@{m.user_login}</span>
						</div>
					</div>
					<span
						class="shrink-0 rounded border bg-muted/60 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-muted-foreground"
					>
						{m.role}
					</span>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 text-destructive hover:text-destructive"
						onclick={() => remove(m)}
						aria-label="Remove member"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Dialog bind:open={addOpen}>
	<DialogContent class="sm:max-w-lg">
		<DialogHeader>
			<DialogTitle>Add member</DialogTitle>
			<DialogDescription>
				Adding a member grants them ACL access to the war room.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-col gap-3 py-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={userSearch}
					oninput={(e) => (userSearch = (e.target as HTMLInputElement).value)}
					placeholder="Search by login or name"
					class="pl-7"
				/>
			</div>

			<div class="max-h-56 overflow-y-auto rounded-md border">
				{#if candidates.length === 0}
					<div class="p-3 text-center text-xs text-muted-foreground">
						No matching users.
					</div>
				{:else}
					<ul>
						{#each candidates as u (u.user_id)}
							{@const selected = selectedUserId === u.user_id}
							<li>
								<button
									type="button"
									class={[
										'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
										selected ? 'bg-primary/10' : 'hover:bg-muted/50'
									]}
									onclick={() => (selectedUserId = u.user_id)}
								>
									<span class="flex-1 truncate">{u.user_name}</span>
									<span class="text-2xs text-muted-foreground">@{u.user_login}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="text-xs font-medium text-muted-foreground" for="role">Role</label>
					<select
						id="role"
						bind:value={selectedRole}
						class="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
					>
						<option value="lead">Lead</option>
						<option value="responder">Responder</option>
						<option value="observer">Observer</option>
					</select>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground" for="access">
						Access
					</label>
					<select
						id="access"
						bind:value={selectedAccess}
						class="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
					>
						<option value={2}>Read only</option>
						<option value={4}>Full access</option>
					</select>
				</div>
			</div>
		</div>

		<DialogFooter>
			<Button variant="ghost" onclick={() => (addOpen = false)} disabled={adding}>
				Cancel
			</Button>
			<Button onclick={submitAdd} disabled={adding || selectedUserId == null}>
				{adding ? 'Adding…' : 'Add'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
