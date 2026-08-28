<!--
  Named per-user API keys panel.

  Backed by `POST/GET/DELETE /api/v2/me/api-keys`. Each row shows the
  key's name, optional scope mask, created + last-used timestamps, and
  a revoke button. Creating a key opens a small inline form; the
  response's plaintext `api_key` is displayed once with a copy-to-
  clipboard button and disappears on the next reload.

  Scope mask is entered as a comma-separated list of Permissions enum
  names for ergonomics. Empty → full-permissions key (inherits caller).
  We accept both raw integer input (for scripts) and the CSV form.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { KeyRoundIcon, PlusIcon, ShieldAlertIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { toast } from '$lib/components/ui/toast';
	import {
		ProfileService,
		type UserApiKey,
		type UserApiKeyCreated
	} from '$lib/services/profile.service';

	// Well-known Permissions enum values so admins can compose masks
	// without memorising the bitmask. Mirrors
	// app/models/authorization.py::Permissions. Kept as a small
	// static list on purpose — expanding it requires touching two
	// files, but it's the flat surface that shows up in the UI. When
	// the backend adds a permission, add it here + a follow-up docs
	// mention in the profile page.
	const KNOWN_PERMISSIONS: Array<{ name: string; value: number }> = [
		{ name: 'standard_user', value: 0x1 },
		{ name: 'server_administrator', value: 0x2 },
		{ name: 'alerts_read', value: 0x4 },
		{ name: 'alerts_write', value: 0x8 },
		{ name: 'alerts_delete', value: 0x10 },
		{ name: 'search_across_cases', value: 0x20 },
		{ name: 'customers_read', value: 0x40 },
		{ name: 'customers_write', value: 0x80 },
		{ name: 'case_templates_read', value: 0x100 },
		{ name: 'case_templates_write', value: 0x200 },
		{ name: 'activities_read', value: 0x400 },
		{ name: 'all_activities_read', value: 0x800 },
		{ name: 'custom_dashboards_read', value: 0x1000 },
		{ name: 'custom_dashboards_write', value: 0x2000 },
		{ name: 'custom_dashboards_share', value: 0x4000 },
		{ name: 'war_rooms_read', value: 0x8000 },
		{ name: 'war_rooms_write', value: 0x10000 },
		{ name: 'war_rooms_create', value: 0x20000 },
		{ name: 'alert_clusters_read', value: 0x40000 },
		{ name: 'alert_clusters_write', value: 0x80000 },
		{ name: 'alert_clusters_delete', value: 0x100000 },
		{ name: 'cluster_rules_read', value: 0x200000 },
		{ name: 'cluster_rules_write', value: 0x400000 },
		{ name: 'investigation_flows_read', value: 0x800000 },
		{ name: 'investigation_flows_write', value: 0x1000000 }
	];

	let keys = $state<UserApiKey[]>([]);
	let loading = $state(true);
	let creating = $state(false);
	let showCreate = $state(false);
	let newName = $state('');
	let newScopeCsv = $state('');
	// After a successful create, we surface the plaintext key inline
	// for one render — the response body is the only place it appears.
	let mintedKey = $state<UserApiKeyCreated | null>(null);
	let showRevoked = $state(false);

	const load = async () => {
		loading = true;
		try {
			const res = await ProfileService.listApiKeys();
			if (res.ok && res.data && typeof res.data !== 'string') {
				keys = (res.data.api_keys as UserApiKey[]) ?? [];
			} else {
				toast({
					title: 'Could not load API keys',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const parseScopeMask = (csv: string): number | null => {
		const raw = csv.trim();
		if (!raw) return null;
		// Accept a bare integer (e.g. `1099511627775` from a script).
		const asInt = Number(raw);
		if (!Number.isNaN(asInt) && Number.isFinite(asInt) && /^\d+$/.test(raw)) {
			return asInt;
		}
		// Otherwise treat as comma-separated Permissions names.
		let mask = 0;
		let unknown: string[] = [];
		for (const token of raw
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)) {
			const p = KNOWN_PERMISSIONS.find((k) => k.name === token);
			if (p) mask |= p.value;
			else unknown.push(token);
		}
		if (unknown.length) {
			throw new Error(`Unknown permission(s): ${unknown.join(', ')}`);
		}
		return mask;
	};

	const create = async () => {
		if (!newName.trim()) {
			toast({ title: 'Name is required', variant: 'destructive' });
			return;
		}
		let scope: number | null;
		try {
			scope = parseScopeMask(newScopeCsv);
		} catch (e) {
			toast({ title: (e as Error).message, variant: 'destructive' });
			return;
		}
		creating = true;
		try {
			const res = await ProfileService.createApiKey({
				name: newName.trim(),
				scope_mask: scope
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				mintedKey = res.data as UserApiKeyCreated;
				newName = '';
				newScopeCsv = '';
				showCreate = false;
				await load();
			} else {
				toast({
					title: 'Could not create API key',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			creating = false;
		}
	};

	const revoke = async (key: UserApiKey) => {
		if (
			!confirm(
				`Revoke API key '${key.name}'? Any client using it will lose access on the next request. This cannot be undone.`
			)
		)
			return;
		const res = await ProfileService.revokeApiKey(key.id);
		if (res.ok) {
			toast({ title: `Revoked '${key.name}'`, variant: 'success' });
			await load();
		} else {
			toast({
				title: 'Revoke failed',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const scopeMaskToNames = (mask: number | null): string => {
		if (mask === null) return '(full permissions)';
		const names = KNOWN_PERMISSIONS.filter((p) => (mask & p.value) === p.value).map((p) => p.name);
		return names.length ? names.join(', ') : `mask 0x${mask.toString(16)}`;
	};

	const fmtDate = (iso: string | null): string => {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	};

	// Filter view — revoked rows are audit-only, hidden by default.
	const visibleKeys = $derived(showRevoked ? keys : keys.filter((k) => !k.revoked_at));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<KeyRoundIcon size={16} />
			Named API keys
		</Card.Title>
		<Card.Description>
			Named, revocable API keys with an optional permission scope narrower than your account. Ideal
			for MCP clients (Claude Desktop, Claude Code) and CI scripts — hand out a read-only key to
			your assistant instead of your full account key.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if mintedKey}
			<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
				<div class="flex items-center justify-between gap-2">
					<div class="text-sm font-medium">
						New key created — copy it now, it will not be shown again.
					</div>
					<Button size="sm" variant="ghost" onclick={() => (mintedKey = null)}>Dismiss</Button>
				</div>
				<div class="mt-2 flex items-stretch gap-2">
					<Input value={mintedKey.api_key} readonly class="flex-1 font-mono text-xs" />
					<ClipboardCopy value={mintedKey.api_key} alwaysVisible />
				</div>
				<p class="mt-2 text-2xs text-muted-foreground">
					Name: <code>{mintedKey.name}</code> — Scope:
					<code>{scopeMaskToNames(mintedKey.scope_mask)}</code>
				</p>
			</div>
		{/if}

		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				<label class="flex items-center gap-1">
					<input type="checkbox" bind:checked={showRevoked} class="h-3 w-3 accent-primary" />
					Show revoked
				</label>
			</div>
			<Button size="sm" onclick={() => (showCreate = !showCreate)}>
				<PlusIcon size={14} class="mr-1" />
				{showCreate ? 'Cancel' : 'New key'}
			</Button>
		</div>

		{#if showCreate}
			<div class="rounded-md border p-3">
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Name</Label>
						<Input
							bind:value={newName}
							placeholder="Claude Desktop / CI script / …"
							class="h-8 text-xs"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<Label class="flex items-center gap-1 text-xs">
							<ShieldAlertIcon size={12} />
							Scope (optional)
						</Label>
						<Input
							bind:value={newScopeCsv}
							placeholder="alerts_read, war_rooms_read (empty = full)"
							class="h-8 text-xs"
						/>
					</div>
				</div>
				<p class="mt-2 text-2xs text-muted-foreground">
					Scope is a comma-separated list of Permissions names, or a raw integer bitmask. An issued
					key can never exceed your own permissions — the mask is AND-ed with your effective set.
				</p>
				<div class="mt-3 flex justify-end">
					<Button size="sm" onclick={create} disabled={creating}>
						{creating ? 'Creating…' : 'Create key'}
					</Button>
				</div>
			</div>
		{/if}

		{#if loading}
			<p class="text-xs text-muted-foreground">Loading…</p>
		{:else if visibleKeys.length === 0}
			<p class="text-xs text-muted-foreground">
				No API keys yet. Create one above for your first MCP client or CI script.
			</p>
		{:else}
			<div class="rounded-md border">
				<table class="w-full text-left text-xs">
					<thead
						class="border-b bg-muted/30 text-2xs uppercase tracking-wide text-muted-foreground"
					>
						<tr>
							<th class="px-3 py-2">Name</th>
							<th class="px-3 py-2">Scope</th>
							<th class="px-3 py-2">Created</th>
							<th class="px-3 py-2">Last used</th>
							<th class="px-3 py-2">Status</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each visibleKeys as key (key.id)}
							<tr class="border-b last:border-0 {key.revoked_at ? 'opacity-60' : ''}">
								<td class="px-3 py-2 font-medium">{key.name}</td>
								<td class="px-3 py-2 font-mono text-2xs text-muted-foreground">
									{scopeMaskToNames(key.scope_mask)}
								</td>
								<td class="px-3 py-2">{fmtDate(key.created_at)}</td>
								<td class="px-3 py-2">{fmtDate(key.last_used_at)}</td>
								<td class="px-3 py-2">
									{#if key.revoked_at}
										<span class="text-destructive">revoked {fmtDate(key.revoked_at)}</span>
									{:else}
										<span class="text-emerald-600">active</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-right">
									{#if !key.revoked_at}
										<button
											type="button"
											class="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
											aria-label={`Revoke ${key.name}`}
											onclick={() => void revoke(key)}
										>
											<Trash2Icon size={14} />
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
