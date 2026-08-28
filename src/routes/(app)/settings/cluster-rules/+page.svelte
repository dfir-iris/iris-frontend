<!--
  Cluster-rules admin. Rules stack alerts into alert clusters.

  Investigation-flow attachment is authored on the *flow* itself (see
  /settings/investigation-flows) — this page focuses purely on the
  stacking action.

  Conditions are edited through the shared ConditionsBuilder (nested
  AND/OR groups); dry-run previews matches against the last 30 days.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { FilterIcon, PlayIcon, PlusIcon, RocketIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Loading } from '$lib/components/ui/loading';
	import { toast } from '$lib/components/ui/toast';
	import ConditionsBuilder, {
		emptyRootGroup,
		type GroupNode
	} from '$lib/components/common/ConditionsBuilder/ConditionsBuilder.svelte';
	import {
		ClusterRulesService,
		type BackfillRuleResponse
	} from '$lib/services/cluster-rules.service';
	import type { ClusterRule } from '$lib/types/resources/cluster-rule';

	let rules = $state<ClusterRule[]>([]);
	let loading = $state(false);
	let editing = $state<ClusterRule | null>(null);
	let conditionsTree = $state<GroupNode>(emptyRootGroup());
	let timeWindowSeconds = $state<number | null>(null);
	let groupByCsv = $state('');
	let titleTemplate = $state('');
	let testMatches = $state<number[] | null>(null);

	// Common correlation entities. `field` matches the backend's group_by
	// vocabulary — the same DSL `apply_custom_conditions` uses, so
	// relationship-joined paths (`assets.asset_name`) are valid.
	const CORRELATION_PRESETS = [
		{ label: 'Same host', field: 'assets.asset_name' },
		{ label: 'Same IP', field: 'assets.asset_ip' },
		{ label: 'Same user (owner)', field: 'alert_owner_id' },
		{ label: 'Same source', field: 'alert_source' },
		{ label: 'Same title', field: 'alert_title' },
		{ label: 'Same IOC', field: 'iocs.ioc_value' }
	];

	const splitCsv = (csv: string): string[] =>
		csv
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

	const groupByHasField = (csv: string, field: string): boolean => splitCsv(csv).includes(field);

	const toggleGroupByField = (csv: string, field: string): string => {
		const list = splitCsv(csv);
		const idx = list.indexOf(field);
		if (idx === -1) list.push(field);
		else list.splice(idx, 1);
		return list.join(', ');
	};

	let deleteOpen = $state(false);
	let ruleToDelete = $state<ClusterRule | null>(null);

	let backfillOpen = $state(false);
	let backfilling = $state(false);

	// How many days of history Test / Back-fill consider. 30 matches
	// the backend default; kept editable so analysts can widen or narrow
	// the window per rule as they iterate.
	let sampleDays = $state<number>(30);

	const showError = (msg: string) => toast({ title: msg, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		loading = true;
		try {
			const res = await ClusterRulesService.list();
			rules = (res.data as ClusterRule[]) ?? [];
		} catch {
			showError('Failed to load rules');
		} finally {
			loading = false;
		}
	};

	const startEdit = (rule: ClusterRule | null) => {
		editing = rule ?? {
			rule_id: 0,
			rule_uuid: '',
			rule_name: 'New rule',
			rule_description: '',
			rule_is_active: true,
			rule_priority: 100,
			rule_customer_scope: null,
			rule_conditions: { logic: 'and', conditions: [] },
			rule_action_type: 'create_cluster',
			rule_action_config: {},
			rule_created_at: '',
			rule_updated_at: ''
		};
		// Rebuild the builder tree from the persisted conditions. Fresh
		// rules start with an empty AND group so the analyst can add the
		// first row.
		const c = editing.rule_conditions ?? { logic: 'and', conditions: [] };
		conditionsTree = {
			logic: (c.logic as 'and' | 'or') ?? 'and',
			conditions: (c.conditions as GroupNode['conditions']) ?? []
		};
		timeWindowSeconds =
			(editing.rule_conditions as unknown as { time_window_seconds?: number })
				?.time_window_seconds ?? null;
		const gb = (editing.rule_conditions as unknown as { group_by?: string[] })?.group_by;
		groupByCsv = Array.isArray(gb) ? gb.join(', ') : '';
		titleTemplate = (editing.rule_action_config?.title_template as string) ?? '';
		testMatches = null;
	};

	const save = async () => {
		if (!editing) return;
		if (conditionsTree.conditions.length === 0) {
			showError('Add at least one condition');
			return;
		}
		const body = {
			rule_name: editing.rule_name,
			rule_description: editing.rule_description ?? '',
			rule_is_active: editing.rule_is_active,
			rule_priority: editing.rule_priority,
			rule_customer_scope: editing.rule_customer_scope,
			rule_conditions: {
				logic: conditionsTree.logic,
				conditions: conditionsTree.conditions,
				...(timeWindowSeconds && timeWindowSeconds > 0
					? { time_window_seconds: timeWindowSeconds }
					: {}),
				...(groupByCsv.trim()
					? {
							group_by: groupByCsv
								.split(',')
								.map((s) => s.trim())
								.filter(Boolean)
						}
					: {})
			},
			rule_action_type: 'create_cluster' as const,
			rule_action_config: {
				...(titleTemplate ? { title_template: titleTemplate } : {})
			}
		};
		try {
			if (editing.rule_id === 0) {
				await ClusterRulesService.create(body);
				showSuccess('Rule created');
			} else {
				await ClusterRulesService.update(editing.rule_id, body);
				showSuccess('Rule updated');
			}
			editing = null;
			await load();
		} catch {
			showError('Failed to save rule');
		}
	};

	const askDelete = (rule: ClusterRule) => {
		ruleToDelete = rule;
		deleteOpen = true;
	};

	const confirmDelete = async () => {
		if (!ruleToDelete) return;
		try {
			await ClusterRulesService.remove(ruleToDelete.rule_id);
			showSuccess('Rule deleted');
			ruleToDelete = null;
			await load();
		} catch {
			showError('Failed to delete rule');
		}
	};

	const runTest = async () => {
		if (!editing || editing.rule_id === 0) {
			showError('Save the rule first — Test runs against the saved rule');
			return;
		}
		try {
			const res = await ClusterRulesService.test(editing.rule_id, {
				sample_days: sampleDays
			});
			testMatches = (res.data as { matching_alert_ids?: number[] })?.matching_alert_ids ?? [];
		} catch {
			showError('Test failed');
		}
	};

	const runBackfill = async () => {
		if (!editing || editing.rule_id === 0) return;
		backfilling = true;
		try {
			const res = await ClusterRulesService.backfill(editing.rule_id, {
				sample_days: sampleDays
			});
			const payload =
				res.data && typeof res.data === 'object' ? (res.data as BackfillRuleResponse) : null;
			if (payload) {
				const parts: string[] = [];
				if (payload.attached) parts.push(`${payload.attached} attached`);
				if (payload.skipped_already_in_cluster)
					parts.push(`${payload.skipped_already_in_cluster} skipped (already in cluster)`);
				if (payload.errors) parts.push(`${payload.errors} error(s)`);
				const summary = parts.length
					? parts.join(' · ')
					: `Considered ${payload.considered} — no changes`;
				showSuccess(summary);
			}
		} catch {
			showError('Back-fill failed');
		} finally {
			backfilling = false;
			backfillOpen = false;
		}
	};

	onMount(load);
</script>

<svelte:head>
	<title>Clustering Rules</title>
</svelte:head>

<div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
	<header class="flex items-center justify-between border-b pb-3">
		<div class="flex items-center gap-2">
			<FilterIcon class="h-5 w-5 text-muted-foreground" />
			<div>
				<h1 class="text-base font-semibold">Clustering Rules</h1>
				<p class="text-2xs uppercase tracking-wide text-muted-foreground">
					Auto-stack alerts into alert clusters on match
				</p>
			</div>
		</div>
		<Button onclick={() => startEdit(null)}>
			<PlusIcon class="mr-2 h-4 w-4" /> New rule
		</Button>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
		{#if loading}
			<Loading />
		{:else if rules.length === 0}
			<p class="text-sm text-muted-foreground">
				No rules yet. Create one to auto-group repeat alerts into a single cluster.
			</p>
		{:else}
			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/40">
						<tr class="text-left">
							<th class="px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">Name</th>
							<th class="px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground"
								>Priority</th
							>
							<th class="px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground"
								>Active</th
							>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each rules as rule (rule.rule_id)}
							<tr class="border-t hover:bg-muted/20">
								<td class="px-3 py-2">
									<button
										type="button"
										class="text-left font-medium hover:underline"
										onclick={() => startEdit(rule)}
									>
										{rule.rule_name}
									</button>
									{#if rule.rule_description}
										<p class="text-xs text-muted-foreground">{rule.rule_description}</p>
									{/if}
								</td>
								<td class="px-3 py-2 text-xs">{rule.rule_priority}</td>
								<td class="px-3 py-2 text-xs">
									{#if rule.rule_is_active}
										<span class="rounded-full bg-green-500/10 px-2 py-0.5 text-green-600"
											>Active</span
										>
									{:else}
										<span class="rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
											>Disabled</span
										>
									{/if}
								</td>
								<td class="px-3 py-2 text-right">
									<Button
										variant="ghost"
										size="icon"
										aria-label="Delete rule"
										onclick={() => askDelete(rule)}
									>
										<Trash2Icon class="h-4 w-4 text-destructive" />
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if editing}
			<section class="rounded-md border bg-card p-4 shadow-sm">
				<h2 class="mb-3 text-sm font-semibold">
					{editing.rule_id === 0 ? 'New rule' : `Edit rule #${editing.rule_id}`}
				</h2>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label for="rule-name" class="text-2xs uppercase tracking-wide text-muted-foreground"
							>Name</label
						>
						<Input id="rule-name" bind:value={editing.rule_name} />
					</div>
					<div class="flex flex-col gap-1">
						<label for="rule-desc" class="text-2xs uppercase tracking-wide text-muted-foreground"
							>Description</label
						>
						<Input id="rule-desc" bind:value={editing.rule_description as string} />
					</div>
				</div>

				<div class="mt-3 grid gap-3 sm:grid-cols-3">
					<div class="flex flex-col gap-1">
						<label
							for="rule-priority"
							class="text-2xs uppercase tracking-wide text-muted-foreground">Priority</label
						>
						<Input id="rule-priority" type="number" bind:value={editing.rule_priority} />
					</div>
					<div class="flex items-end">
						<label class="inline-flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={editing.rule_is_active} /> Active
						</label>
					</div>
				</div>

				<div class="mt-4">
					<p class="mb-2 text-2xs uppercase tracking-wide text-muted-foreground">
						Match conditions
					</p>
					<ConditionsBuilder bind:value={conditionsTree} target="alert" />
					<p class="mt-2 text-2xs text-muted-foreground">
						JSON fields work with dotted paths — e.g. <code class="rounded bg-muted px-1 py-0.5"
							>alert_context.severity</code
						>
						drills into the JSON document at query time. Relationship paths like
						<code class="rounded bg-muted px-1 py-0.5">assets.asset_name</code> join the related table.
					</p>
				</div>

				<!--
				  Correlation section — this is the load-bearing bit of a
				  rule. The engine already supports arbitrary group-by
				  fields, but analysts don't think in field names; they
				  think in entities ("same host", "same user"). The chips
				  below one-click those into the CSV that the backend
				  consumes verbatim, plus a free-text field for anything
				  the presets don't cover.
				-->
				<div class="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3">
					<p class="mb-1 text-2xs font-semibold uppercase tracking-wide text-primary">
						Correlation
					</p>
					<p class="mb-3 text-xs text-muted-foreground">
						Group matching alerts into <em>one alert cluster</em> when they share the same value on these
						fields, within the stacking window below. Example: 10 failed-login alerts from the same host
						in 5 minutes → one “Brute force on host X” cluster.
					</p>
					<div class="mb-2 flex flex-wrap items-center gap-2">
						{#each CORRELATION_PRESETS as preset (preset.field)}
							{@const active = groupByHasField(groupByCsv, preset.field)}
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors {active
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border bg-background hover:bg-muted'}"
								onclick={() => (groupByCsv = toggleGroupByField(groupByCsv, preset.field))}
							>
								{preset.label}
								<span class="text-2xs opacity-70">({preset.field})</span>
							</button>
						{/each}
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label
								for="rule-groupby"
								class="text-2xs uppercase tracking-wide text-muted-foreground"
							>
								Correlation keys (comma-separated)
							</label>
							<Input
								id="rule-groupby"
								placeholder="e.g. alert_customer_id, assets.asset_name"
								bind:value={groupByCsv}
							/>
							<p class="text-2xs text-muted-foreground">
								Tenant scope (<code class="rounded bg-muted px-1">alert_customer_id</code>) is added
								automatically if you don't include it — an alert cluster never mixes tenants.
							</p>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="rule-window"
								class="text-2xs uppercase tracking-wide text-muted-foreground"
							>
								Stacking window (seconds)
							</label>
							<Input
								id="rule-window"
								type="number"
								placeholder="3600"
								bind:value={timeWindowSeconds}
							/>
							<p class="text-2xs text-muted-foreground">
								Alerts that arrive within this window and match the correlation keys above stack
								into the same cluster. Leave blank to stack forever (open alert cluster stays open).
							</p>
						</div>
					</div>
				</div>

				<div class="mt-4 flex flex-col gap-1">
					<label for="rule-title" class="text-2xs uppercase tracking-wide text-muted-foreground">
						AlertCluster title template ({'{alert_title}'} is substituted from the first alert)
					</label>
					<Input
						id="rule-title"
						placeholder="Brute-force cluster: {'{alert_title}'}"
						bind:value={titleTemplate}
					/>
				</div>

				<div class="mt-4 flex flex-wrap items-center gap-3">
					<Button onclick={save}>Save</Button>
					<Button variant="outline" onclick={() => (editing = null)}>Cancel</Button>

					<!--
					  History window used by Test AND Back-fill. Kept as
					  one control on purpose — testing against a window
					  before back-filling on it is the usual workflow, so
					  a shared value avoids accidental mismatches.
					-->
					<div class="flex items-center gap-2 border-l pl-3">
						<label
							for="rule-sample-days"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							History window (days)
						</label>
						<Input
							id="rule-sample-days"
							type="number"
							min="1"
							class="w-24"
							bind:value={sampleDays}
						/>
					</div>

					<Button variant="ghost" onclick={runTest}>
						<PlayIcon class="mr-2 h-4 w-4" /> Test
					</Button>
					<Button
						variant="outline"
						disabled={!editing || editing.rule_id === 0 || backfilling}
						onclick={() => (backfillOpen = true)}
					>
						<RocketIcon class="mr-2 h-4 w-4" />
						{backfilling ? 'Backfilling…' : 'Back-fill previous alerts'}
					</Button>
					{#if testMatches !== null}
						<span class="text-xs text-muted-foreground">
							Matched {testMatches.length} alert(s) from the last {sampleDays} day{sampleDays === 1
								? ''
								: 's'}
						</span>
					{/if}
				</div>
			</section>
		{/if}
	</div>
</div>

<ConfirmationDialog
	bind:open={deleteOpen}
	title="Delete rule?"
	message={ruleToDelete
		? `Delete rule "${ruleToDelete.rule_name}"? This cannot be undone.`
		: 'Delete this rule?'}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>

<ConfirmationDialog
	bind:open={backfillOpen}
	title="Back-fill previous alerts?"
	message={`Apply this rule to matching alerts from the last ${sampleDays} day${sampleDays === 1 ? '' : 's'}. Alerts already grouped into an alert cluster are skipped, and the stacking window / group-by keys keep the operation idempotent — re-running produces no duplicates.`}
	confirmText="Back-fill"
	confirmButtonVariant="default"
	onConfirm={runBackfill}
/>
