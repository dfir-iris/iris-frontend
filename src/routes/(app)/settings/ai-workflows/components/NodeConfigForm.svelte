<!--
  Right-drawer form for the selected node. Edits `node.label` /
  `node.config` in place (the editor's meta map), so the canvas and the
  saved graph see every keystroke.
-->
<script lang="ts">
	import { getContext, onMount, setContext, type Snippet } from 'svelte';
	import { CircleAlertIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { UsersService } from '$lib/services/users.service';
	import {
		AiWorkflowsService,
		aiListData,
		aiWorkflowTriggers,
		type AiWorkflowCatalogue,
		type AiWorkflowSummary
	} from '$lib/services/ai-workflows.service';
	import {
		labelFor,
		nodeIdError,
		NOTE_COLORS,
		NOTE_TYPE,
		type NodeMeta
	} from '$lib/utils/ai-workflow-graph';
	import { Textarea } from '$lib/components/ui/textarea';
	import MultiSelect, { type MultiSelectItem } from './MultiSelect.svelte';
	import JsonField from './JsonField.svelte';
	import PairsEditor from './PairsEditor.svelte';
	import ValueField from './ValueField.svelte';
	import TemplateField from './TemplateField.svelte';
	import TemplateHelp from './TemplateHelp.svelte';
	import PythonEditor from './PythonEditor.svelte';
	import type { TemplateFieldCtx, WorkflowEditorCtx } from '../helpers/editor';
	import type { TemplateMode } from '../helpers/template-complete';
	import {
		toolArguments,
		toolArgumentsSkeleton,
		type ToolArgument
	} from '../helpers/tool-arguments';
	import { displayText } from '../helpers/values';
	import {
		CLASSIFICATION_TONES,
		LABEL_CLASS,
		nodeIcon,
		nodeTone,
		noteTone,
		SELECT_CLASS,
		SUGGESTION_AUDIENCE_LABELS,
		TEMPLATE_FIELD_CTX,
		WORKFLOW_EDITOR_CTX
	} from '../helpers/ui';

	type Props = {
		nodeId: string;
		nodeType: string;
		node: NodeMeta;
		catalogue: AiWorkflowCatalogue | null;
		writeAllowlist: string[];
		errors: string[];
		otherNodes: { id: string; label: string }[];
		readOnly?: boolean;
		onClose: () => void;
		onDelete: () => void;
		/** Gives the node another id (its edges and references follow). */
		onRename?: (id: string) => void;
		/** False hides the delete button (the last trigger of the workflow). */
		deletable?: boolean;
		/** Trigger nodes: the trigger's own form. */
		children?: Snippet;
	};

	let {
		nodeId,
		nodeType,
		node = $bindable(),
		catalogue,
		writeAllowlist,
		errors,
		otherNodes,
		readOnly = false,
		onClose,
		onDelete,
		onRename,
		deletable = true,
		children
	}: Props = $props();

	const c = $derived(node.config);

	setContext<TemplateFieldCtx>(TEMPLATE_FIELD_CTX, {
		get nodeId() {
			return nodeId;
		},
		get callback() {
			return nodeType === 'http_request' && c.mode === 'async';
		}
	});
	const Icon = $derived(nodeIcon(nodeType));
	const typeInfo = $derived(catalogue?.node_types?.find((t) => t.type === nodeType));

	const tools = $derived(catalogue?.tools ?? []);
	// What an agent may be given: the tools kept for action / suggest nodes are left out
	const toolItems = $derived<MultiSelectItem[]>(
		tools
			.filter((t) => t.agent !== false || list<string>(c.tools).includes(t.name))
			.map((t) => ({
				value: t.name,
				label: t.name,
				description: `${t.enabled === false ? '[disabled in MCP settings] ' : ''}${t.description}`,
				badge: t.classification,
				badgeClass: CLASSIFICATION_TONES[t.classification]
			}))
	);
	const toolInfo = (name: unknown) => tools.find((t) => t.name === name);
	// Bumped to reload the arguments field after "Add the required arguments"
	let argumentsRevision = $state(0);

	const RULE_OPERATORS = [
		'eq',
		'ne',
		'gt',
		'gte',
		'lt',
		'lte',
		'contains',
		'not_contains',
		'in',
		'exists',
		'not_exists',
		'truthy',
		'falsy'
	];
	const UNARY = new Set(['exists', 'not_exists', 'truthy', 'falsy']);
	const FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'select', 'date'];
	const SEVERITIES = ['low', 'medium', 'high', 'critical'];
	const SUGGESTION_KINDS = $derived(
		catalogue?.suggestion_kinds?.length
			? catalogue.suggestion_kinds
			: [
					'create_case',
					'merge_into_case',
					'related_alerts',
					'draft_reply',
					'info_request',
					'generic_action'
				]
	);

	let users = $state<MultiSelectItem[]>([]);
	onMount(async () => {
		if (nodeType !== 'notify' && nodeType !== 'ask_analyst' && nodeType !== 'suggest') return;
		const res = await UsersService.listMentionable('');
		if (res.ok && res.data && typeof res.data === 'object') {
			users = (res.data.data ?? []).map((u) => ({
				value: String(u.user_id),
				label: u.user_name || u.user_login,
				description: u.user_login
			}));
		}
	});

	const editor = getContext<WorkflowEditorCtx | undefined>(WORKFLOW_EDITOR_CTX);

	// ---- run_workflow: the other workflows that may be called (they have a "workflow"
	// trigger), and this one as `self`: its id would not survive an export / import ----
	const SELF = 'self';
	let callable = $state<AiWorkflowSummary[] | null>(null);
	let thisWorkflow = $state<AiWorkflowSummary | null>(null);
	onMount(async () => {
		if (nodeType !== 'run_workflow') return;
		const res = await AiWorkflowsService.list();
		const all = res.ok ? aiListData<AiWorkflowSummary>(res.data) : [];
		thisWorkflow = all.find((w) => w.id === editor?.workflowId) ?? null;
		callable = all.filter(
			(w) => w.id !== editor?.workflowId && aiWorkflowTriggers(w).some((t) => t.type === 'workflow')
		);
	});
	const callsSelf = $derived(c.workflow_id === SELF);
	// Picked by id before `self` existed
	const callsSelfById = $derived(
		editor?.workflowId != null && Number(c.workflow_id) === editor.workflowId
	);
	const calledWorkflow = $derived(
		callsSelf || callsSelfById
			? thisWorkflow
			: callable?.find((w) => w.id === Number(c.workflow_id))
	);

	function set(key: string, value: unknown) {
		node.config[key] = value;
	}

	// ---- node id ----
	let idDraft = $derived(nodeId);
	const idError = $derived(
		nodeIdError(
			idDraft.trim(),
			nodeId,
			Object.keys(editor?.nodeTypes ?? {}).map((id) => ({ id }))
		)
	);
	function commitId() {
		const next = idDraft.trim();
		if (next === nodeId || idError || !onRename) {
			if (!idError) idDraft = nodeId;
			return;
		}
		onRename(next);
	}

	const str = displayText;
	const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
	const inputValue = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

	// ---- condition rules ----
	type Rule = { path: string; operator: string; value: unknown };
	function setRule(index: number, patch: Partial<Rule>) {
		set(
			'rules',
			list<Rule>(c.rules).map((r, i) => (i === index ? { ...r, ...patch } : r))
		);
	}

	// ---- ask_analyst fields ----
	type Field = {
		name: string;
		label: string;
		type: string;
		options?: string[];
		required?: boolean;
	};
	function setField(index: number, patch: Partial<Field>) {
		set(
			'fields',
			list<Field>(c.fields).map((f, i) => (i === index ? { ...f, ...patch } : f))
		);
	}

	// What the default audience of a suggest / ask node resolves to
	const workflowAudience = $derived(
		editor ? SUGGESTION_AUDIENCE_LABELS[editor.suggestionAudience] : null
	);

	// ---- suggest proposed_action ----
	const proposed = $derived(
		c.proposed_action && typeof c.proposed_action === 'object'
			? (c.proposed_action as { tool?: string; arguments?: Record<string, unknown> })
			: null
	);

	// ---- suggest actions: a bundle the analyst ticks, instead of proposed_action ----
	type BundledAction = {
		label: string;
		tool: string;
		arguments: Record<string, unknown>;
		when?: string;
	};
	const bundled = $derived(list<BundledAction>(c.actions));
	function setAction(index: number, patch: Partial<BundledAction>) {
		set(
			'actions',
			bundled.map((a, i) => (i === index ? { ...a, ...patch } : a))
		);
	}

	// ---- python inputs: a template string, or {$path} to pass a value as is ----
	type ScriptInput = { name: string; value: unknown };
	const isPath = (v: unknown): v is { $path: string } =>
		v !== null && typeof v === 'object' && '$path' in (v as Record<string, unknown>);
	const inputText = (v: unknown) => (isPath(v) ? str(v.$path) : str(v));
	function setInput(index: number, patch: Partial<ScriptInput>) {
		set(
			'inputs',
			list<ScriptInput>(c.inputs).map((r, i) => (i === index ? { ...r, ...patch } : r))
		);
	}

	// ---- notify: the entity it is about, when not the run's own ----
	type NotifyAbout = { entity_type: string; entity_id: unknown };
	const notifyAbout = $derived(
		c.about && typeof c.about === 'object' && (c.about as NotifyAbout).entity_type
			? (c.about as NotifyAbout)
			: null
	);
	function setAbout(patch: Partial<NotifyAbout>) {
		const next = { entity_type: '', entity_id: '', ...(notifyAbout ?? {}), ...patch };
		set('about', next.entity_type ? next : null);
	}

	// ---- sides of the connectors ----
	const actionTool = $derived(nodeType === 'action' ? toolInfo(c.tool) : undefined);
	const actionNeedsAllowlist = $derived(
		actionTool?.classification === 'write' && !writeAllowlist.includes(actionTool.name)
	);
	const agentWriteTools = $derived(
		list<string>(c.tools).filter(
			(t) => toolInfo(t)?.classification === 'write' && !writeAllowlist.includes(t)
		)
	);
</script>

{#snippet text(
	key: string,
	label: string,
	placeholder = '',
	mono = false,
	mode: TemplateMode = 'template'
)}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<TemplateField
			{mode}
			{mono}
			{placeholder}
			disabled={readOnly}
			value={str(c[key])}
			onInput={(v) => set(key, v)}
			testId={`wf-cfg-${key}`}
		/>
	</label>
{/snippet}

{#snippet area(key: string, label: string, placeholder = '', rows = 4)}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<TemplateField
			multiline
			{rows}
			{placeholder}
			disabled={readOnly}
			value={str(c[key])}
			onInput={(v) => set(key, v)}
			testId={`wf-cfg-${key}`}
		/>
	</label>
{/snippet}

{#snippet num(key: string, label: string, min = 0, nullable = false)}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<Input
			type="number"
			{min}
			class="h-8 text-xs"
			disabled={readOnly}
			value={str(c[key])}
			oninput={(e) => {
				const v = inputValue(e);
				set(key, nullable ? numOrNull(v) : Number(v));
			}}
			data-testid={`wf-cfg-${key}`}
		/>
	</label>
{/snippet}

{#snippet toggle(key: string, label: string)}
	<label class="flex items-center justify-between gap-2 text-xs">
		<span>{label}</span>
		<Switch
			checked={Boolean(c[key])}
			disabled={readOnly}
			onCheckedChange={(v: boolean) => set(key, v)}
		/>
	</label>
{/snippet}

{#snippet choice(key: string, label: string, options: [string, string][])}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<select
			class={SELECT_CLASS}
			disabled={readOnly}
			value={str(c[key])}
			onchange={(e) => set(key, (e.currentTarget as HTMLSelectElement).value)}
			data-testid={`wf-cfg-${key}`}
		>
			{#each options as [value, text] (value)}
				<option {value}>{text}</option>
			{/each}
		</select>
	</label>
{/snippet}

{#snippet userPicker()}
	<MultiSelect
		items={[
			...users,
			...list<number>(c.user_ids)
				.filter((id) => !users.some((u) => u.value === String(id)))
				.map((id) => ({ value: String(id), label: `#${id}` }))
		]}
		values={list<number>(c.user_ids).map(String)}
		placeholder="Select users…"
		disabled={readOnly}
		onChange={(v) => set('user_ids', v.map(Number))}
		testId="wf-cfg-users"
	/>
{/snippet}

{#snippet toolSelect(value: unknown, onPick: (name: string) => void)}
	<select
		class={SELECT_CLASS}
		disabled={readOnly}
		value={str(value)}
		onchange={(e) => onPick((e.currentTarget as HTMLSelectElement).value)}
		data-testid="wf-cfg-tool"
	>
		<option value="">Select a tool…</option>
		{#each ['read', 'write'] as cls (cls)}
			<optgroup label={cls === 'read' ? 'Read tools' : 'Write tools'}>
				{#each tools.filter((t) => t.classification === cls) as t (t.name)}
					<option value={t.name}>{t.name}{t.enabled === false ? ' (disabled)' : ''}</option>
				{/each}
			</optgroup>
		{/each}
		{#if value && !toolInfo(value)}
			<option value={str(value)}>{str(value)} (unknown)</option>
		{/if}
	</select>
{/snippet}

{#snippet argumentList(args: ToolArgument[])}
	<ul class="flex flex-col gap-1">
		{#each args as arg (arg.name)}
			<li data-testid="wf-tool-arg">
				<span class="font-mono font-medium">{arg.name}</span>
				{#if arg.type}<span class="text-muted-foreground"> {arg.type}</span>{/if}
				{#if arg.required}<span class="text-destructive"> required</span>{/if}
				{#if arg.values}
					<span class="text-muted-foreground">
						— one of {arg.values.map((v) => JSON.stringify(v)).join(', ')}
					</span>
				{/if}
				{#if arg.description}<span class="text-muted-foreground"> — {arg.description}</span>{/if}
				{#if arg.pinned}<span class="block text-sky-700 dark:text-sky-400">{arg.pinned}</span>{/if}
				{#if arg.fields.length}
					<div class="mt-1 border-l pl-2">{@render argumentList(arg.fields)}</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet toolHelp(
	name: unknown,
	current: unknown,
	onFill: (args: Record<string, unknown>) => void
)}
	{@const info = toolInfo(name)}
	{#if info}
		{@const args = toolArguments(info.input_schema, info.classification)}
		<div class="rounded-md border bg-muted/20 p-2 text-2xs">
			<p class="flex items-center gap-1">
				<span class={`rounded px-1 ${CLASSIFICATION_TONES[info.classification] ?? 'bg-muted'}`}>
					{info.classification}
				</span>
				<span class="text-muted-foreground">{info.description}</span>
			</p>
			{#if args.length}
				<details class="mt-1" open>
					<summary class="cursor-pointer text-muted-foreground">Arguments</summary>
					<div class="mt-1 max-h-64 overflow-auto" data-testid="wf-tool-args">
						{@render argumentList(args)}
					</div>
					<p class="mt-1 text-muted-foreground">
						Ids come from <span class="font-mono">iris_taxonomies_list</span> (types, statuses,
						TLPs) or from the trigger / earlier nodes, e.g.
						<span class="font-mono">{'{{ trigger.entity_id }}'}</span>.
					</p>
					{#if !readOnly}
						<Button
							variant="outline"
							size="sm"
							class="mt-1 h-6 px-2 text-2xs"
							onclick={() =>
								onFill(toolArgumentsSkeleton(current, info.input_schema, info.classification))}
							data-testid="wf-tool-args-fill"
						>
							Add the required arguments
						</Button>
					{/if}
				</details>
			{:else}
				<p class="mt-1 text-muted-foreground">No arguments.</p>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="flex h-full min-h-0 flex-col" data-testid="wf-node-form">
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<span class={`flex size-6 items-center justify-center rounded ${nodeTone(nodeType)}`}>
			<Icon size={13} />
		</span>
		<div class="min-w-0 flex-1 leading-tight">
			<p class="truncate text-xs font-semibold">{labelFor(nodeType, catalogue?.node_types)}</p>
			<p class="font-mono text-2xs text-muted-foreground">{nodeId}</p>
		</div>
		{#if !readOnly && deletable}
			<button
				type="button"
				class="text-muted-foreground hover:text-destructive"
				aria-label="Delete node"
				title="Delete node"
				onclick={onDelete}
				data-testid="wf-node-delete"
			>
				<Trash2Icon size={14} />
			</button>
		{/if}
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground"
			aria-label="Close"
			onclick={onClose}
		>
			<XIcon size={14} />
		</button>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
		{#if typeInfo?.description}
			<p class="text-2xs text-muted-foreground">{typeInfo.description}</p>
		{/if}

		{#if errors.length}
			<ul
				class="flex flex-col gap-0.5 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-2xs text-destructive"
				data-testid="wf-node-form-errors"
			>
				{#each errors as err, i (i)}
					<li class="flex gap-1"><CircleAlertIcon size={11} class="mt-0.5 shrink-0" />{err}</li>
				{/each}
			</ul>
		{/if}

		{#if nodeType === 'trigger'}
			{@render children?.()}
		{/if}

		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Label</span>
			<Input
				class="h-8 text-xs"
				disabled={readOnly}
				bind:value={node.label}
				data-testid="wf-cfg-label"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>
				Id, read as <code class="font-mono">nodes.{nodeId}.output</code>
			</span>
			<Input
				class="h-8 font-mono text-xs"
				disabled={readOnly || !onRename}
				bind:value={idDraft}
				onblur={commitId}
				onkeydown={(e) => {
					if (e.key === 'Enter') commitId();
					if (e.key === 'Escape') idDraft = nodeId;
				}}
				data-testid="wf-cfg-id"
			/>
			{#if idError}
				<p class="text-2xs text-destructive">{idError}</p>
			{:else if idDraft.trim() !== nodeId}
				<p class="text-2xs text-muted-foreground">
					Press Enter: the links and every <code class="font-mono">nodes.{nodeId}</code>
					reference follow.
				</p>
			{/if}
		</label>

		{#if nodeType === 'trigger'}
			<!-- Its trigger form is at the top -->
		{:else if nodeType === 'ai_agent'}
			{#if catalogue && !catalogue.llm?.enabled}
				<p
					class="flex items-start gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs"
				>
					<TriangleAlertIcon size={12} class="mt-0.5 shrink-0 text-amber-600" />
					No LLM provider is configured (Settings › Chatbot): this node will fail at run time.
				</p>
			{/if}
			{@render area('prompt', 'Prompt (template)', 'Triage {{ entity.alert_title }}…', 8)}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Tools the agent may call</span>
				<MultiSelect
					items={toolItems}
					values={list<string>(c.tools)}
					placeholder="No tools"
					disabled={readOnly}
					onChange={(v) => set('tools', v)}
					testId="wf-cfg-tools"
				/>
				{#if agentWriteTools.length}
					<p class="text-2xs text-amber-700 dark:text-amber-400">
						Not in the write allowlist, so they become suggestions instead of running:
						<span class="font-mono">{agentWriteTools.join(', ')}</span>
					</p>
				{/if}
			</div>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Output JSON schema (optional)</span>
				{#key nodeId}
					<JsonField
						value={c.output_schema}
						objectOnly
						minLines={4}
						maxLines={16}
						{readOnly}
						onChange={(v) => set('output_schema', v)}
					/>
				{/key}
			</div>
			<div class="grid grid-cols-3 gap-2">
				{@render num('max_turns', 'Max turns', 1)}
				{@render num('max_tool_calls', 'Max tool calls', 0)}
				{@render num('timeout_minutes', 'Timeout (min)', 1)}
			</div>
			<p class="-mt-1 text-2xs text-muted-foreground">
				The agent fails (its error port) past the timeout: 10 minutes by default, 60 at most.
			</p>
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Model override (optional)</span>
				<Input
					class="h-8 font-mono text-xs"
					placeholder={catalogue?.llm?.model ?? 'Default model'}
					disabled={readOnly}
					value={str(c.model)}
					oninput={(e) => set('model', inputValue(e).trim() || null)}
				/>
			</label>
			{@render toggle('include_entity', 'Include the entity snapshot in the prompt')}
		{:else if nodeType === 'condition'}
			{@render choice('mode', 'Mode', [
				['rules', 'Rules'],
				['expression', 'Jinja expression']
			])}
			{#if c.mode === 'expression'}
				{@render text(
					'expression',
					'Expression',
					'entity.alert_severity_id >= 4',
					true,
					'expression'
				)}
			{:else}
				{@render choice('logic', 'Match', [
					['and', 'All rules (AND)'],
					['or', 'Any rule (OR)']
				])}
				<div class="flex flex-col gap-1.5">
					{#each list<Rule>(c.rules) as rule, index (index)}
						<div class="flex flex-col gap-1 rounded-md border p-1.5">
							<div class="flex items-center gap-1">
								<TemplateField
									class="flex-1"
									mode="path"
									size="sm"
									placeholder="nodes.n2.output.score"
									disabled={readOnly}
									value={str(rule.path)}
									onInput={(v) => setRule(index, { path: v })}
								/>
								<button
									type="button"
									class="text-muted-foreground hover:text-destructive"
									aria-label="Remove rule"
									disabled={readOnly}
									onclick={() =>
										set(
											'rules',
											list<Rule>(c.rules).filter((_, i) => i !== index)
										)}
								>
									<Trash2Icon size={12} />
								</button>
							</div>
							<div class="grid grid-cols-[110px_minmax(0,1fr)] gap-1">
								<select
									class={SELECT_CLASS}
									disabled={readOnly}
									value={rule.operator}
									onchange={(e) =>
										setRule(index, { operator: (e.currentTarget as HTMLSelectElement).value })}
								>
									{#each RULE_OPERATORS as op (op)}
										<option value={op}>{op}</option>
									{/each}
								</select>
								{#if !UNARY.has(rule.operator)}
									<Input
										class="h-8 font-mono text-xs"
										placeholder="Value"
										disabled={readOnly}
										value={str(rule.value)}
										oninput={(e) => setRule(index, { value: inputValue(e) })}
									/>
								{/if}
							</div>
						</div>
					{/each}
					{#if !readOnly}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="h-7 w-fit gap-1 px-2 text-xs"
							onclick={() =>
								set('rules', [...list<Rule>(c.rules), { path: '', operator: 'eq', value: '' }])}
						>
							<PlusIcon size={12} /> Add rule
						</Button>
					{/if}
				</div>
			{/if}
		{:else if nodeType === 'http_request'}
			<div class="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
				{@render choice('method', 'Method', [
					['GET', 'GET'],
					['POST', 'POST'],
					['PUT', 'PUT'],
					['PATCH', 'PATCH'],
					['DELETE', 'DELETE']
				])}
				{@render text('url', 'URL (template)', 'https://api.example.com/…', true)}
			</div>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Headers</span>
				<PairsEditor
					rows={c.headers}
					{readOnly}
					secrets
					addLabel="Add header"
					onChange={(v) => set('headers', v)}
					testId="wf-cfg-headers"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Query parameters</span>
				<PairsEditor
					rows={c.query_params}
					{readOnly}
					secrets
					addLabel="Add parameter"
					onChange={(v) => set('query_params', v)}
					testId="wf-cfg-query"
				/>
			</div>
			{@render choice('auth_type', 'Authentication', [
				['none', 'None'],
				['basic', 'Basic'],
				['bearer', 'Bearer token'],
				['oauth2_client_credentials', 'OAuth2 client credentials']
			])}
			{#if c.auth_type === 'oauth2_client_credentials'}
				{@render text(
					'oauth_token_url',
					'Token URL (template)',
					'https://login.microsoftonline.com/{{ tenant }}/oauth2/v2.0/token',
					true
				)}
				<div class="grid grid-cols-2 gap-2">
					{@render text('oauth_client_id', 'Client ID', "{{ key('CLIENT_ID') }}", true)}
					{@render text('oauth_client_secret', 'Client secret', "{{ key('CLIENT_SECRET') }}", true)}
				</div>
				<div class="grid grid-cols-2 gap-2">
					{@render text(
						'oauth_scope',
						'Scope (template)',
						'https://api.example.com/.default',
						true
					)}
					{@render choice('oauth_client_auth', 'Client authentication', [
						['body', 'In the body'],
						['basic', 'Basic header']
					])}
				</div>
				<p class="text-2xs text-muted-foreground">
					The token is fetched over https, cached until it expires and sent as a bearer token.
					Reference the client secret with <code class="font-mono">{"{{ key('NAME') }}"}</code>
					and restrict that key to the token endpoint's host.
				</p>
			{/if}
			{#if c.auth_type === 'basic'}
				{@render text('auth_username', 'Username', '', true)}
			{/if}
			{#if c.auth_type === 'basic' || c.auth_type === 'bearer'}
				{@render text(
					'auth_secret',
					c.auth_type === 'basic' ? 'Password' : 'Token',
					"{{ key('API_TOKEN') }}",
					true
				)}
				<p class="text-2xs text-muted-foreground">
					Reference a keystore secret with <code class="font-mono">{"{{ key('NAME') }}"}</code>
					rather than pasting it: the graph is stored in clear.
				</p>
			{/if}
			{@render choice('body_mode', 'Body', [
				['default', 'Default (run context as JSON)'],
				['template', 'Template'],
				['none', 'None']
			])}
			{#if c.body_mode === 'template'}
				{@render area('body_template', 'Body template', '{"alert": {{ entity | tojson }}}', 6)}
				{@render text('content_type', 'Content type', 'application/json', true)}
			{/if}
			<div class="grid grid-cols-2 gap-2">
				{@render choice('mode', 'Mode', [
					['sync', 'Synchronous'],
					['async', 'Wait for a callback']
				])}
				{@render choice('response_format', 'Response', [
					['json', 'JSON'],
					['text', 'Text']
				])}
			</div>
			{#if c.mode === 'async'}
				<p class="text-2xs text-muted-foreground">
					The request carries <code class="font-mono">{'{{ callback.url }}'}</code> /
					<code class="font-mono">{'{{ callback.token }}'}</code>; the run waits until the external
					system POSTs there with
					<code class="font-mono">Authorization: Bearer &lt;token&gt;</code>.
				</p>
			{/if}
			<div class="grid grid-cols-2 gap-2">
				{@render num('timeout_seconds', 'Timeout (s)', 1)}
				{#if c.mode === 'async'}
					{@render num('wait_timeout_minutes', 'Callback timeout (min)', 1)}
				{/if}
			</div>
			{@render toggle('verify_tls', 'Verify TLS certificates')}
			{@render toggle('use_proxy', 'Use the configured proxy')}
		{:else if nodeType === 'ask_analyst'}
			{@render text('title', 'Title', 'Confirm the escalation')}
			{@render area('question', 'Question (template)', '', 4)}
			<div class="flex flex-col gap-1.5">
				<span class={LABEL_CLASS}>Answer fields</span>
				{#each list<Field>(c.fields) as field, index (index)}
					<div class="flex flex-col gap-1 rounded-md border p-1.5">
						<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_auto] items-center gap-1">
							<Input
								class="h-7 font-mono text-xs"
								placeholder="name"
								disabled={readOnly}
								value={str(field.name)}
								oninput={(e) => setField(index, { name: inputValue(e) })}
							/>
							<Input
								class="h-7 text-xs"
								placeholder="Label"
								disabled={readOnly}
								value={str(field.label)}
								oninput={(e) => setField(index, { label: inputValue(e) })}
							/>
							<select
								class="h-7 rounded-md border bg-background px-1 text-xs"
								disabled={readOnly}
								value={field.type}
								onchange={(e) =>
									setField(index, { type: (e.currentTarget as HTMLSelectElement).value })}
							>
								{#each FIELD_TYPES as t (t)}
									<option value={t}>{t}</option>
								{/each}
							</select>
							<button
								type="button"
								class="text-muted-foreground hover:text-destructive"
								aria-label="Remove field"
								disabled={readOnly}
								onclick={() =>
									set(
										'fields',
										list<Field>(c.fields).filter((_, i) => i !== index)
									)}
							>
								<Trash2Icon size={12} />
							</button>
						</div>
						<div class="flex items-center gap-2">
							{#if field.type === 'select'}
								<Input
									class="h-7 flex-1 text-xs"
									placeholder="Options, comma separated"
									disabled={readOnly}
									value={list<string>(field.options).join(', ')}
									onchange={(e) =>
										setField(index, {
											options: inputValue(e)
												.split(',')
												.map((o) => o.trim())
												.filter((o) => o)
										})}
								/>
							{/if}
							<label class="ml-auto flex items-center gap-1 text-2xs">
								<input
									type="checkbox"
									checked={Boolean(field.required)}
									disabled={readOnly}
									onchange={(e) =>
										setField(index, { required: (e.currentTarget as HTMLInputElement).checked })}
								/>
								Required
							</label>
						</div>
					</div>
				{/each}
				{#if !readOnly}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="h-7 w-fit gap-1 px-2 text-xs"
						onclick={() =>
							set('fields', [
								...list<Field>(c.fields),
								{ name: '', label: '', type: 'text', options: [], required: false }
							])}
					>
						<PlusIcon size={12} /> Add field
					</Button>
				{/if}
			</div>
			{@render text(
				'fields_from',
				'Fields from context path (optional)',
				'nodes.n2.output.output.missing_fields',
				true,
				'path'
			)}
			{@render choice('audience', 'Ask', [
				['entity', 'The suggestion audience of the workflow'],
				['triggerer', 'The user who triggered the run'],
				['owner', 'The workflow owner'],
				['users', 'Specific users']
			])}
			<p class="text-2xs text-muted-foreground">
				{#if c.audience === 'triggerer'}
					Whoever started the run, or whose action fired the event.
				{/if}
				Only active users who can see the entity are asked; when none of them can, the question goes
				to the suggestion audience of the workflow.
			</p>
			{#if c.audience === 'users'}
				{@render userPicker()}
			{/if}
			<label class="flex items-center justify-between gap-2 text-xs">
				<span>Pop up the question to the users asked</span>
				<Switch
					checked={c.popup !== false}
					disabled={readOnly}
					onCheckedChange={(v: boolean) => set('popup', v)}
					data-testid="wf-cfg-popup"
				/>
			</label>
			<p class="text-2xs text-muted-foreground">
				Opens the form in a dialog wherever they are in IRIS. Either way the question is listed on
				the entity and in the suggestions inbox.
			</p>
			{@render num('timeout_minutes', 'Timeout (minutes)', 1)}
		{:else if nodeType === 'find_related'}
			{@render choice('source', 'Source', [
				['alert', 'Related to the alert'],
				['search', 'Search value']
			])}
			{#if c.source === 'search'}
				{@render text(
					'search_value',
					'Search value (template)',
					'{{ entity.alert_source_ref }}',
					true
				)}
			{/if}
			<div class="grid grid-cols-2 gap-2">
				{@render num('days_back', 'Days back', 1)}
				{@render num('number_of_nodes', 'Max nodes', 1)}
			</div>
			{@render toggle('open_alerts', 'Open alerts')}
			{@render toggle('closed_alerts', 'Closed alerts')}
			{@render toggle('open_cases', 'Open cases')}
			{@render toggle('closed_cases', 'Closed cases')}
		{:else if nodeType === 'find_war_room_tasks'}
			{@render choice('since', 'Tasks updated since', [
				['last_run', 'The previous run'],
				['minutes', 'A number of minutes']
			])}
			{#if c.since === 'minutes'}
				{@render num('minutes', 'Minutes', 1)}
			{/if}
		{:else if nodeType === 'suggest'}
			{@render choice(
				'kind',
				'Kind',
				SUGGESTION_KINDS.map((k): [string, string] => [k, k.replace(/_/g, ' ')])
			)}
			{@render text('title', 'Title (template)')}
			{@render area('body', 'Body (template, markdown)', '', 5)}
			<div class="grid grid-cols-2 gap-2">
				{@render choice(
					'severity',
					'Severity',
					SEVERITIES.map((s): [string, string] => [s, s])
				)}
				{@render text('confidence', 'Confidence (0-1 or template)', '0.8', true)}
			</div>
			{@render choice('audience', 'Addressed to', [
				['entity', 'The suggestion audience of the workflow'],
				['triggerer', 'The user who triggered the run'],
				['owner', 'The workflow owner'],
				['users', 'Specific users']
			])}
			<p class="text-2xs text-muted-foreground" data-testid="wf-cfg-suggest-audience-help">
				{#if (c.audience ?? 'entity') === 'entity'}
					{workflowAudience
						? `Currently: ${workflowAudience.charAt(0).toLowerCase()}${workflowAudience.slice(1)}. Set it in the workflow settings.`
						: 'Set in the workflow settings.'}
				{:else}
					{#if c.audience === 'triggerer'}
						Whoever started the run, or whose action fired the event.
					{/if}
					Only active users who can see the entity receive it; when none of them can, it goes to the
					suggestion audience of the workflow.
				{/if}
				They are notified and find it in their suggestions inbox; administrators see every suggestion.
				A dry run only goes to whoever started it.
			</p>
			{#if c.audience === 'users'}
				{@render userPicker()}
			{/if}
			<label class="flex items-center justify-between gap-2 text-xs">
				<span>Propose one action the analyst can accept</span>
				<Switch
					checked={proposed !== null}
					disabled={readOnly || bundled.length > 0}
					onCheckedChange={(v: boolean) =>
						set('proposed_action', v ? { tool: '', arguments: {} } : null)}
				/>
			</label>
			{#if proposed}
				{@render toolSelect(proposed.tool, (name) =>
					set('proposed_action', { ...proposed, tool: name })
				)}
				{@render toolHelp(proposed.tool, proposed.arguments, (args) => {
					set('proposed_action', { ...(c.proposed_action as object), arguments: args });
					argumentsRevision += 1;
				})}
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Arguments (JSON, string values are templates)</span>
					{#key `${nodeId}:${argumentsRevision}`}
						<JsonField
							value={proposed.arguments ?? {}}
							emptyValue={{}}
							objectOnly
							minLines={4}
							{readOnly}
							onChange={(v) =>
								set('proposed_action', {
									...(c.proposed_action as object),
									arguments: v
								})}
						/>
					{/key}
				</div>
			{/if}
			{#if !proposed}
				<div class="flex flex-col gap-2" data-testid="wf-cfg-actions">
					<div class="flex items-center justify-between gap-2">
						<span class={LABEL_CLASS}>Bundled actions</span>
						{#if !readOnly}
							<Button
								variant="outline"
								size="sm"
								class="h-6 px-2 text-2xs"
								disabled={bundled.length >= 10}
								onclick={() =>
									set('actions', [...bundled, { label: '', tool: '', arguments: {}, when: '' }])}
								data-testid="wf-cfg-actions-add"
							>
								<PlusIcon size={12} />
								Add an action
							</Button>
						{/if}
					</div>
					<p class="text-2xs text-muted-foreground">
						Several actions in one suggestion (up to 10): the analyst accepts all of them or ticks
						some. An action whose condition is false is left out.
					</p>
					{#each bundled as action, index (index)}
						<div class="flex flex-col gap-1.5 rounded-md border p-2" data-testid="wf-cfg-action">
							<div class="flex items-center gap-1">
								<TemplateField
									class="flex-1"
									size="sm"
									mono={false}
									placeholder="Label, e.g. Set the severity to High"
									disabled={readOnly}
									value={str(action.label)}
									onInput={(v) => setAction(index, { label: v })}
								/>
								{#if !readOnly}
									<Button
										variant="ghost"
										size="sm"
										class="h-6 w-6 p-0"
										aria-label="Remove the action"
										onclick={() =>
											set(
												'actions',
												bundled.filter((_, i) => i !== index)
											)}
									>
										<Trash2Icon size={12} />
									</Button>
								{/if}
							</div>
							{@render toolSelect(action.tool, (name) => setAction(index, { tool: name }))}
							{@render toolHelp(action.tool, action.arguments, (args) => {
								setAction(index, { arguments: args });
								argumentsRevision += 1;
							})}
							<span class={LABEL_CLASS}>Arguments (JSON, string values are templates)</span>
							{#key `${nodeId}:${index}:${argumentsRevision}`}
								<JsonField
									value={action.arguments ?? {}}
									emptyValue={{}}
									objectOnly
									minLines={3}
									{readOnly}
									onChange={(v) => setAction(index, { arguments: v as Record<string, unknown> })}
								/>
							{/key}
							<TemplateField
								mode="expression"
								size="sm"
								mono
								placeholder="Only when (optional), e.g. nodes.checks.output.fix_severity"
								disabled={readOnly}
								value={str(action.when)}
								onInput={(v) => setAction(index, { when: v })}
							/>
						</div>
					{/each}
				</div>
			{/if}
		{:else if nodeType === 'action'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Tool</span>
				{@render toolSelect(c.tool, (name) => set('tool', name))}
			</div>
			{@render toolHelp(c.tool, c.arguments, (args) => {
				set('arguments', args);
				argumentsRevision += 1;
			})}
			{#if actionNeedsAllowlist}
				<p
					class="flex items-start gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs"
				>
					<TriangleAlertIcon size={12} class="mt-0.5 shrink-0 text-amber-600" />
					Write tool not in the workflow's write allowlist: validation will reject it. Add it to the
					allowlist, or use a Suggest node so an analyst accepts it.
				</p>
			{/if}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Arguments (JSON, string values are templates)</span>
				{#key `${nodeId}:${argumentsRevision}`}
					<JsonField
						value={c.arguments ?? {}}
						emptyValue={{}}
						objectOnly
						minLines={4}
						{readOnly}
						onChange={(v) => set('arguments', v)}
					/>
				{/key}
			</div>
		{:else if nodeType === 'notify'}
			{@render choice('audience', 'Notify', [
				['entity', 'People on the entity'],
				['triggerer', 'The user who triggered the run'],
				['owner', 'The workflow owner'],
				['users', 'Specific users']
			])}
			<p class="text-2xs text-muted-foreground">
				{#if (c.audience ?? 'entity') === 'entity'}
					The owner of the alert, cluster or case (a war room: its members) and the user who
					triggered the run or whose action fired the event. When none of them can see the entity,
					the workflow owner is notified instead.
				{:else if c.audience === 'triggerer'}
					Whoever started the run, or whose action fired the event, if they can see the entity.
				{:else}
					Only active users who can see the entity are notified.
				{/if}
				The node's output lists who was notified.
			</p>
			{#if c.audience === 'users'}
				{@render userPicker()}
				<span class={LABEL_CLASS}>Users from the run (optional)</span>
				<div class="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-1">
					<select
						class={SELECT_CLASS}
						disabled={readOnly}
						value={isPath(c.users_from) ? 'path' : 'template'}
						onchange={(e) => {
							const current = inputText(c.users_from);
							set(
								'users_from',
								(e.currentTarget as HTMLSelectElement).value === 'path'
									? { $path: current }
									: current
							);
						}}
						title="A template renders the users; a path reads them as is (a list, …)"
					>
						<option value="template">Template</option>
						<option value="path">Path</option>
					</select>
					<TemplateField
						mode={isPath(c.users_from) ? 'path' : 'template'}
						placeholder={isPath(c.users_from)
							? 'nodes.lookup.output.result.owners'
							: '{{ vars.analyst }}'}
						disabled={readOnly}
						value={inputText(c.users_from)}
						onInput={(v) => set('users_from', isPath(c.users_from) ? { $path: v } : v)}
						testId="wf-cfg-users-from"
					/>
				</div>
				<p class="text-2xs text-muted-foreground">
					User ids, logins or emails, separated by commas, or a list of them or of users (up to 50).
					They are notified with the users selected above.
				</p>
			{/if}
			{@render choice('delivery', 'Deliver as', [
				['notification', 'A notification (bell)'],
				['toast', 'A toast'],
				['both', 'Both']
			])}
			<p class="text-2xs text-muted-foreground">
				{#if (c.delivery ?? 'notification') === 'notification'}
					Kept in the bell, and follows each user's notification settings.
				{:else}
					A toast pops up at once in IRIS for the users connected; nothing is kept, so a user who is
					not connected never sees it.
				{/if}
			</p>
			{@render choice('severity', 'Severity (the icon)', [
				['', 'None'],
				['info', 'Info'],
				['success', 'Success'],
				['warning', 'Warning'],
				['critical', 'Critical']
			])}
			{#if (c.delivery ?? 'notification') !== 'notification'}
				{@render num('timeout_seconds', 'Toast timeout (seconds, 0 = until closed)', 0)}
			{/if}
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>About</span>
				<select
					class={SELECT_CLASS}
					disabled={readOnly}
					value={notifyAbout?.entity_type ?? ''}
					onchange={(e) => setAbout({ entity_type: (e.currentTarget as HTMLSelectElement).value })}
					data-testid="wf-cfg-about-type"
				>
					<option value="">The entity of the run</option>
					<option value="case">A case</option>
					<option value="alert">An alert</option>
					<option value="war_room">A war room</option>
				</select>
			</label>
			{#if notifyAbout}
				<div class="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-1">
					<select
						class={SELECT_CLASS}
						disabled={readOnly}
						value={isPath(notifyAbout.entity_id) ? 'path' : 'template'}
						onchange={(e) => {
							const current = inputText(notifyAbout?.entity_id);
							setAbout({
								entity_id:
									(e.currentTarget as HTMLSelectElement).value === 'path'
										? { $path: current }
										: current
							});
						}}
						title="A template renders the identifier; a path reads it as is"
					>
						<option value="template">Template</option>
						<option value="path">Path</option>
					</select>
					<TemplateField
						mode={isPath(notifyAbout.entity_id) ? 'path' : 'template'}
						placeholder={isPath(notifyAbout.entity_id)
							? 'nodes.room.output.result.war_room_id'
							: '{{ vars.war_room_id }}'}
						disabled={readOnly}
						value={inputText(notifyAbout.entity_id)}
						onInput={(v) =>
							setAbout({ entity_id: isPath(notifyAbout?.entity_id) ? { $path: v } : v })}
						testId="wf-cfg-about-id"
					/>
				</div>
				<p class="text-2xs text-muted-foreground">
					The notification links to this entity, and only users who can see it are notified. It must
					be in the scope of the run: one the run's workflow created, or of its customers.
				</p>
			{/if}
			{@render text('title', 'Title (template)')}
			{@render area('body', 'Body (template)', '', 4)}
		{:else if nodeType === 'delay'}
			{@render num('minutes', 'Minutes', 1)}
		{:else if nodeType === 'run_workflow'}
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Workflow to call</span>
				<select
					class={SELECT_CLASS}
					disabled={readOnly}
					value={c.workflow_id ? String(c.workflow_id) : ''}
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						set('workflow_id', v === SELF ? SELF : v ? Number(v) : null);
					}}
					data-testid="wf-cfg-workflow-id"
				>
					<option value="">{callable === null ? 'Loading…' : 'Pick a workflow…'}</option>
					<option value={SELF}>This workflow (calls itself)</option>
					{#each callable ?? [] as w (w.id)}
						<option value={String(w.id)}>
							{w.name}{w.is_active ? '' : ' (inactive)'}
						</option>
					{/each}
					{#if callsSelfById}
						<option value={String(c.workflow_id)}>This workflow, by id (#{c.workflow_id})</option>
					{:else if c.workflow_id && !callsSelf && callable && !calledWorkflow}
						<option value={String(c.workflow_id)}>#{c.workflow_id} (not callable)</option>
					{/if}
				</select>
				<span class="text-2xs text-muted-foreground">
					Only workflows with a "Called by a workflow" trigger are listed. The called run acts as
					this run's user, on the same entity.
				</span>
				{#if callsSelf}
					<span class="text-2xs text-muted-foreground">
						Runs this workflow from its "Called by a workflow" trigger, which it needs. The chain
						depth limit stops it from calling itself forever.
					</span>
				{:else if callsSelfById}
					<span class="flex items-center gap-1 text-2xs text-amber-600">
						<TriangleAlertIcon class="size-3 shrink-0" />
						Picked by id: choose "This workflow" so the call still works after an export and import.
					</span>
				{/if}
				{#if calledWorkflow && !calledWorkflow.is_active}
					<span class="flex items-center gap-1 text-2xs text-destructive">
						<TriangleAlertIcon class="size-3 shrink-0" />
						This workflow is inactive: the call fails until it is activated.
					</span>
				{/if}
			</label>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}
					>Inputs (available to it as <code>trigger.payload.inputs.NAME</code>)</span
				>
				<PairsEditor
					rows={c.inputs}
					{readOnly}
					structured
					addLabel="Add input"
					onChange={(v) => set('inputs', v)}
					testId="wf-cfg-run-inputs"
				/>
			</div>
			{@render choice('mode', 'Mode', [
				['wait', 'Wait for it to finish'],
				['async', 'Start it and go on']
			])}
			<p class="text-2xs text-muted-foreground">
				{#if (c.mode ?? 'wait') === 'wait'}
					The output is the called run's result: <code>status</code>, <code>vars</code>,
					<code>output</code>. A failed run goes to the error port when it is connected, else fails
					this run.
				{:else}
					The output is the started run's <code>run_uuid</code> and <code>status</code>; its result
					is not awaited.
				{/if}
			</p>
			{#if (c.mode ?? 'wait') === 'wait'}
				{@render num('timeout_minutes', 'Timeout (minutes)', 1)}
			{/if}
		{:else if nodeType === 'set_variables'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Variables (available as <code>vars.NAME</code>)</span>
				<PairsEditor
					rows={c.variables}
					{readOnly}
					structured
					addLabel="Add variable"
					onChange={(v) => set('variables', v)}
					testId="wf-cfg-variables"
				/>
			</div>
		{:else if nodeType === 'python'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Inputs (available as <code>inputs['NAME']</code>)</span>
				{#each list<ScriptInput>(c.inputs) as row, index (index)}
					<div
						class="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-1"
						data-testid="wf-cfg-python-input"
					>
						<Input
							class="h-8 font-mono text-xs"
							placeholder="name"
							disabled={readOnly}
							value={str(row.name)}
							oninput={(e) => setInput(index, { name: inputValue(e) })}
						/>
						<ValueField
							disabled={readOnly}
							value={row.value}
							onChange={(v) => setInput(index, { value: v })}
						/>
						{#if !readOnly}
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								aria-label="Remove input"
								onclick={() =>
									set(
										'inputs',
										list<ScriptInput>(c.inputs).filter((_, i) => i !== index)
									)}
							>
								<Trash2Icon class="h-3.5 w-3.5" />
							</Button>
						{/if}
					</div>
				{/each}
				{#if !readOnly}
					<Button
						variant="outline"
						size="sm"
						class="h-7 self-start text-xs"
						onclick={() => set('inputs', [...list<ScriptInput>(c.inputs), { name: '', value: '' }])}
						data-testid="wf-cfg-python-add-input"
					>
						<PlusIcon class="mr-1 h-3.5 w-3.5" /> Add input
					</Button>
				{/if}
			</div>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Script</span>
				<PythonEditor value={str(c.code)} {readOnly} onInput={(v) => set('code', v)} />
			</div>
			<p class="text-[11px] text-muted-foreground">
				A restricted Python subset, interpreted in a sandbox: plain data only, no imports, no
				classes, no file, network or process access. The script reads <code>inputs</code>,
				<code>entity</code>,
				<code>trigger</code>, <code>nodes</code>, <code>vars</code> and <code>run</code>, and
				assigns its output to <code>result</code> (available as
				<code>nodes.{nodeId}.output.result</code>). An exception follows the <code>error</code> port.
			</p>
			<div class="grid grid-cols-2 gap-2">
				{@render num('timeout_seconds', 'Timeout (seconds)', 1)}
				{@render num('max_steps', 'Max steps', 1000)}
			</div>
		{:else if nodeType === NOTE_TYPE}
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Note (Markdown)</span>
				<Textarea
					rows={10}
					class="text-xs"
					disabled={readOnly}
					placeholder="What this part of the workflow does, and why…"
					value={str(c.text)}
					oninput={(e) => set('text', (e.currentTarget as HTMLTextAreaElement).value)}
					data-testid="wf-cfg-text"
				/>
			</label>
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Colour</span>
				<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Note colour">
					{#each NOTE_COLORS as color (color)}
						<button
							type="button"
							role="radio"
							aria-checked={(c.color ?? 'yellow') === color}
							aria-label={color}
							title={color}
							disabled={readOnly}
							class={`size-6 rounded-full border-2 ${noteTone(color)} ${
								(c.color ?? 'yellow') === color ? '!border-primary' : ''
							}`}
							onclick={() => set('color', color)}
							data-testid={`wf-cfg-color-${color}`}
						></button>
					{/each}
				</div>
			</div>
			<p class="text-2xs text-muted-foreground">
				A note is never connected nor run. Markdown is rendered without images, and only with https
				or relative links. Select it on the canvas and drag its corners to resize it; it stays
				behind the other nodes.
			</p>
		{:else if nodeType === 'stop'}
			{@render choice('status', 'End the run as', [
				['succeeded', 'Succeeded'],
				['failed', 'Failed']
			])}
			{@render text('reason', 'Reason (template)')}
		{:else}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Config (JSON)</span>
				{#key nodeId}
					<JsonField
						value={c}
						emptyValue={{}}
						objectOnly
						{readOnly}
						onChange={(v) => (node.config = v as Record<string, unknown>)}
					/>
				{/key}
			</div>
		{/if}

		{#if nodeType !== 'trigger' && nodeType !== NOTE_TYPE}
			<TemplateHelp
				keystore={catalogue?.keystore ?? []}
				nodes={otherNodes}
				callback={nodeType === 'http_request' && c.mode === 'async'}
			/>
		{/if}
	</div>
</div>
