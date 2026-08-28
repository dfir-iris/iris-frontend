<!--
  Per-group member editor.

  Loads every user once on open (per_page=200) and shows them as a
  checkbox list. Backend handles the in-place membership diff.
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
	import { DEMO_PROTECTED_USER_HINT as DEMO_LOCKED_HINT } from '$lib/services/user-context.service';

	type Props = {
		open: boolean;
		group: AccessControlGroup;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (group: AccessControlGroup) => void;
	};

	let { open = $bindable(), group, showError, onSaved }: Props = $props();

	let allUsers = $state<AccessControlUser[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let selected = $state<Set<number>>(new Set());
	let filter = $state('');

	const visible = $derived.by<AccessControlUser[]>(() => {
		const needle = filter.trim().toLowerCase();
		if (!needle) return allUsers;
		return allUsers.filter(
			(u) =>
				u.user_login.toLowerCase().includes(needle) || u.user_name.toLowerCase().includes(needle)
		);
	});

	$effect(() => {
		if (!open) return;
		selected = new Set((group.group_members ?? []).map((m) => m.id));
		void load();
	});

	const load = async () => {
		loading = true;
		try {
			const res = await AccessControlService.searchUsers({ page: 1, per_page: 200 });
			if (res.ok && res.data && typeof res.data !== 'string') {
				allUsers = res.data.data;
			} else {
				showError(res.error?.message ?? 'Failed to load users');
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
			const res = await AccessControlService.setGroupMembers(group.group_id, [...selected]);
			if (res.ok && res.data && typeof res.data !== 'string') {
				onSaved(res.data as AccessControlGroup);
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
			<Dialog.Title>Members — {group.group_name}</Dialog.Title>
			<Dialog.Description>Tick the users that should belong to this group.</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-2 pt-2">
			<div class="relative">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Filter users…"
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
				{:else if visible.length === 0}
					<p class="px-3 py-4 text-center text-2xs text-muted-foreground">No users match.</p>
				{:else}
					<ul class="divide-y">
						{#each visible as u (u.user_id)}
							{@const locked = !!u.user_is_demo_protected}
							<li>
								<!--
								  A demo account keeps whatever membership it was
								  seeded with: ticking or unticking it would rewrite
								  the permissions every visitor shares, and the API
								  refuses the whole save if the diff touches one.
								-->
								<label
									class="flex items-center gap-2 px-3 py-2 text-xs {locked
										? 'cursor-not-allowed opacity-60'
										: 'cursor-pointer hover:bg-muted/30'}"
									title={locked ? DEMO_LOCKED_HINT : undefined}
								>
									<Checkbox
										checked={selected.has(u.user_id)}
										onCheckedChange={() => toggle(u.user_id)}
										disabled={saving || locked}
									/>
									<div class="min-w-0 flex-1">
										<div class="truncate">{u.user_name}</div>
										<div class="truncate text-2xs text-muted-foreground">
											@{u.user_login}
										</div>
									</div>
									{#if locked}
										<span
											class="text-3xs shrink-0 rounded-sm border bg-muted/40 px-1.5 py-0 text-muted-foreground"
										>
											demo
										</span>
									{/if}
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
