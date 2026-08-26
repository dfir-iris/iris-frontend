<!--
  Users tab for the Access Control page.

  Layout: master/detail
    • LEFT (basis-1/3): paginated user list with debounced search +
      infinite scroll. Each row shows login + display name + active
      badge.
    • RIGHT (basis-2/3): the selected user's profile + a strip of
      action buttons that open per-concern modals — groups, customer
      access, case access, audit, MFA reset, API-key rotation.

  Modal management lives in this component (each modal binds its own
  `open` state) so the page-level layout stays tab-agnostic.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		FolderIcon,
		KeyRoundIcon,
		LockIcon,
		MoreHorizontalIcon,
		PencilIcon,
		PlusIcon,
		PowerIcon,
		PowerOffIcon,
		RefreshCwIcon,
		SearchIcon,
		ShieldQuestionIcon,
		Trash2Icon,
		UserCogIcon,
		UserIcon,
		UserPlusIcon,
		UsersIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		AccessControlService,
		type AccessControlSchemaInfo,
		type AccessControlUser
	} from '$lib/services/access-control.service';
	import UserEditDialog from './UserEditDialog.svelte';
	import UserGroupsDialog from './UserGroupsDialog.svelte';
	import UserCustomersDialog from './UserCustomersDialog.svelte';
	import UserCasesAccessDialog from './UserCasesAccessDialog.svelte';
	import UserAuditDialog from './UserAuditDialog.svelte';
	import UserApiKeyDialog from './UserApiKeyDialog.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import {
		DEMO_PROTECTED_USER_HINT as DEMO_LOCKED_HINT,
		demoLocksCredentials
	} from '$lib/services/user-context.service';

	type Props = {
		schema: AccessControlSchemaInfo;
		askConfirmation: (opts: {
			title: string;
			message: string;
			confirmText?: string;
			action: () => Promise<void> | void;
		}) => void;
		showError: (msg: string, fallback?: string) => void;
		showSuccess: (msg: string) => void;
	};

	let { schema, askConfirmation, showError, showSuccess }: Props = $props();

	const userCtx = getContext<UserCtx>(USER_CTX);
	// Demo mode switches MFA off wholesale, so there is no enrolment
	// to reset — the API refuses this call outright.
	const mfaLocked = $derived(demoLocksCredentials(userCtx.ctx));

	const PAGE_SIZE = 25;

	type ListState = {
		items: AccessControlUser[];
		total: number;
		nextPage: number | null;
		loading: boolean;
		loadingMore: boolean;
	};
	const emptyListState = (): ListState => ({
		items: [],
		total: 0,
		nextPage: 1,
		loading: false,
		loadingMore: false
	});

	let listState = $state<ListState>(emptyListState());
	let selectedId = $state<number | null>(null);
	const selected = $derived<AccessControlUser | null>(
		selectedId == null ? null : listState.items.find((u) => u.user_id === selectedId) ?? null
	);
	// The seeded demo accounts are shared between visitors and their
	// credentials are published on the landing page, so the API refuses
	// every write against them (`protect_demo_mode_user`). Greying the
	// controls out keeps the page honest instead of letting an admin
	// walk into a 403. Read-only actions (audit, recompute) stay live.
	const selectedLocked = $derived(!!selected?.user_is_demo_protected);

	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const currentSearch = () => searchValue.trim() || undefined;

	// Modal open flags
	let editOpen = $state(false);
	let editingUser = $state<AccessControlUser | null>(null); // null = create
	let groupsOpen = $state(false);
	let customersOpen = $state(false);
	let casesOpen = $state(false);
	let auditOpen = $state(false);
	let apiKeyOpen = $state(false);
	let apiKeyValue = $state<string | null>(null);

	// ---- Data loaders --------------------------------------------------
	const loadList = async () => {
		listState = { ...emptyListState(), loading: true };
		try {
			const res = await AccessControlService.searchUsers({
				page: 1,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: env.data,
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
				if (selectedId == null && env.data.length > 0) {
					selectedId = env.data[0].user_id;
				} else if (selectedId != null && !env.data.find((u) => u.user_id === selectedId)) {
					selectedId = null;
				}
			} else {
				showError(res.error?.message ?? 'Failed to load users');
				listState = { ...listState, loading: false };
			}
		} catch (e) {
			showError((e as Error).message);
			listState = { ...listState, loading: false };
		}
	};

	const loadMore = async () => {
		if (listState.loading || listState.loadingMore || listState.nextPage == null) return;
		listState = { ...listState, loadingMore: true };
		const page = listState.nextPage as number;
		try {
			const res = await AccessControlService.searchUsers({
				page,
				per_page: PAGE_SIZE,
				search: currentSearch()
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				const env = res.data;
				listState = {
					items: [...listState.items, ...env.data],
					total: env.total,
					nextPage: env.next_page,
					loading: false,
					loadingMore: false
				};
			} else {
				listState = { ...listState, loadingMore: false };
			}
		} catch {
			listState = { ...listState, loadingMore: false };
		}
	};

	let sentinel = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '120px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	const queueSearch = () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void loadList(), 250);
	};

	onMount(loadList);

	// Refresh the selected user's record after a sub-action. The
	// backend always returns the post-mutation projection so we just
	// patch the master list with what came back.
	const replaceUserInList = (updated: AccessControlUser) => {
		listState = {
			...listState,
			items: listState.items.map((u) => (u.user_id === updated.user_id ? updated : u))
		};
	};

	const refreshSelected = async () => {
		if (selectedId == null) return;
		const res = await AccessControlService.getUser(selectedId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			replaceUserInList(res.data as AccessControlUser);
		}
	};

	// ---- Row actions --------------------------------------------------
	const openAdd = () => {
		editingUser = null;
		editOpen = true;
	};

	const openEdit = (user: AccessControlUser) => {
		editingUser = user;
		editOpen = true;
	};

	const onEditSaved = (user: AccessControlUser) => {
		showSuccess(editingUser ? 'User updated' : 'User created');
		// On create, reload — the new user might be on a later page.
		if (editingUser == null) {
			void loadList();
			selectedId = user.user_id;
		} else {
			replaceUserInList(user);
		}
	};

	const toggleActive = (user: AccessControlUser) => {
		const action = user.user_active
			? AccessControlService.deactivateUser
			: AccessControlService.activateUser;
		askConfirmation({
			title: user.user_active ? `Deactivate ${user.user_login}?` : `Activate ${user.user_login}?`,
			message: user.user_active
				? 'The user will no longer be able to log in. Existing sessions stay valid until they expire.'
				: 'The user will be able to log in again. Their previous permissions and access remain intact.',
			confirmText: user.user_active ? 'Deactivate' : 'Activate',
			action: async () => {
				const res = await action(user.user_id);
				if (res.ok && res.data && typeof res.data !== 'string') {
					replaceUserInList(res.data as AccessControlUser);
					showSuccess(user.user_active ? 'User deactivated' : 'User activated');
				} else {
					showError(
						(res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Failed'
					);
				}
			}
		});
	};

	const renewApiKey = (user: AccessControlUser) => {
		askConfirmation({
			title: `Rotate API key for ${user.user_login}?`,
			message:
				'The current key stops working immediately. The new key is shown only once — make sure to copy it before closing the dialog.',
			confirmText: 'Rotate',
			action: async () => {
				const res = await AccessControlService.renewUserApiKey(user.user_id);
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as { api_key: string };
					apiKeyValue = payload.api_key;
					apiKeyOpen = true;
					showSuccess('API key rotated');
				} else {
					showError(
						(res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Failed'
					);
				}
			}
		});
	};

	const resetMfa = (user: AccessControlUser) => {
		askConfirmation({
			title: `Reset MFA for ${user.user_login}?`,
			message: 'The user will be prompted to set up MFA again on next login.',
			confirmText: 'Reset MFA',
			action: async () => {
				const res = await AccessControlService.resetUserMfa(user.user_id);
				if (res.ok) showSuccess('MFA reset');
				else
					showError(
						(res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Failed'
					);
			}
		});
	};

	const recomputeAccess = async (user: AccessControlUser) => {
		const res = await AccessControlService.recomputeUserAccess(user.user_id);
		if (res.ok) showSuccess('Effective access recomputed');
		else
			showError(
				(res.data as { message?: string } | null)?.message ?? res.error?.message ?? 'Failed'
			);
	};

	const removeUser = (user: AccessControlUser) => {
		askConfirmation({
			title: `Delete ${user.user_login}?`,
			message:
				'Removes the user record. The backend refuses if the user owns objects (comments, etc.) that would orphan.',
			confirmText: 'Delete',
			action: async () => {
				const res = await AccessControlService.deleteUser(user.user_id);
				if (res.ok) {
					showSuccess('User deleted');
					if (selectedId === user.user_id) selectedId = null;
					await loadList();
				} else {
					showError(
						(res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Failed'
					);
				}
			}
		});
	};
</script>

<div class="flex h-full gap-3 overflow-hidden p-4">
	<!-- Master list -->
	<section class="flex min-h-0 flex-1 basis-1/3 flex-col overflow-hidden rounded-md border">
		<div class="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Users
					</h2>
					<span class="text-2xs text-muted-foreground tabular-nums">
						{listState.items.length} / {listState.total}
					</span>
				</div>
				<Button size="sm" class="h-7" onclick={openAdd}>
					<UserPlusIcon size={12} class="mr-1" />
					Add user
				</Button>
			</div>

			<div class="relative">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Search by name or login…"
					class="h-7 pl-7 pr-7 text-xs"
					bind:value={searchValue}
					oninput={queueSearch}
				/>
				{#if searchValue}
					<button
						type="button"
						aria-label="Clear search"
						class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={() => {
							searchValue = '';
							queueSearch();
						}}
					>
						<XIcon size={11} />
					</button>
				{/if}
			</div>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if listState.loading && listState.items.length === 0}
				<div class="space-y-1 p-3">
					{#each Array(6) as _}
						<Skeleton class="h-7 w-full" />
					{/each}
				</div>
			{:else if listState.items.length === 0}
				<p class="px-3 py-6 text-center text-xs text-muted-foreground">
					No users match.
				</p>
			{:else}
				<ul class="divide-y">
					{#each listState.items as u (u.user_id)}
						{@const active = u.user_id === selectedId}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors
									{active
									? 'bg-primary/10 font-medium text-foreground'
									: 'hover:bg-muted/40'}"
								onclick={() => (selectedId = u.user_id)}
							>
								<UserIcon size={14} class="shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<div class="truncate">{u.user_name}</div>
									<div class="truncate text-2xs text-muted-foreground">
										@{u.user_login}
									</div>
								</div>
								{#if !u.user_active}
									<span class="shrink-0 rounded-sm border bg-muted/40 px-1.5 py-0 text-3xs text-muted-foreground">
										inactive
									</span>
								{/if}
								{#if u.user_is_service_account}
									<span class="shrink-0 rounded-sm border bg-amber-400/10 px-1.5 py-0 text-3xs text-amber-700 dark:text-amber-300">
										svc
									</span>
								{/if}
								{#if u.user_is_demo_protected}
									<span
										class="shrink-0 rounded-sm border bg-muted/40 px-1.5 py-0 text-3xs text-muted-foreground"
										title={DEMO_LOCKED_HINT}
									>
										demo
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>

				{#if listState.nextPage != null}
					<div
						bind:this={sentinel}
						class="flex items-center justify-center gap-2 border-t px-3 py-2 text-2xs text-muted-foreground"
					>
						{#if listState.loadingMore}
							<RefreshCwIcon size={11} class="animate-spin" />
							Loading more…
						{:else}
							<span class="opacity-0">Loading more…</span>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</section>

	<!-- Detail -->
	<section class="flex min-h-0 flex-1 basis-2/3 flex-col overflow-hidden rounded-md border">
		<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
			<div class="flex items-baseline gap-2">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					User
				</h2>
				{#if selected}
					<span class="text-2xs text-muted-foreground">@{selected.user_login}</span>
				{/if}
			</div>

			{#if selected}
				<div class="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						disabled={selectedLocked}
						title={selectedLocked ? DEMO_LOCKED_HINT : undefined}
						onclick={() => selected && openEdit(selected)}
					>
						<PencilIcon size={12} class="mr-1" />
						Edit profile
					</Button>
					<!--
					  Lower-frequency / destructive maintenance lives in
					  the dropdown — API key rotation, MFA reset,
					  deactivate, delete. Everything else has dedicated
					  buttons in the action bar below the metadata strip
					  so admins don't have to hunt for them.
					-->
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button variant="outline" size="sm" class="h-7">
								<MoreHorizontalIcon size={12} />
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="min-w-[200px]">
							<DropdownMenu.Item
								disabled={selectedLocked}
								onclick={() => selected && renewApiKey(selected)}
							>
								<KeyRoundIcon size={12} class="mr-2" />
								Rotate API key
							</DropdownMenu.Item>
							{#if !mfaLocked}
								<DropdownMenu.Item
									disabled={selectedLocked}
									onclick={() => selected && resetMfa(selected)}
								>
									<KeyRoundIcon size={12} class="mr-2" />
									Reset MFA
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								disabled={selectedLocked}
								onclick={() => selected && toggleActive(selected)}
							>
								{#if selected.user_active}
									<PowerOffIcon size={12} class="mr-2" />
									Deactivate
								{:else}
									<PowerIcon size={12} class="mr-2" />
									Activate
								{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								class="text-destructive focus:text-destructive"
								disabled={selectedLocked}
								onclick={() => selected && removeUser(selected)}
							>
								<Trash2Icon size={12} class="mr-2" />
								Delete user
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if !selected}
				<p class="px-3 py-10 text-center text-xs text-muted-foreground">
					Select a user on the left, or click <span class="font-medium">Add user</span> to create one.
				</p>
			{:else}
				{#if selectedLocked}
					<p
						class="flex items-start gap-2 border-b bg-muted/30 px-4 py-2 text-2xs text-muted-foreground"
					>
						<LockIcon size={12} class="mt-0.5 shrink-0" />
						<span>{DEMO_LOCKED_HINT}</span>
					</p>
				{/if}
				<dl class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">User ID</dt>
						<dd class="font-mono text-2xs">{selected.user_id}</dd>
					</div>
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Login</dt>
						<dd class="font-mono text-2xs">{selected.user_login}</dd>
					</div>
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Name</dt>
						<dd>{selected.user_name}</dd>
					</div>
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Email</dt>
						<dd>{selected.user_email}</dd>
					</div>
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Status</dt>
						<dd class="flex items-center gap-1.5">
							{#if selected.user_active}
								<span class="inline-flex items-center gap-1 rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0 text-2xs text-emerald-700 dark:text-emerald-300">
									Active
								</span>
							{:else}
								<span class="inline-flex items-center gap-1 rounded-sm border bg-muted/40 px-1.5 py-0 text-2xs text-muted-foreground">
									Inactive
								</span>
							{/if}
							{#if selected.user_is_service_account}
								<span class="inline-flex items-center gap-1 rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0 text-2xs text-amber-700 dark:text-amber-300">
									Service account
								</span>
							{/if}
							{#if selected.user_isadmin}
								<span class="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0 text-2xs">
									Admin
								</span>
							{/if}
						</dd>
					</div>
				</dl>

				<!--
				  Prominent action bar. Earlier these lived behind a
				  three-dot dropdown which made admins (especially
				  first-time ones) miss that the per-user concerns
				  even existed. Putting them out as labelled buttons
				  with icons keeps every important workflow one click
				  away.
				-->
				<div class="flex flex-wrap gap-1.5 border-b bg-muted/10 px-4 py-3">
					<Button
						variant="outline"
						size="sm"
						class="h-8"
						disabled={selectedLocked}
						title={selectedLocked ? DEMO_LOCKED_HINT : undefined}
						onclick={() => (groupsOpen = true)}
					>
						<UsersIcon size={12} class="mr-1.5" />
						Manage groups
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-8"
						disabled={selectedLocked}
						title={selectedLocked ? DEMO_LOCKED_HINT : undefined}
						onclick={() => (customersOpen = true)}
					>
						<UserCogIcon size={12} class="mr-1.5" />
						Customer access
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-8"
						disabled={selectedLocked}
						title={selectedLocked ? DEMO_LOCKED_HINT : undefined}
						onclick={() => (casesOpen = true)}
					>
						<FolderIcon size={12} class="mr-1.5" />
						Case access
					</Button>
					<Button variant="outline" size="sm" class="h-8" onclick={() => (auditOpen = true)}>
						<ShieldQuestionIcon size={12} class="mr-1.5" />
						Audit effective access
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-8"
						onclick={() => selected && recomputeAccess(selected)}
					>
						<RefreshCwIcon size={12} class="mr-1.5" />
						Recompute access
					</Button>
				</div>

				<!-- Groups -->
				<section class="border-t">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/10 px-4 py-2">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Groups ({(selected.user_groups ?? []).length})
						</h3>
					</header>
					<div class="p-3 text-2xs">
						{#if (selected.user_groups ?? []).length === 0}
							<p class="text-muted-foreground">No groups assigned.</p>
						{:else}
							<ul class="divide-y rounded-md border">
								{#each selected.user_groups ?? [] as g}
									<li class="flex items-center gap-2 px-3 py-1.5">
										<UsersIcon size={11} class="shrink-0 text-muted-foreground" />
										<span class="min-w-0 flex-1 truncate">{g.group_name}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</section>

				<!-- Customers -->
				<section class="border-t">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/10 px-4 py-2">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Customer access ({(selected.user_customers ?? []).length})
						</h3>
					</header>
					<div class="p-3 text-2xs">
						{#if (selected.user_customers ?? []).length === 0}
							<p class="text-muted-foreground">No explicit customer grants.</p>
						{:else}
							<ul class="divide-y rounded-md border">
								{#each selected.user_customers ?? [] as c}
									<li class="flex items-center gap-2 px-3 py-1.5">
										<UserCogIcon size={11} class="shrink-0 text-muted-foreground" />
										<span class="min-w-0 flex-1 truncate">{c.customer_name}</span>
										<span class="shrink-0 font-mono text-3xs text-muted-foreground">
											#{c.customer_id}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</section>

				<!-- Case access -->
				<section class="border-t">
					<header class="border-b bg-muted/10 px-4 py-2">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Explicit case access ({(selected.user_cases_access ?? []).length})
						</h3>
					</header>
					<div class="p-3">
						{#if (selected.user_cases_access ?? []).length === 0}
							<p class="text-2xs text-muted-foreground">
								No direct grants. Effective access comes from the user's groups + organisation.
							</p>
						{:else}
							<ul class="grid grid-cols-1 gap-1 text-2xs sm:grid-cols-2">
								{#each selected.user_cases_access ?? [] as ca}
									{@const level = schema.case_access_levels.find(
										(l) => l.value === ca.access_level
									)}
									<li class="flex items-center justify-between gap-2 rounded-sm border bg-muted/20 px-2 py-1">
										<span class="truncate">
											#{ca.case_id}
											{#if ca.case_name}
												— {ca.case_name}
											{/if}
										</span>
										<span class="shrink-0 text-muted-foreground">{level?.label ?? ca.access_level}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	</section>
</div>

<!-- Modals -->
<UserEditDialog
	bind:open={editOpen}
	user={editingUser}
	{showError}
	onSaved={(u) => {
		onEditSaved(u);
	}}
/>

{#if selected}
	<UserGroupsDialog
		bind:open={groupsOpen}
		user={selected}
		{showError}
		onSaved={(u) => {
			replaceUserInList(u);
			showSuccess('Groups updated');
		}}
	/>

	<UserCustomersDialog
		bind:open={customersOpen}
		user={selected}
		{showError}
		onSaved={(u) => {
			replaceUserInList(u);
			showSuccess('Customer access updated');
		}}
	/>

	<UserCasesAccessDialog
		bind:open={casesOpen}
		user={selected}
		{schema}
		{showError}
		onSaved={() => {
			void refreshSelected();
			showSuccess('Case access updated');
		}}
	/>

	<UserAuditDialog
		bind:open={auditOpen}
		user={selected}
		{schema}
		{showError}
	/>
{/if}

<UserApiKeyDialog
	bind:open={apiKeyOpen}
	apiKey={apiKeyValue}
	onClose={() => {
		apiKeyValue = null;
	}}
/>
