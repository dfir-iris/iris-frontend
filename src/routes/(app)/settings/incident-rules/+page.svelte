<!--
  Incident-rules admin. Rules stack alerts into incidents.

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
	import { IncidentRulesService, type BackfillRuleResponse } from '$lib/services/incident-rules.service';
	import type { IncidentRule } from '$lib/types/resources/incident-rule';

	let rules = $state<IncidentRule[]>([]);
	let loading = $state(false);
	let editing = $state<IncidentRule | null>(null);
	let conditionsTree = $state<GroupNode>(emptyRootGroup());
	let timeWindowSeconds = $state<number | null>(null);
	let groupByCsv = $state('');
	let titleTemplate = $state('');
	let testMatches = $state<number[] | null>(null);

	let deleteOpen = $state(false);
	let ruleToDelete = $state<IncidentRule | null>(null);

	let backfillOpen = $state(false);
	let backfilling = $state(false);

	const showError = (msg: string) => toast({ title: msg, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		loading = true;
		try {
			const res = await IncidentRulesService.list();
			rules = (res.data as IncidentRule[]) ?? [];
		} catch {
			showError('Failed to load rules');
		} finally {
			loading = false;
		}
	};

	const startEdit = (rule: IncidentRule | null) => {
		editing = rule ?? {
			rule_id: 0,
			rule_uuid: '',
			rule_name: 'New rule',
			rule_description: '',
			rule_is_active: true,
			rule_priority: 100,
			rule_customer_scope: null,
			rule_conditions: { logic: 'and', conditions: [] },
			rule_action_type: 'create_incident',
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
			rule_action_type: 'create_incident' as const,
			rule_action_config: {
				...(titleTemplate ? { title_template: titleTemplate } : {})
			}
		};
		try {
			if (editing.rule_id === 0) {
				await IncidentRulesService.create(body);
				showSuccess('Rule created');
			} else {
				await IncidentRulesService.update(editing.rule_id, body);
				showSuccess('Rule updated');
			}
			editing = null;
			await load();
		} catch {
			showError('Failed to save rule');
		}
	};

	const askDelete = (rule: IncidentRule) => {
		ruleToDelete = rule;
		deleteOpen = true;
	};

	const confirmDelete = async () => {
		if (!ruleToDelete) return;
		try {
			await IncidentRulesService.remove(ruleToDelete.rule_id);
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
			const res = await IncidentRulesService.test(editing.rule_id, { sample_days: 30 });
			testMatches =
				(res.data as { matching_alert_ids?: number[] })?.matching_alert_ids ?? [];
		} catch {
			showError('Test failed');
		}
	};

	const runBackfill = async () => {
		if (!editing || editing.rule_id === 0) return;
		backfilling = true;
		try {
			const res = await IncidentRulesService.backfill(editing.rule_id, {
				sample_days: 30
			});
			const payload =
				res.data && typeof res.data === 'object' ? (res.data as BackfillRuleResponse) : null;
			if (payload) {
				const parts: string[] = [];
				if (payload.attached) parts.push(`${payload.attached} attached`);
				if (payload.skipped_already_in_incident)
					parts.push(`${payload.skipped_already_in_incident} skipped (already in incident)`);
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
	<title>Incident rules</title>
</svelte:head>

<div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
	<header class="flex items-center justify-between border-b pb-3">
		<div class="flex items-center gap-2">
			<FilterIcon class="h-5 w-5 text-muted-foreground" />
			<div>
				<h1 class="text-base font-semibold">Incident rules</h1>
				<p class="text-2xs uppercase tracking-wide text-muted-foreground">
					Auto-stack alerts into incidents on match
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
				No rules yet. Create one to auto-group repeat alerts into a single incident.
			</p>
		{:else}
			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/40">
						<tr class="text-left">
							<th class="px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground"
								>Name</th
							>
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
						<label
							for="rule-name"
							class="text-2xs uppercase tracking-wide text-muted-foreground">Name</label
						>
						<Input id="rule-name" bind:value={editing.rule_name} />
					</div>
					<div class="flex flex-col gap-1">
						<label
							for="rule-desc"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
							>Description</label
						>
						<Input id="rule-desc" bind:value={editing.rule_description as string} />
					</div>
				</div>

				<div class="mt-3 grid gap-3 sm:grid-cols-3">
					<div class="flex flex-col gap-1">
						<label
							for="rule-priority"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
							>Priority</label
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
						JSON fields work with dotted paths — e.g. <code
							class="rounded bg-muted px-1 py-0.5"
							>alert_context.severity</code
						>
						drills into the JSON document at query time. Relationship paths like
						<code class="rounded bg-muted px-1 py-0.5">assets.asset_name</code> join the
						related table.
					</p>
				</div>

				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label
							for="rule-window"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Stacking window (seconds — alerts inside the same window and same
							group-by keys stack)
						</label>
						<Input
							id="rule-window"
							type="number"
							placeholder="3600"
							bind:value={timeWindowSeconds}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label
							for="rule-groupby"
							class="text-2xs uppercase tracking-wide text-muted-foreground"
						>
							Group by (comma-separated fields)
						</label>
						<Input
							id="rule-groupby"
							placeholder="alert_customer_id, alert_source"
							bind:value={groupByCsv}
						/>
					</div>
				</div>

				<div class="mt-4 flex flex-col gap-1">
					<label
						for="rule-title"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Incident title template ({'{alert_title}'} is substituted from the first alert)
					</label>
					<Input
						id="rule-title"
						placeholder="Brute-force cluster: {'{alert_title}'}"
						bind:value={titleTemplate}
					/>
				</div>

				<div class="mt-4 flex flex-wrap items-center gap-2">
					<Button onclick={save}>Save</Button>
					<Button variant="outline" onclick={() => (editing = null)}>Cancel</Button>
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
							Matched {testMatches.length} alert(s) from the last 30 days
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
	message={`Apply this rule to matching alerts from the last 30 days. Alerts already grouped into an incident are skipped, and the stacking window / group-by keys keep the operation idempotent — re-running produces no duplicates.`}
	confirmText="Back-fill"
	confirmButtonVariant="default"
	onConfirm={runBackfill}
/>
