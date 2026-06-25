<!--
  User audit dialog.

  Calls `GET /api/v2/manage/users/<id>/audit`. The backend returns:

    access_audit: Record<case_id, {
      case_info: {case_id, case_name},
      user_access: [{state, access_list, access_value, inherited_from: {
        object_type, object_name, object_id, object_uuid
      }}, ...],
      user_effective_access: string[]   # resolved permission names
    }>
    permissions_audit: {
      details: Record<perm_bit_value, {
        name, value, inherited_from: Record<group_id, {group_name, group_uuid}>
      }>,
      effective: number   # full bitmask
    }

  We render both as tables. The case-access table flattens the
  per-case `user_access` list so the admin sees every contributing
  grant + whether it was overridden, plus the resolved effective
  level on the right.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { SearchIcon, XIcon } from 'lucide-svelte';
	import {
		AccessControlService,
		type AccessControlSchemaInfo,
		type AccessControlUser,
		type UserAudit,
		type UserAuditAccessEntry
	} from '$lib/services/access-control.service';

	type Props = {
		open: boolean;
		user: AccessControlUser;
		schema: AccessControlSchemaInfo;
		showError: (msg: string, fallback?: string) => void;
	};

	let { open = $bindable(), user, schema, showError }: Props = $props();

	let audit = $state<UserAudit | null>(null);
	let loading = $state(false);
	let filter = $state('');

	$effect(() => {
		if (!open) return;
		audit = null;
		filter = '';
		void load();
	});

	const load = async () => {
		loading = true;
		try {
			const res = await AccessControlService.auditUser(user.user_id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				audit = res.data as UserAudit;
			} else {
				showError(res.error?.message ?? 'Failed to load audit');
			}
		} finally {
			loading = false;
		}
	};

	// Permission descriptors keyed by bit value so we can look up
	// human labels without an O(N) `.find` per row. Built from the
	// shared schema endpoint so adding a new bit on the backend
	// surfaces here automatically.
	const permissionLabelByValue = $derived<Record<number, string>>(
		Object.fromEntries(schema.permissions.map((p) => [p.value, p.label]))
	);

	// Pretty-print the source row for the case-access table. Tells
	// the admin where the grant came from — group / customer / direct
	// user / default level.
	const sourceLabel = (source: { object_type: string; object_name: string }): string => {
		switch (source.object_type) {
			case 'group_access_level':
				return `Group · ${source.object_name}`;
			case 'customer_access_level':
				return `Customer · ${source.object_name}`;
			case 'user_access_level':
				return `Direct user · ${source.object_name}`;
			case 'default_access_level':
				return 'Default access level';
			default:
				return source.object_name || source.object_type;
		}
	};

	// Flatten the case-access dict into an array, sorted by case_id
	// ascending so the table is deterministic between renders.
	const accessRows = $derived<UserAuditAccessEntry[]>(
		audit == null
			? []
			: Object.values(audit.access_audit).sort(
					(a, b) => a.case_info.case_id - b.case_info.case_id
				)
	);

	const visibleAccessRows = $derived.by<UserAuditAccessEntry[]>(() => {
		const needle = filter.trim().toLowerCase();
		if (!needle) return accessRows;
		return accessRows.filter(
			(r) =>
				r.case_info.case_name.toLowerCase().includes(needle) ||
				String(r.case_info.case_id).includes(needle) ||
				r.user_access.some((s) =>
					(s.inherited_from.object_name ?? '').toLowerCase().includes(needle)
				)
		);
	});

	const permissionRows = $derived<
		Array<{ value: number; name: string; label: string; groups: string[] }>
	>(
		audit == null
			? []
			: Object.values(audit.permissions_audit.details ?? {})
					.map((d) => ({
						value: d.value,
						name: d.name,
						label: permissionLabelByValue[d.value] ?? d.name,
						groups: Object.values(d.inherited_from ?? {}).map((g) => g.group_name)
					}))
					.sort((a, b) => a.value - b.value)
	);

	// Resolved level string used as the right-hand column of the
	// case-access table. The backend already maps the bitmask to
	// human names; we just join them.
	const effectiveLevel = (e: UserAuditAccessEntry): string => {
		if (!Array.isArray(e.user_effective_access) || e.user_effective_access.length === 0) {
			return 'deny_all';
		}
		return e.user_effective_access.join(', ');
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>Effective access — @{user.user_login}</Dialog.Title>
			<Dialog.Description>
				Trace of every permission bit + per-case grant the user inherits, plus the resolved
				effective level. Read-only.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 pt-2">
			{#if loading || audit == null}
				<div class="space-y-2">
					{#each Array(6) as _}
						<Skeleton class="h-7 w-full" />
					{/each}
				</div>
			{:else}
				<!-- Permissions -->
				<section>
					<h3 class="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
						Permissions
					</h3>
					<div class="max-h-[30vh] overflow-y-auto rounded-md border">
						{#if permissionRows.length === 0}
							<p class="px-3 py-4 text-center text-2xs text-muted-foreground">
								No permissions granted. The user has read-only login but nothing else.
							</p>
						{:else}
							<table class="w-full text-2xs">
								<thead
									class="sticky top-0 border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground"
								>
									<tr>
										<th class="px-2 py-1">Permission</th>
										<th class="w-16 px-2 py-1">Bit</th>
										<th class="px-2 py-1">Granted by</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each permissionRows as row (row.value)}
										<tr>
											<td class="px-2 py-1">
												<span class="font-medium">{row.label}</span>
												<span class="ml-1 font-mono text-3xs text-muted-foreground">
													{row.name}
												</span>
											</td>
											<td class="px-2 py-1 font-mono">0x{row.value.toString(16)}</td>
											<td class="px-2 py-1">
												{#if row.groups.length === 0}
													<span class="text-muted-foreground">—</span>
												{:else}
													<div class="flex flex-wrap gap-1">
														{#each row.groups as g}
															<span class="rounded-sm border bg-muted/40 px-1.5 py-0">
																{g}
															</span>
														{/each}
													</div>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				</section>

				<!-- Case access -->
				<section>
					<header class="flex items-center justify-between gap-2 pb-1.5">
						<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Case access ({accessRows.length} cases)
						</h3>
						<div class="relative w-60">
							<SearchIcon
								size={11}
								class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								type="search"
								class="h-7 pl-7 pr-7 text-2xs"
								placeholder="Filter by case or source…"
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
					</header>
					<div class="max-h-[40vh] overflow-y-auto rounded-md border">
						{#if visibleAccessRows.length === 0}
							<p class="px-3 py-4 text-center text-2xs text-muted-foreground">
								{accessRows.length === 0
									? 'No case access.'
									: 'No matches for the current filter.'}
							</p>
						{:else}
							<table class="w-full text-2xs">
								<thead
									class="sticky top-0 border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground"
								>
									<tr>
										<th class="w-16 px-2 py-1">Case</th>
										<th class="px-2 py-1">Sources</th>
										<th class="w-32 px-2 py-1">Effective</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each visibleAccessRows as e (e.case_info.case_id)}
										<tr class="align-top">
											<td class="px-2 py-1.5">
												<div class="font-mono">#{e.case_info.case_id}</div>
												<div class="truncate text-muted-foreground">
													{e.case_info.case_name}
												</div>
											</td>
											<td class="px-2 py-1.5">
												<ul class="space-y-1">
													{#each e.user_access as s, i (i)}
														{@const overridden = s.state !== 'Effective'}
														<li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
															<span class={overridden ? 'text-muted-foreground line-through' : ''}>
																{sourceLabel(s.inherited_from)} →
																<span class="font-mono">
																	{Array.isArray(s.access_list)
																		? s.access_list.join(', ')
																		: s.access_list}
																</span>
															</span>
															{#if overridden}
																<span
																	class="rounded-sm border bg-muted/40 px-1 py-0 text-3xs text-muted-foreground"
																>
																	{s.state}
																</span>
															{/if}
														</li>
													{/each}
												</ul>
											</td>
											<td class="px-2 py-1.5">
												<span
													class="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0 font-mono"
												>
													{effectiveLevel(e)}
												</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				</section>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
