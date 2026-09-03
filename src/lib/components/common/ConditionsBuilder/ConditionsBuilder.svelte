<!--
  Recursive AND/OR condition tree editor.

  Emits the same DSL the backend accepts (see
  `app/datamgmt/filtering.py::apply_custom_conditions` — nested groups
  supported since 2026-07-02). A node is either a leaf
  `{field, operator, value}` or a group `{logic, conditions: [...]}`
  where each entry is itself a node.

  Editing model: caller passes `value` (a group at the root) via
  bindable prop; every mutation replaces the tree with a new immutable
  copy so Svelte's reactivity picks it up cleanly.

  The component is intentionally UI-only — no fetch, no schema import,
  no service. Wire it up on the parent by binding `value` and reading
  it back on save.
-->
<script lang="ts" module>
	export type LeafNode = { field: string; operator: string; value?: unknown };
	export type GroupNode = { logic: 'and' | 'or'; conditions: (LeafNode | GroupNode)[] };

	// Coerce user input for operators that take structured values.
	// `in` / `not_in` split on commas → array of trimmed strings;
	// scalar values stay strings. The backend coerces numeric strings
	// to int/float for `gte`/`lte` before binding (see
	// `filtering.py::build_condition`) — keeping them as strings here
	// keeps the JSON round-trip simple.
	export function coerceValue(raw: string, operator: string): unknown {
		if (operator === 'in' || operator === 'not_in') {
			return raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return raw;
	}

	export function emptyRootGroup(): GroupNode {
		return { logic: 'and', conditions: [] };
	}

	// Operator vocabulary — must match `filtering.build_condition` on the
	// backend. `like` / `not_like` do case-insensitive substring; `in` /
	// `not_in` expect a comma-separated `value`.
	export const OPERATORS = [
		{ value: 'eq', label: 'equals' },
		{ value: 'neq', label: '≠ not equals' },
		{ value: 'like', label: 'contains (like)' },
		{ value: 'not_like', label: 'not contains' },
		{ value: 'in', label: 'in (list)' },
		{ value: 'not_in', label: 'not in (list)' },
		{ value: 'gte', label: '≥ greater or equal' },
		{ value: 'lte', label: '≤ less or equal' }
	];

	// `like` / `not_like` compile to Postgres ILIKE, which only exists for
	// text types: `alert_status_id ILIKE '%0%'` raises
	// `operator does not exist: integer ~~* unknown`. The backend now casts
	// non-text columns defensively (filtering.py::_ilike_target) so this is
	// no longer a 500, but substring-matching an id, uuid or timestamp is
	// almost never what the author meant — so don't offer it.
	const STRING_ONLY_OPERATORS = new Set(['like', 'not_like']);

	// Heads of JSON(B) columns. The backend extracts JSON paths as text
	// (`->>`, see `build_json_condition`), so every string operator is valid
	// on `alert_context.<key>` no matter how the key is named.
	const JSON_COLUMN_HEADS = new Set(['alert_context', 'alert_source_content']);

	// Naming conventions for the non-text column types on Alert /
	// AlertCluster. This is a UX guard, not a correctness boundary — the
	// field input is free text, so the backend cast remains the real safety
	// net for anything typed by hand that these patterns miss.
	const NON_TEXT_SUFFIXES = ['_id', '_uuid', '_time', '_at'];
	const NON_TEXT_NAMES = new Set(['date_update']);

	/** True when `field` names a column ILIKE can't be applied to. */
	export function isNonTextField(field: string): boolean {
		const trimmed = (field ?? '').trim();
		if (!trimmed) return false; // nothing typed yet — stay permissive
		const segments = trimmed.split('.');
		// A JSON document path is extracted as text; a relationship path
		// (`assets.asset_type_id`) resolves to a real column, so judge it by
		// its leaf segment.
		if (segments.length > 1 && JSON_COLUMN_HEADS.has(segments[0])) return false;
		const leaf = segments[segments.length - 1];
		return NON_TEXT_NAMES.has(leaf) || NON_TEXT_SUFFIXES.some((s) => leaf.endsWith(s));
	}

	/** Operators offerable for `field`. */
	export function operatorsFor(field: string) {
		if (!isNonTextField(field)) return OPERATORS;
		return OPERATORS.filter((op) => !STRING_ONLY_OPERATORS.has(op.value));
	}

	/**
	 * Keep the select and the emitted DSL in sync. Switching to a numeric
	 * field while `like` is selected would hide the option but still submit
	 * `like`, so fall back to `eq`.
	 */
	export function operatorForField(field: string, current: string): string {
		return isNonTextField(field) && STRING_ONLY_OPERATORS.has(current) ? 'eq' : current;
	}
</script>

<script lang="ts">
	import { PlusIcon, Trash2Icon, LayersIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	type AnyNode = LeafNode | GroupNode;

	// Field-name suggestions per target — sourced directly from the SQLAlchemy
	// models (`app/models/alerts.py::Alert`, `app/models/alert_clusters.py::AlertCluster`).
	// Kept in the same order as the model so the datalist reads top-down like the
	// schema. Not enforced — the field is a free-text Input so callers can also
	// reach relationship.field paths (e.g. `assets.asset_name`, `iocs.ioc_value`)
	// that the backend `apply_custom_conditions` resolves via relationship joins.
	const FIELD_SUGGESTIONS: Record<string, string[]> = {
		alert: [
			// Identity & audit
			'alert_id',
			'alert_uuid',
			// Core content
			'alert_title',
			'alert_description',
			'alert_note',
			'alert_tags',
			// Source metadata
			'alert_source',
			'alert_source_ref',
			'alert_source_link',
			'alert_source_content',
			'alert_source_event_time',
			// Timestamps
			'alert_creation_time',
			// Categorisation
			'alert_severity_id',
			'alert_status_id',
			'alert_classification_id',
			'alert_resolution_status_id',
			// Context blob
			'alert_context',
			// Ownership / tenancy
			'alert_owner_id',
			'alert_customer_id',
			// Flow attachment (cached)
			'alert_investigation_flow_id',
			// Relationship paths — resolved via joins by the backend
			'assets.asset_name',
			'assets.asset_ip',
			'assets.asset_type_id',
			'iocs.ioc_value',
			'iocs.ioc_type_id',
			// JSON-column paths — Postgres drills into the document at
			// query time via `->` / `->>`. See `build_json_condition`
			// on the backend. These placeholders show the shape;
			// authors substitute their own key names.
			'alert_context.severity',
			'alert_context.rule_name',
			'alert_source_content.event_type'
		],
		alert_cluster: [
			'cluster_id',
			'cluster_uuid',
			'cluster_title',
			'cluster_description',
			'cluster_status_id',
			'cluster_severity_id',
			'cluster_customer_id',
			'cluster_owner_id',
			'cluster_creation_time',
			'cluster_source_rule_id',
			'cluster_case_id',
			'cluster_dedupe_key',
			'cluster_investigation_flow_id'
		]
	};

	let {
		value = $bindable<GroupNode>(),
		target = 'alert' as 'alert' | 'alert_cluster'
	}: {
		value: GroupNode;
		target?: 'alert' | 'alert_cluster';
	} = $props();

	const isGroup = (n: AnyNode): n is GroupNode => (n as GroupNode).conditions !== undefined;

	const emptyLeaf = (): LeafNode => ({ field: '', operator: 'eq', value: '' });
	const emptyGroup = (): GroupNode => ({ logic: 'and', conditions: [emptyLeaf()] });

	const fields = $derived(FIELD_SUGGESTIONS[target] ?? []);
	// Compute `listId` reactively — the naive `const` captured the
	// initial `target` value only, which broke the datalist wiring
	// when a caller swapped `target='alert_cluster'` on the same instance.
	const listId = $derived(`condition-fields-${target}`);

	// ---- Path-based mutation ----
	//
	// A `path` is the list of indices from the root down to the target
	// node. We rebuild the tree top-down for every mutation. Direct
	// in-place mutation of a deeply nested $state tree behaves
	// inconsistently across Svelte 5 runes; rebuilding is O(depth) and
	// trivially cheap for any realistic rule tree.
	const cloneReplace = (
		root: GroupNode,
		path: number[],
		replacer: (n: AnyNode) => AnyNode | null
	): GroupNode => {
		if (path.length === 0) {
			const replaced = replacer(root);
			return (replaced && isGroup(replaced) ? replaced : root) as GroupNode;
		}
		const [head, ...rest] = path;
		const child = root.conditions[head];
		if (rest.length === 0) {
			const next = replacer(child);
			const newConds =
				next === null
					? root.conditions.filter((_, i) => i !== head)
					: root.conditions.map((c, i) => (i === head ? next : c));
			return { ...root, conditions: newConds };
		}
		const newChild = cloneReplace(child as GroupNode, rest, replacer);
		return {
			...root,
			conditions: root.conditions.map((c, i) => (i === head ? newChild : c))
		};
	};

	const setNode = (path: number[], next: AnyNode | null) => {
		value = cloneReplace(value, path, () => next);
	};

	const patchLeaf = (path: number[], patch: Partial<LeafNode>) => {
		value = cloneReplace(value, path, (n) => {
			if (isGroup(n)) return n;
			return { ...n, ...patch };
		});
	};

	// Field edits go through their own patcher because changing the field
	// can invalidate the currently-selected operator.
	const patchLeafField = (path: number[], field: string) => {
		value = cloneReplace(value, path, (n) => {
			if (isGroup(n)) return n;
			const leaf = n as LeafNode;
			return { ...leaf, field, operator: operatorForField(field, leaf.operator) };
		});
	};

	const setGroupLogic = (path: number[], logic: 'and' | 'or') => {
		value = cloneReplace(value, path, (n) => (isGroup(n) ? { ...n, logic } : n));
	};

	const addLeaf = (path: number[]) => {
		value = cloneReplace(value, path, (n) => {
			if (!isGroup(n)) return n;
			return { ...n, conditions: [...n.conditions, emptyLeaf()] };
		});
	};

	const addGroup = (path: number[]) => {
		value = cloneReplace(value, path, (n) => {
			if (!isGroup(n)) return n;
			return { ...n, conditions: [...n.conditions, emptyGroup()] };
		});
	};

	const removeAt = (path: number[]) => setNode(path, null);
</script>

<datalist id={listId}>
	{#each fields as f (f)}
		<option value={f}></option>
	{/each}
</datalist>

{#snippet leaf(node: LeafNode, path: number[])}
	<div
		class="grid grid-cols-[1fr_170px_1fr_auto] items-center gap-2 rounded-md border bg-background p-2"
	>
		<Input
			list={listId}
			placeholder="Field (e.g. alert_title)"
			value={node.field}
			oninput={(e) => patchLeafField(path, (e.target as HTMLInputElement).value)}
		/>
		<select
			class="h-9 rounded-md border bg-background px-2 text-sm"
			value={node.operator}
			onchange={(e) => patchLeaf(path, { operator: (e.target as HTMLSelectElement).value })}
		>
			{#each operatorsFor(node.field) as op (op.value)}
				<option value={op.value}>{op.label}</option>
			{/each}
		</select>
		<Input
			placeholder={node.operator === 'in' || node.operator === 'not_in' ? 'a,b,c' : 'Value'}
			value={typeof node.value === 'string'
				? node.value
				: Array.isArray(node.value)
					? (node.value as string[]).join(',')
					: ''}
			oninput={(e) =>
				patchLeaf(path, {
					value: coerceValue((e.target as HTMLInputElement).value, node.operator)
				})}
		/>
		<Button
			size="icon"
			variant="ghost"
			aria-label="Remove condition"
			onclick={() => removeAt(path)}
		>
			<Trash2Icon class="h-4 w-4 text-destructive" />
		</Button>
	</div>
{/snippet}

{#snippet group(node: GroupNode, path: number[])}
	<div
		class="rounded-md border bg-muted/20 p-3 {path.length > 0 ? 'mt-2' : ''}"
		data-depth={path.length}
	>
		<div class="mb-2 flex items-center justify-between">
			<div class="inline-flex items-center gap-1 rounded-full border bg-background p-0.5 text-xs">
				<button
					type="button"
					class="rounded-full px-2 py-0.5 {node.logic === 'and'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => setGroupLogic(path, 'and')}
				>
					AND
				</button>
				<button
					type="button"
					class="rounded-full px-2 py-0.5 {node.logic === 'or'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => setGroupLogic(path, 'or')}
				>
					OR
				</button>
			</div>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" onclick={() => addLeaf(path)}>
					<PlusIcon class="mr-1 h-3.5 w-3.5" /> Condition
				</Button>
				<Button size="sm" variant="outline" onclick={() => addGroup(path)}>
					<LayersIcon class="mr-1 h-3.5 w-3.5" /> Group
				</Button>
				{#if path.length > 0}
					<Button
						size="icon"
						variant="ghost"
						aria-label="Remove group"
						onclick={() => removeAt(path)}
					>
						<Trash2Icon class="h-4 w-4 text-destructive" />
					</Button>
				{/if}
			</div>
		</div>

		{#if node.conditions.length === 0}
			<p class="text-xs italic text-muted-foreground">
				Empty group — add a condition or a nested group.
			</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each node.conditions as child, idx (idx)}
					{#if isGroup(child)}
						{@render group(child, [...path, idx])}
					{:else}
						{@render leaf(child, [...path, idx])}
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<!-- Root -->
{@render group(value, [])}
