<!--
  Advanced condition editor for the alerts search page.

  Exposes the same nested AND/OR/NOT tree the backend understands
  (see `app/datamgmt/filtering.py::apply_custom_conditions`) via two
  interchangeable UIs:

    * Builder — the shared ConditionsBuilder, prefilled with
      alert-field suggestions (alert_note, comments.comment_text,
      JSON paths, relationship paths, ...).
    * JSON   — the Ace-backed JsonEditor for hand-authoring or
      pasting a saved payload.

  State model: the caller owns the wire value as a JSON string on
  `Filters.custom_conditions`. This panel parses that string into a
  GroupNode for the builder; every mutation (from either tab) is
  serialised back with `onChange(nextValue)`. Empty trees emit
  `undefined` so the URL and query string don't end up with a
  meaningless `custom_conditions=[]`.

  The user must click "Apply Filters" in the parent AlertFilters to
  actually re-run the search — this component just updates the
  pending Filters value, matching the rest of the panel.
-->
<script lang="ts">
	import { CodeIcon, WrenchIcon } from 'lucide-svelte';
	import ConditionsBuilder, {
		emptyRootGroup,
		type GroupNode,
		type LeafNode
	} from '$lib/components/common/ConditionsBuilder/ConditionsBuilder.svelte';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	type Props = {
		value: string | undefined;
		onChange: (next: string | undefined) => void;
	};

	let { value, onChange }: Props = $props();

	type AnyNode = LeafNode | GroupNode;

	// Root nodes must be groups so ConditionsBuilder can render its
	// logic switcher. Bare leaves at the root would still validate on
	// the backend but the builder UI would have no anchor to hang the
	// AND/OR toggle off.
	const wrapAsRootGroup = (parsed: unknown): GroupNode => {
		if (
			parsed &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			(parsed as GroupNode).conditions !== undefined
		) {
			return parsed as GroupNode;
		}
		if (Array.isArray(parsed)) {
			return { logic: 'and', conditions: parsed as AnyNode[] };
		}
		return emptyRootGroup();
	};

	const parseValue = (raw: string | undefined): GroupNode => {
		if (!raw || raw.trim() === '') return emptyRootGroup();
		try {
			return wrapAsRootGroup(JSON.parse(raw));
		} catch {
			// Fall back to an empty tree if the incoming JSON is
			// malformed. The JSON tab still shows the raw string so
			// the user can hand-fix it there.
			return emptyRootGroup();
		}
	};

	// A tree is meaningful only when it has at least one leaf somewhere
	// in the recursion. Empty groups (from clicking "Add group" without
	// filling it in) collapse to `undefined` so we don't ship the noise
	// on the wire.
	const hasAnyLeaf = (node: AnyNode): boolean => {
		if ((node as GroupNode).conditions === undefined) return true;
		return (node as GroupNode).conditions.some(hasAnyLeaf);
	};

	// Serialise a tree back to the caller. Emits `undefined` when the
	// tree has no leaves so the alerts page treats the filter as
	// inactive (URL param cleared, chip not shown).
	const emit = (node: GroupNode) => {
		if (!hasAnyLeaf(node)) {
			onChange(undefined);
			return;
		}
		onChange(JSON.stringify(node));
	};

	// Local editable copy — parsed lazily from the incoming string and
	// re-synced whenever the parent replaces `value` (e.g. reset,
	// preset load, URL navigation).
	// eslint-disable-next-line svelte/valid-compile
	let tree = $state<GroupNode>(parseValue(value));
	// eslint-disable-next-line svelte/valid-compile
	let jsonText = $state<string>(value ?? '');
	let jsonError = $state<string | null>(null);
	let activeTab = $state<'builder' | 'json'>('builder');

	// Normalise a candidate wire string (parse → compact stringify) so
	// "same tree, different whitespace / key order" compares equal.
	// Returns `undefined` for empty/invalid input so both sides collapse
	// to the same "no filter" sentinel.
	const normaliseWire = (raw: string | undefined): string | undefined => {
		if (!raw || raw.trim() === '') return undefined;
		try {
			const parsed = wrapAsRootGroup(JSON.parse(raw));
			return hasAnyLeaf(parsed) ? JSON.stringify(parsed) : undefined;
		} catch {
			return undefined;
		}
	};

	// Seed `lastSynced` with the compact form of the parsed tree so the
	// tree-watching effect below sees no change on mount even if the
	// incoming string had different whitespace / key ordering.
	// eslint-disable-next-line svelte/valid-compile
	let lastSynced = $state<string | undefined>(hasAnyLeaf(tree) ? JSON.stringify(tree) : undefined);

	// When the caller replaces `value` from the outside (reset, preset
	// load, URL navigation), refresh both editors. Compare normalised
	// forms so the parent echoing back the same tree with different
	// whitespace doesn't kick this effect and blow away in-progress
	// edits.
	$effect(() => {
		const incoming = normaliseWire(value);
		if (incoming === lastSynced) return;
		lastSynced = incoming;
		tree = parseValue(value);
		jsonText = value ?? '';
		jsonError = null;
	});

	// Serialise the tree whenever the builder mutates it. `lastSynced`
	// gates the two effects: neither re-fires when the wire string is
	// already in sync. Pretty-printed copy stays mirrored into
	// `jsonText` so switching to the JSON tab is lossless.
	$effect(() => {
		const compact = hasAnyLeaf(tree) ? JSON.stringify(tree) : undefined;
		if (compact === lastSynced) return;
		lastSynced = compact;
		jsonText = compact === undefined ? '' : JSON.stringify(tree, null, 2);
		jsonError = null;
		emit(tree);
	});

	const onJsonInput = (next: string, isValid: boolean, error: string | null) => {
		jsonText = next;
		if (!isValid) {
			jsonError = error;
			return;
		}
		jsonError = null;
		if (next.trim() === '') {
			tree = emptyRootGroup();
			lastSynced = undefined;
			onChange(undefined);
			return;
		}
		try {
			const parsed = wrapAsRootGroup(JSON.parse(next));
			const wire = hasAnyLeaf(parsed) ? JSON.stringify(parsed) : undefined;
			// Update `lastSynced` *before* touching `tree` — assigning to
			// `tree` triggers the builder-watching effect, and we don't
			// want that effect to fire onChange again with the exact
			// same wire form we're about to emit here.
			lastSynced = wire;
			tree = parsed;
			onChange(wire);
		} catch {
			// Should not happen when JsonEditor says the JSON is valid,
			// but guard anyway.
			jsonError = 'Unable to parse condition tree';
		}
	};

	const clear = () => {
		tree = emptyRootGroup();
		jsonText = '';
		jsonError = null;
		lastSynced = undefined;
		onChange(undefined);
	};
</script>

<div class="rounded-lg border bg-background/60 p-3">
	<div class="mb-2 flex items-center justify-between gap-2">
		<div class="text-xs font-medium text-muted-foreground">
			Custom conditions
			<span class="ml-1 text-muted-foreground/70">
				— reach fields the filter grid doesn't expose (e.g.
				<code class="font-mono text-2xs">alert_note</code>,
				<code class="font-mono text-2xs">comments.comment_text</code>,
				<code class="font-mono text-2xs">alert_context.*</code>)
			</span>
		</div>
		{#if value}
			<button
				type="button"
				class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={clear}
			>
				Clear
			</button>
		{/if}
	</div>

	<Tabs value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)} class="w-full">
		<TabsList class="h-auto rounded-md bg-muted/50 p-0.5">
			<TabsTrigger
				value="builder"
				class="flex items-center gap-1.5 rounded px-3 py-1 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
			>
				<WrenchIcon class="h-3.5 w-3.5" />
				Builder
			</TabsTrigger>
			<TabsTrigger
				value="json"
				class="flex items-center gap-1.5 rounded px-3 py-1 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
			>
				<CodeIcon class="h-3.5 w-3.5" />
				JSON
			</TabsTrigger>
		</TabsList>

		<TabsContent value="builder" class="mt-3">
			<!--
			  ConditionsBuilder edits the tree in place via bind:value.
			  The $effect above watches `tree` and serialises it back
			  to the parent through `onChange`.
			-->
			<ConditionsBuilder bind:value={tree} target="alert" />
		</TabsContent>

		<TabsContent value="json" class="mt-3">
			<JsonEditor value={jsonText} onInput={onJsonInput} minLines={8} maxLines={24} />
			{#if jsonError}
				<div class="mt-1.5 text-xs text-destructive">{jsonError}</div>
			{/if}
			<div class="mt-2 text-2xs text-muted-foreground">
				Example:
				<code class="font-mono">
					{`{"logic":"and","conditions":[{"field":"alert_note","operator":"like","value":"false positive"}]}`}
				</code>
			</div>
		</TabsContent>
	</Tabs>
</div>
