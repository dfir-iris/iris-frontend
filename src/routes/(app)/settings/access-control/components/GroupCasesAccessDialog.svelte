<!--
  Per-group case-access editor.

  Same structure as the per-user dialog, plus an "Auto-follow" toggle
  that grants the chosen access level on every existing case AND
  persists the auto-follow flag so future cases get the grant too.
  When auto-follow is on, the explicit case picker is hidden — the
  group covers all cases by definition.

  After every successful change, the backend recomputes effective
  access for every member of the group, so members see the new
  permissions on their next request.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { SearchIcon, Trash2Icon, XIcon } from 'lucide-svelte';
	import {
		AccessControlService,
		type AccessControlCaseAccessEntry,
		type AccessControlGroup,
		type AccessControlSchemaInfo,
		type AccessibleCaseSummary
	} from '$lib/services/access-control.service';

	type Props = {
		open: boolean;
		group: AccessControlGroup;
		schema: AccessControlSchemaInfo;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (group: AccessControlGroup) => void;
	};

	let { open = $bindable(), group, schema, showError, onSaved }: Props = $props();

	let grants = $state<AccessControlCaseAccessEntry[]>([]);
	let autoFollow = $state(false);
	let busy = $state(false);
	let removeSelected = $state<Set<number>>(new Set());

	let caseSearch = $state('');
	let caseSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let casePool = $state<AccessibleCaseSummary[]>([]);
	let caseLoading = $state(false);
	let addCaseIds = $state<Set<number>>(new Set());
	let addAccessLevel = $state<number>(2);

	$effect(() => {
		if (!open) return;
		grants = [...(group.group_cases_access ?? [])];
		autoFollow = !!group.group_auto_follow;
		addAccessLevel =
			group.group_auto_follow_access_level ?? schema.case_access_levels[0]?.value ?? 2;
		removeSelected = new Set();
		addCaseIds = new Set();
		caseSearch = '';
		void loadCases();
	});

	const loadCases = async (search?: string) => {
		caseLoading = true;
		try {
			const res = await AccessControlService.accessibleCases(search);
			if (res.ok && res.data && typeof res.data !== 'string') {
				casePool = (res.data as { data: AccessibleCaseSummary[] }).data;
			}
		} finally {
			caseLoading = false;
		}
	};

	const queueCaseSearch = () => {
		if (caseSearchTimer) clearTimeout(caseSearchTimer);
		caseSearchTimer = setTimeout(() => void loadCases(caseSearch.trim() || undefined), 250);
	};

	const toggleRemove = (case_id: number) => {
		const next = new Set(removeSelected);
		if (next.has(case_id)) next.delete(case_id);
		else next.add(case_id);
		removeSelected = next;
	};

	const removeGrants = async () => {
		if (removeSelected.size === 0) return;
		busy = true;
		try {
			const res = await AccessControlService.deleteGroupCasesAccess(group.group_id, [
				...removeSelected
			]);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const updated = res.data as AccessControlGroup;
				grants = [...(updated.group_cases_access ?? [])];
				autoFollow = !!updated.group_auto_follow;
				removeSelected = new Set();
				onSaved(updated);
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Remove failed');
			}
		} finally {
			busy = false;
		}
	};

	const toggleAddCase = (case_id: number) => {
		const next = new Set(addCaseIds);
		if (next.has(case_id)) next.delete(case_id);
		else next.add(case_id);
		addCaseIds = next;
	};

	const addGrants = async () => {
		busy = true;
		try {
			const res = autoFollow
				? await AccessControlService.setGroupCasesAccess(group.group_id, {
						auto_follow_cases: true,
						access_level: addAccessLevel
					})
				: addCaseIds.size === 0
					? null
					: await AccessControlService.setGroupCasesAccess(group.group_id, {
							auto_follow_cases: false,
							cases_list: [...addCaseIds],
							access_level: addAccessLevel
						});
			if (res == null) {
				busy = false;
				return;
			}
			if (res.ok && res.data && typeof res.data !== 'string') {
				const updated = res.data as AccessControlGroup;
				grants = [...(updated.group_cases_access ?? [])];
				autoFollow = !!updated.group_auto_follow;
				addCaseIds = new Set();
				onSaved(updated);
			} else {
				const data = res.data as { message?: string } | null;
				showError(data?.message ?? res.error?.message ?? 'Add failed');
			}
		} finally {
			busy = false;
		}
	};

	const levelName = (value: number) =>
		schema.case_access_levels.find((l) => l.value === value)?.label ?? String(value);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Case access — {group.group_name}</Dialog.Title>
			<Dialog.Description>
				Per-case grants applied to every member of the group. Effective access for each member is
				recomputed after every change.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 pt-2">
			<!-- Auto-follow toggle -->
			<section class="rounded-md border p-3">
				<div class="flex items-start gap-3">
					<Switch
						checked={autoFollow}
						onCheckedChange={(v: boolean) => (autoFollow = v)}
						disabled={busy}
					/>
					<div class="flex-1">
						<p class="text-xs font-medium">Auto-follow every case</p>
						<p class="text-2xs text-muted-foreground">
							Grants the chosen access level on every existing case and on cases created in the
							future. When on, the explicit case picker below is hidden.
						</p>
					</div>
				</div>
			</section>

			<!-- Existing grants -->
			<section>
				<header class="flex items-center justify-between gap-2 pb-2">
					<h3 class="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
						Current grants ({grants.length})
					</h3>
					{#if removeSelected.size > 0}
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={removeGrants}
							disabled={busy}
						>
							<Trash2Icon size={12} class="mr-1" />
							Remove {removeSelected.size}
						</Button>
					{/if}
				</header>
				<div class="max-h-[20vh] overflow-y-auto rounded-md border">
					{#if grants.length === 0}
						<p class="px-3 py-4 text-center text-2xs text-muted-foreground">No explicit grants.</p>
					{:else}
						<ul class="divide-y">
							{#each grants as ca (ca.case_id)}
								<li>
									<label
										class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-2xs hover:bg-muted/30"
									>
										<Checkbox
											checked={removeSelected.has(ca.case_id)}
											onCheckedChange={() => toggleRemove(ca.case_id)}
											disabled={busy}
										/>
										<span class="min-w-0 flex-1 truncate">
											#{ca.case_id}
											{#if ca.case_name}— {ca.case_name}{/if}
										</span>
										<span class="shrink-0 text-muted-foreground">
											{levelName(ca.access_level)}
										</span>
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>

			<!-- Add grants -->
			<section>
				<h3 class="pb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
					{autoFollow ? 'Apply auto-follow' : 'Add grants'}
				</h3>
				<div class="flex flex-col gap-2">
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
						<div class="relative">
							<SearchIcon
								size={12}
								class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								type="search"
								placeholder="Search cases…"
								class="h-7 pl-7 pr-7 text-xs"
								bind:value={caseSearch}
								disabled={autoFollow}
								oninput={queueCaseSearch}
							/>
							{#if caseSearch}
								<button
									type="button"
									class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
									aria-label="Clear"
									onclick={() => {
										caseSearch = '';
										queueCaseSearch();
									}}
								>
									<XIcon size={11} />
								</button>
							{/if}
						</div>
						<select
							class="h-7 rounded-md border bg-background px-2 text-xs"
							value={String(addAccessLevel)}
							disabled={busy}
							onchange={(e) =>
								(addAccessLevel = Number((e.currentTarget as HTMLSelectElement).value))}
						>
							{#each schema.case_access_levels as l (l.value)}
								<option value={String(l.value)}>{l.label}</option>
							{/each}
						</select>
					</div>

					{#if !autoFollow}
						<div class="max-h-[25vh] overflow-y-auto rounded-md border">
							{#if caseLoading}
								<p class="px-3 py-2 text-center text-2xs text-muted-foreground">Loading…</p>
							{:else if casePool.length === 0}
								<p class="px-3 py-3 text-center text-2xs text-muted-foreground">
									No accessible cases match.
								</p>
							{:else}
								<ul class="divide-y">
									{#each casePool as c (c.case_id)}
										<li>
											<label
												class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-2xs hover:bg-muted/30"
											>
												<Checkbox
													checked={addCaseIds.has(c.case_id)}
													onCheckedChange={() => toggleAddCase(c.case_id)}
													disabled={busy}
												/>
												<span class="min-w-0 flex-1 truncate">
													#{c.case_id} — {c.name}
												</span>
												{#if c.soc_id}
													<span class="shrink-0 text-muted-foreground">{c.soc_id}</span>
												{/if}
											</label>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}

					<div class="flex items-center justify-end gap-2">
						<Button onclick={addGrants} disabled={busy || (!autoFollow && addCaseIds.size === 0)}>
							{busy
								? 'Saving…'
								: autoFollow
									? `Apply ${levelName(addAccessLevel)} to every case`
									: `Grant ${levelName(addAccessLevel)} on ${addCaseIds.size}`}
						</Button>
					</div>
				</div>
			</section>
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
