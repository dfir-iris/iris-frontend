<!--
  AI workflow keystore: named values workflows reference with
  `{{ key('NAME') }}`. Personal entries belong to their creator; shared
  ones are managed by administrators and can be limited to groups.
  Secret values are never shown.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		KeyRoundIcon,
		LockIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon,
		UsersIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
	import { KeystoreService, type KeystoreEntry } from '$lib/services/keystore.service';
	import { GroupsService } from '$lib/services/groups.service';
	import { aiListData } from '$lib/services/ai-workflows.service';
	import FeatureGate from '../ai-workflows/components/FeatureGate.svelte';
	import type { MultiSelectItem } from '../ai-workflows/components/MultiSelect.svelte';
	import { describeApiError, userLabel } from '../ai-workflows/helpers/ui';
	import KeystoreEntryDialog from './components/KeystoreEntryDialog.svelte';

	const userCtx = getContext<UserCtx>(USER_CTX);
	const isAdmin = $derived(userCtx?.can('server_administrator') ?? false);
	const canWritePersonal = $derived(isAdmin || (userCtx?.can('ai_workflows_write') ?? false));
	const canCreate = $derived(canWritePersonal);
	const myId = $derived(userCtx?.ctx?.user_id ?? null);

	let entries = $state<KeystoreEntry[]>([]);
	let groups = $state<MultiSelectItem[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let dialogOpen = $state(false);
	let editing = $state<KeystoreEntry | null>(null);
	let pendingDelete = $state<KeystoreEntry | null>(null);
	let confirmDeleteOpen = $state(false);

	const groupNames = $derived(new Map(groups.map((g) => [g.value, g.label])));

	async function load() {
		loading = true;
		loadError = null;
		const res = await KeystoreService.list();
		loading = false;
		if (!res.ok) {
			loadError = describeApiError(res.data, res.error?.message ?? 'Failed to load the keystore');
			return;
		}
		entries = aiListData<KeystoreEntry>(res.data).sort(
			(a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name)
		);
	}

	async function loadGroups() {
		// Group names are only needed (and readable) by administrators.
		const res = await GroupsService.list();
		if (!res.ok) return;
		groups = aiListData<{ group_id: number; group_name: string }>(res.data).map((g) => ({
			value: String(g.group_id),
			label: g.group_name
		}));
	}

	onMount(() => {
		if (!runtimeConfig.aiWorkflowsEnabled) return;
		load();
	});

	$effect(() => {
		if (isAdmin && runtimeConfig.aiWorkflowsEnabled) loadGroups();
	});

	function canEdit(entry: KeystoreEntry): boolean {
		if (entry.scope === 'shared') return isAdmin;
		return canWritePersonal && entry.owner?.id === myId;
	}

	function canDelete(entry: KeystoreEntry): boolean {
		// Administrators can also remove another user's personal entry.
		return canEdit(entry) || isAdmin;
	}

	function openCreate() {
		editing = null;
		dialogOpen = true;
	}

	function openEdit(entry: KeystoreEntry) {
		editing = entry;
		dialogOpen = true;
	}

	function onSaved(saved: KeystoreEntry) {
		const exists = entries.some((e) => e.id === saved.id);
		entries = exists ? entries.map((e) => (e.id === saved.id ? saved : e)) : [...entries, saved];
	}

	async function remove() {
		const target = pendingDelete;
		if (!target) return;
		const res = await KeystoreService.remove(target.id);
		pendingDelete = null;
		if (!res.ok) {
			toast({
				title: 'Delete failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		entries = entries.filter((e) => e.id !== target.id);
		toast({ title: 'Entry deleted', description: target.name, variant: 'success' });
	}
</script>

<svelte:head>
	<title>Keystore</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<KeyRoundIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Keystore</h1>
				<p class="text-xs text-muted-foreground">
					API keys and other values AI workflows use, referenced as
					<code class="font-mono">{`{{ key('NAME') }}`}</code>. Secret values are never shown again.
				</p>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={load} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			{#if canCreate}
				<Button size="sm" class="h-7" onclick={openCreate} data-testid="ks-new">
					<PlusIcon size={12} class="mr-1" /> New entry
				</Button>
			{/if}
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto p-5">
		<FeatureGate also={['server_administrator']}>
			{#if loadError}
				<ApiError error={loadError} onRetry={load} />
			{:else if loading && entries.length === 0}
				<p class="py-10 text-center text-xs text-muted-foreground">Loading…</p>
			{:else if entries.length === 0}
				<div
					class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
					data-testid="ks-empty"
				>
					<KeyRoundIcon size={32} class="opacity-40" />
					<p class="text-sm">No keystore entries yet.</p>
				</div>
			{:else}
				<div class="overflow-hidden rounded-md border">
					<table class="w-full text-xs" data-testid="ks-table">
						<thead
							class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<tr>
								<th class="px-3 py-2">Name</th>
								<th class="w-48 px-3 py-2">Value</th>
								<th class="w-40 px-3 py-2">Scope</th>
								<th class="w-48 px-3 py-2">Allowed hosts</th>
								<th class="w-36 px-3 py-2">Last used</th>
								<th class="w-20 px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each entries as entry (entry.id)}
								<tr class="border-t hover:bg-muted/20" data-testid={`ks-row-${entry.name}`}>
									<td class="max-w-0 px-3 py-2">
										<div class="truncate font-mono font-medium">{entry.name}</div>
										{#if entry.description}
											<div class="truncate text-2xs text-muted-foreground">
												{entry.description}
											</div>
										{/if}
									</td>
									<td class="max-w-0 px-3 py-2">
										{#if entry.is_secret}
											<span class="flex items-center gap-1 text-muted-foreground">
												<LockIcon size={11} />
												{entry.has_value ? 'secret' : 'not set'}
											</span>
										{:else}
											<span class="block truncate font-mono" title={entry.value ?? ''}>
												{entry.value ?? '—'}
											</span>
										{/if}
									</td>
									<td class="max-w-0 px-3 py-2">
										{#if entry.scope === 'shared'}
											<span class="flex items-center gap-1">
												<UsersIcon size={11} /> Shared
											</span>
											{#if entry.allowed_group_ids.length}
												<div
													class="truncate text-2xs text-muted-foreground"
													title={entry.allowed_group_ids
														.map((id) => groupNames.get(String(id)) ?? `#${id}`)
														.join(', ')}
												>
													{entry.allowed_group_ids
														.map((id) => groupNames.get(String(id)) ?? `#${id}`)
														.join(', ')}
												</div>
											{/if}
										{:else}
											Personal
											{#if entry.owner && entry.owner.id !== myId}
												<div class="truncate text-2xs text-muted-foreground">
													{userLabel(entry.owner)}
												</div>
											{/if}
										{/if}
									</td>
									<td class="max-w-0 truncate px-3 py-2 font-mono text-2xs">
										{entry.allowed_hosts.length ? entry.allowed_hosts.join(', ') : 'any'}
									</td>
									<td class="px-3 py-2">
										{entry.last_used_at ? formatDateTime(entry.last_used_at) : '—'}
									</td>
									<td class="px-3 py-2">
										<div class="flex justify-end gap-1">
											{#if canEdit(entry)}
												<Button
													variant="ghost"
													size="icon"
													class="h-7 w-7"
													title="Edit"
													aria-label={`Edit ${entry.name}`}
													onclick={() => openEdit(entry)}
												>
													<PencilIcon size={13} />
												</Button>
											{/if}
											{#if canDelete(entry)}
												<Button
													variant="ghost"
													size="icon"
													class="h-7 w-7 text-muted-foreground hover:text-destructive"
													title="Delete"
													aria-label={`Delete ${entry.name}`}
													onclick={() => {
														pendingDelete = entry;
														confirmDeleteOpen = true;
													}}
												>
													<Trash2Icon size={13} />
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</FeatureGate>
	</div>
</div>

<KeystoreEntryDialog
	bind:open={dialogOpen}
	entry={editing}
	{isAdmin}
	{canWritePersonal}
	{groups}
	{onSaved}
/>

<ConfirmationDialog
	bind:open={confirmDeleteOpen}
	title="Delete this entry?"
	message={`Workflows using key('${pendingDelete?.name ?? ''}') fail until it is recreated.`}
	confirmText="Delete"
	onConfirm={remove}
/>
