<!--
  Access Control admin page.

  Mirrors the legacy /manage/access-control screen: a top-level tab
  strip switching between Users and Groups, each its own master/detail
  view. Row actions (in dropdowns) open modal dialogs for the
  secondary concerns — case access, group membership, customer
  access, audit, MFA reset, API-key rotation.

  Modal management lives at the page level (one shared modal slot per
  modal kind) so child components don't have to thread open-state up
  and down. The page owns the selection too, so the master list and
  the detail pane stay in sync without prop-drilling.

  Permissions: the page sits under /settings (admin-gated). The
  backend gates every route on `server_administrator` independently;
  this page won't render any errors on its own.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { LockKeyholeIcon, RefreshCwIcon, ShieldIcon, UsersIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		AccessControlService,
		type AccessControlSchemaInfo
	} from '$lib/services/access-control.service';
	import UsersTab from './components/UsersTab.svelte';
	import GroupsTab from './components/GroupsTab.svelte';

	type TabId = 'users' | 'groups';
	let activeTab = $state<TabId>('users');

	const tabs: { id: TabId; label: string; icon: typeof UsersIcon }[] = [
		{ id: 'users', label: 'Users', icon: UsersIcon },
		{ id: 'groups', label: 'Groups', icon: ShieldIcon }
	];

	// Schema (permissions + case access levels) fetched once on mount
	// and threaded into both tabs. The permissions list also drives the
	// group permission editor; the access-level list drives the case-
	// access modals.
	let schema = $state<AccessControlSchemaInfo | null>(null);
	let schemaError = $state<string | null>(null);

	// Shared confirmation dialog. Each tab triggers it via callbacks
	// since the dialog state is global on this page.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmText = $state('Confirm');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const askConfirmation = (opts: {
		title: string;
		message: string;
		confirmText?: string;
		action: () => Promise<void> | void;
	}) => {
		confirmTitle = opts.title;
		confirmMessage = opts.message;
		confirmText = opts.confirmText ?? 'Confirm';
		confirmAction = opts.action;
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};

	// Toast helpers
	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	// Recompute-all effective access — coarse-grained admin action,
	// confirmed before running.
	const recomputeAll = () => {
		askConfirmation({
			title: 'Recompute effective access for every user?',
			message:
				'Walks the user/group/org graph for every user in the deployment. Safe but slow on large fleets.',
			confirmText: 'Recompute',
			action: async () => {
				const res = await AccessControlService.recomputeAllAccess();
				if (res.ok) showSuccess('Effective access recomputed for every user');
				else
					showError(
						(res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Recompute failed'
					);
			}
		});
	};

	onMount(async () => {
		const res = await AccessControlService.schema();
		if (res.ok && res.data && typeof res.data !== 'string') {
			schema = res.data;
		} else {
			schemaError = res.error?.message ?? 'Failed to load the access-control schema';
		}
	});
</script>

<svelte:head>
	<title>Access Control</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<LockKeyholeIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Access Control</h1>
				<p class="text-2xs text-muted-foreground">
					Users, groups, permissions and per-case access.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={recomputeAll}>
				<RefreshCwIcon size={12} class="mr-1" />
				Recompute all access
			</Button>
		</div>
	</header>

	<!-- Tab strip -->
	<nav
		class="flex shrink-0 items-center gap-1 border-b bg-muted/20 px-3 py-1.5"
		aria-label="Access control sections"
	>
		{#each tabs as t}
			{@const active = activeTab === t.id}
			<button
				type="button"
				onclick={() => (activeTab = t.id)}
				class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors {active
					? 'bg-card font-medium text-foreground shadow-sm'
					: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
				aria-pressed={active}
			>
				<t.icon size={12} />
				{t.label}
			</button>
		{/each}
	</nav>

	<!-- Tab body. Both tabs render once; the inactive one is hidden so
	     master selection survives a tab flip. -->
	<div class="flex flex-1 overflow-hidden">
		<div class={`flex-1 overflow-hidden ${activeTab === 'users' ? '' : 'hidden'}`}>
			{#if schema}
				<UsersTab {schema} {askConfirmation} {showError} {showSuccess} />
			{:else if schemaError}
				<p class="px-3 py-6 text-center text-2xs text-destructive">{schemaError}</p>
			{:else}
				<p class="px-3 py-6 text-center text-2xs text-muted-foreground">Loading schema…</p>
			{/if}
		</div>
		<div class={`flex-1 overflow-hidden ${activeTab === 'groups' ? '' : 'hidden'}`}>
			{#if schema}
				<GroupsTab {schema} {askConfirmation} {showError} {showSuccess} />
			{:else if schemaError}
				<p class="px-3 py-6 text-center text-2xs text-destructive">{schemaError}</p>
			{:else}
				<p class="px-3 py-6 text-center text-2xs text-muted-foreground">Loading schema…</p>
			{/if}
		</div>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	{confirmText}
	onConfirm={runConfirm}
/>
