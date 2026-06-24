<!--
  Groups tab for the Access Control page.

  Layout: master/detail
    • LEFT (basis-1/3): paginated group list with debounced search +
      infinite scroll, plus Add.
    • RIGHT (basis-2/3): selected group's metadata + permission
      editor (renders the schema's permission descriptors as a
      checklist) + Members + Case-access dropdowns.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FolderIcon,
		KeyRoundIcon,
		MoreHorizontalIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		SearchIcon,
		ShieldIcon,
		Trash2Icon,
		UsersIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		AccessControlService,
		type AccessControlGroup,
		type AccessControlSchemaInfo
	} from '$lib/services/access-control.service';
	import GroupEditDialog from './GroupEditDialog.svelte';
	import GroupMembersDialog from './GroupMembersDialog.svelte';
	import GroupCasesAccessDialog from './GroupCasesAccessDialog.svelte';

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

	const PAGE_SIZE = 25;

	type ListState = {
		items: AccessControlGroup[];
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
	const selected = $derived<AccessControlGroup | null>(
		selectedId == null ? null : listState.items.find((g) => g.group_id === selectedId) ?? null
	);

	let searchValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const currentSearch = () => searchValue.trim() || undefined;

	let editOpen = $state(false);
	let editingGroup = $state<AccessControlGroup | null>(null);
	let membersOpen = $state(false);
	let casesOpen = $state(false);

	const loadList = async () => {
		listState = { ...emptyListState(), loading: true };
		try {
			const res = await AccessControlService.searchGroups({
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
				if (selectedId == null && env.data.length > 0) selectedId = env.data[0].group_id;
				else if (selectedId != null && !env.data.find((g) => g.group_id === selectedId))
					selectedId = null;
			} else {
				showError(res.error?.message ?? 'Failed to load groups');
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
			const res = await AccessControlService.searchGroups({
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

	const replaceGroupInList = (updated: AccessControlGroup) => {
		listState = {
			...listState,
			items: listState.items.map((g) => (g.group_id === updated.group_id ? updated : g))
		};
	};

	const openAdd = () => {
		editingGroup = null;
		editOpen = true;
	};

	const openEdit = (g: AccessControlGroup) => {
		editingGroup = g;
		editOpen = true;
	};

	const onEditSaved = (g: AccessControlGroup) => {
		showSuccess(editingGroup ? 'Group updated' : 'Group created');
		if (editingGroup == null) {
			void loadList();
			selectedId = g.group_id;
		} else {
			replaceGroupInList(g);
		}
	};

	const removeGroup = (g: AccessControlGroup) => {
		askConfirmation({
			title: `Delete group ${g.group_name}?`,
			message:
				'Members lose any access this group grants. Cases assigned to the group lose its grants too. The backend refuses if the deletion would lock the caller out.',
			confirmText: 'Delete',
			action: async () => {
				const res = await AccessControlService.deleteGroup(g.group_id);
				if (res.ok) {
					showSuccess('Group deleted');
					if (selectedId === g.group_id) selectedId = null;
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

	const accessLevelName = (value: number) =>
		schema.case_access_levels.find((l) => l.value === value)?.label ?? String(value);
</script>

<div class="flex h-full gap-3 overflow-hidden p-4">
	<!-- Master list -->
	<section class="flex min-h-0 flex-1 basis-1/3 flex-col overflow-hidden rounded-md border">
		<div class="flex flex-col gap-2 border-b bg-muted/30 px-3 py-2">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Groups
					</h2>
					<span class="text-2xs text-muted-foreground tabular-nums">
						{listState.items.length} / {listState.total}
					</span>
				</div>
				<Button size="sm" class="h-7" onclick={openAdd}>
					<PlusIcon size={12} class="mr-1" />
					Add group
				</Button>
			</div>

			<div class="relative">
				<SearchIcon
					size={12}
					class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Search by name or description…"
					class="h-7 pl-7 pr-7 text-xs"
					bind:value={searchValue}
					oninput={queueSearch}
				/>
				{#if searchValue}
					<button
						type="button"
						class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
						aria-label="Clear"
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
				<p class="px-3 py-6 text-center text-xs text-muted-foreground">No groups match.</p>
			{:else}
				<ul class="divide-y">
					{#each listState.items as g (g.group_id)}
						{@const active = g.group_id === selectedId}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors
									{active
									? 'bg-primary/10 font-medium text-foreground'
									: 'hover:bg-muted/40'}"
								onclick={() => (selectedId = g.group_id)}
							>
								<ShieldIcon size={14} class="shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<div class="truncate">{g.group_name}</div>
									{#if g.group_description}
										<div class="truncate text-2xs text-muted-foreground">
											{g.group_description}
										</div>
									{/if}
								</div>
								<span class="font-mono text-2xs text-muted-foreground">
									#{g.group_id}
								</span>
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
					Group
				</h2>
				{#if selected}
					<span class="text-2xs text-muted-foreground">{selected.group_name}</span>
				{/if}
			</div>

			{#if selected}
				<div class="flex items-center gap-1.5">
					<Button variant="outline" size="sm" class="h-7" onclick={() => selected && openEdit(selected)}>
						<PencilIcon size={12} class="mr-1" />
						Edit
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button variant="outline" size="sm" class="h-7">
								<MoreHorizontalIcon size={12} />
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="min-w-[200px]">
							<DropdownMenu.Item onclick={() => (membersOpen = true)}>
								<UsersIcon size={12} class="mr-2" />
								Members…
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => (casesOpen = true)}>
								<FolderIcon size={12} class="mr-2" />
								Case access…
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								class="text-destructive focus:text-destructive"
								onclick={() => selected && removeGroup(selected)}
							>
								<Trash2Icon size={12} class="mr-2" />
								Delete group
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if !selected}
				<p class="px-3 py-10 text-center text-xs text-muted-foreground">
					Select a group on the left, or click <span class="font-medium">Add group</span> to create one.
				</p>
			{:else}
				<dl class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Group ID</dt>
						<dd class="font-mono text-2xs">{selected.group_id}</dd>
					</div>
					<div>
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Name</dt>
						<dd>{selected.group_name}</dd>
					</div>
					<div class="sm:col-span-2">
						<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Description</dt>
						<dd class="whitespace-pre-wrap">{selected.group_description || '—'}</dd>
					</div>
				</dl>

				<!-- Permissions -->
				<section class="border-t">
					<header class="border-b bg-muted/10 px-4 py-2">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Permissions
						</h3>
					</header>
					<div class="flex flex-wrap gap-1 p-3 text-2xs">
						{#if selected.group_permissions === 0}
							<span class="text-muted-foreground">No permissions granted.</span>
						{:else}
							{#each schema.permissions.filter((p) => (selected.group_permissions & p.value) === p.value) as p (p.value)}
								<span class="rounded-sm border bg-muted/40 px-1.5 py-0" title={p.description}>
									{p.label}
								</span>
							{/each}
						{/if}
					</div>
				</section>

				<!-- Members -->
				<section class="border-t">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/10 px-4 py-2">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Members ({(selected.group_members ?? []).length})
						</h3>
						<Button variant="outline" size="sm" class="h-7" onclick={() => (membersOpen = true)}>
							<PencilIcon size={11} class="mr-1" />
							Edit
						</Button>
					</header>
					<div class="flex flex-wrap gap-1 p-3 text-2xs">
						{#if (selected.group_members ?? []).length === 0}
							<span class="text-muted-foreground">No members.</span>
						{:else}
							{#each selected.group_members ?? [] as m}
								<span class="rounded-sm border bg-muted/40 px-1.5 py-0">
									@{m.user}
								</span>
							{/each}
						{/if}
					</div>
				</section>

				<!-- Case access -->
				<section class="border-t">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/10 px-4 py-2">
						<div class="flex items-center gap-2">
							<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
								Case access ({(selected.group_cases_access ?? []).length})
							</h3>
							{#if selected.group_auto_follow}
								<span class="rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0 text-3xs text-emerald-700 dark:text-emerald-300">
									Auto-follow
								</span>
							{/if}
						</div>
						<Button variant="outline" size="sm" class="h-7" onclick={() => (casesOpen = true)}>
							<PencilIcon size={11} class="mr-1" />
							Edit
						</Button>
					</header>
					<div class="p-3">
						{#if (selected.group_cases_access ?? []).length === 0}
							<p class="text-2xs text-muted-foreground">
								No case grants. {#if selected.group_auto_follow}
									Auto-follow is on at level <span class="font-medium">
										{accessLevelName(selected.group_auto_follow_access_level ?? 0)}
									</span>.
								{/if}
							</p>
						{:else}
							<ul class="grid grid-cols-1 gap-1 text-2xs sm:grid-cols-2">
								{#each selected.group_cases_access ?? [] as ca}
									<li class="flex items-center justify-between gap-2 rounded-sm border bg-muted/20 px-2 py-1">
										<span class="truncate">
											#{ca.case_id}
											{#if ca.case_name}— {ca.case_name}{/if}
										</span>
										<span class="shrink-0 text-muted-foreground">
											{accessLevelName(ca.access_level)}
										</span>
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
<GroupEditDialog
	bind:open={editOpen}
	group={editingGroup}
	{schema}
	{showError}
	onSaved={(g) => onEditSaved(g)}
/>

{#if selected}
	<GroupMembersDialog
		bind:open={membersOpen}
		group={selected}
		{showError}
		onSaved={(g) => {
			replaceGroupInList(g);
			showSuccess('Members updated');
		}}
	/>

	<GroupCasesAccessDialog
		bind:open={casesOpen}
		group={selected}
		{schema}
		{showError}
		onSaved={(g) => {
			replaceGroupInList(g);
			showSuccess('Case access updated');
		}}
	/>
{/if}
