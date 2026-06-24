<!--
  Per-user group-membership editor.

  Loads every group once on open (per_page=200, matches the
  realistic ceiling for any deployment) and shows them as a
  checkbox list. The current selection is initialised from the
  user's existing memberships.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { SearchIcon, XIcon } from 'lucide-svelte';
	import {
		AccessControlService,
		type AccessControlGroup,
		type AccessControlUser
	} from '$lib/services/access-control.service';

	type Props = {
		open: boolean;
		user: AccessControlUser;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (user: AccessControlUser) => void;
	};

	let { open = $bindable(), user, showError, onSaved }: Props = $props();

	let allGroups = $state<AccessControlGroup[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let selected = $state<Set<number>>(new Set());
	let filter = $state('');

	const visibleGroups = $derived.by<AccessControlGroup[]>(() => {
		const needle = filter.trim().toLowerCase();
		if (!needle) return allGroups;
		return allGroups.filter(
			(g) =>
				g.group_name.toLowerCase().includes(needle) ||
				(g.group_description ?? '').toLowerCase().includes(needle)
		);
	});

	$effect(() => {
		if (!open) return;
		// Re-hydrate selection on every open so an admin can flip the
		// dialog without leaking previous edits.
		selected = new Set((user.user_groups ?? []).map((g) => g.group_id));
		void load();
	});

	const load = async () => {
		loading = true;
		try {
			const res = await AccessControlService.searchGroups({ page: 1, per_page: 200 });
			if (res.ok && res.data && typeof res.data !== 'string') {
				allGroups = res.data.data;
			} else {
				showError(res.error?.message ?? 'Failed to load groups');
			}
		} finally {
			loading = false;
		}
	};

	const toggle = (id: number) => {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	};

	const submit = async () => {
		saving = true;
		try {
			const res = await AccessControlService.setUserGroups(user.user_id, [...selected]);
			if (res.ok && res.data && typeof res.data !== 'string') {
				onSaved(res.data as AccessControlUser);
				open = false;
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Save failed');
			}
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Group membership — @{user.user_login}</Dialog.Title>
			<Dialog.Description>
				Tick the groups the user should belong to. Group permissions are inherited at login.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-2 pt-2">
			<div class="relative">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Filter groups…"
					class="h-7 pl-7 pr-7 text-xs"
					bind:value={filter}
				/>
				{#if filter}
					<button
						type="button"
						class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
						aria-label="Clear"
						onclick={() => (filter = '')}
					>
						<XIcon size={11} />
					</button>
				{/if}
			</div>

			<div class="max-h-[50vh] overflow-y-auto rounded-md border">
				{#if loading}
					<div class="space-y-1 p-2">
						{#each Array(5) as _}
							<Skeleton class="h-6 w-full" />
						{/each}
					</div>
				{:else if visibleGroups.length === 0}
					<p class="px-3 py-4 text-center text-2xs text-muted-foreground">No groups match.</p>
				{:else}
					<ul class="divide-y">
						{#each visibleGroups as g (g.group_id)}
							<li>
								<label class="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30">
									<Checkbox
										checked={selected.has(g.group_id)}
										onCheckedChange={() => toggle(g.group_id)}
										disabled={saving}
									/>
									<div class="min-w-0 flex-1">
										<div class="truncate">{g.group_name}</div>
										{#if g.group_description}
											<div class="truncate text-2xs text-muted-foreground">
												{g.group_description}
											</div>
										{/if}
									</div>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submit} disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
