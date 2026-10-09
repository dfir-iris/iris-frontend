<!--
  Right-drawer form for the selected node. Edits `node.label` /
  `node.config` in place (the editor's meta map), so the canvas and the
  saved graph see every keystroke.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleAlertIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { UsersService } from '$lib/services/users.service';
	import type { AiWorkflowCatalogue } from '$lib/services/ai-workflows.service';
	import { labelFor, type NodeMeta } from '$lib/utils/ai-workflow-graph';
	import MultiSelect, { type MultiSelectItem } from './MultiSelect.svelte';
	import JsonField from './JsonField.svelte';
	import PairsEditor from './PairsEditor.svelte';
	import TemplateHelp from './TemplateHelp.svelte';
	import {
		CLASSIFICATION_TONES,
		LABEL_CLASS,
		nodeIcon,
		nodeTone,
		SELECT_CLASS,
		TEXTAREA_CLASS
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
		onDelete
	}: Props = $props();

	const c = $derived(node.config);
	const Icon = $derived(nodeIcon(nodeType));
	const typeInfo = $derived(catalogue?.node_types?.find((t) => t.type === nodeType));

	const tools = $derived(catalogue?.tools ?? []);
	const toolItems = $derived<MultiSelectItem[]>(
		tools.map((t) => ({
			value: t.name,
			label: t.name,
			description: `${t.enabled === false ? '[disabled in MCP settings] ' : ''}${t.description}`,
			badge: t.classification,
			badgeClass: CLASSIFICATION_TONES[t.classification]
		}))
	);
	const toolInfo = (name: unknown) => tools.find((t) => t.name === name);

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
	const FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'select'];
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
		if (nodeType !== 'notify') return;
		const res = await UsersService.listMentionable('');
		if (res.ok && res.data && typeof res.data === 'object') {
			users = (res.data.data ?? []).map((u) => ({
				value: String(u.user_id),
				label: u.user_name || u.user_login,
				description: u.user_login
			}));
		}
	});

	function set(key: string, value: unknown) {
		node.config[key] = value;
	}

	const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
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

	// ---- suggest proposed_action ----
	const proposed = $derived(
		c.proposed_action && typeof c.proposed_action === 'object'
			? (c.proposed_action as { tool?: string; arguments?: Record<string, unknown> })
			: null
	);

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
	function setInputMode(index: number, path: boolean) {
		const current = inputText(list<ScriptInput>(c.inputs)[index]?.value);
		setInput(index, { value: path ? { $path: current } : current });
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

{#snippet text(key: string, label: string, placeholder = '', mono = false)}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<Input
			class={`h-8 text-xs ${mono ? 'font-mono' : ''}`}
			{placeholder}
			disabled={readOnly}
			value={str(c[key])}
			oninput={(e) => set(key, inputValue(e))}
			data-testid={`wf-cfg-${key}`}
		/>
	</label>
{/snippet}

{#snippet area(key: string, label: string, placeholder = '', rows = 4)}
	<label class="flex flex-col gap-1">
		<span class={LABEL_CLASS}>{label}</span>
		<textarea
			class={TEXTAREA_CLASS}
			{rows}
			{placeholder}
			disabled={readOnly}
			value={str(c[key])}
			oninput={(e) => set(key, (e.currentTarget as HTMLTextAreaElement).value)}
			data-testid={`wf-cfg-${key}`}
		></textarea>
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

{#snippet toolHelp(name: unknown)}
	{@const info = toolInfo(name)}
	{#if info}
		<div class="rounded-md border bg-muted/20 p-2 text-2xs">
			<p class="flex items-center gap-1">
				<span class={`rounded px-1 ${CLASSIFICATION_TONES[info.classification] ?? 'bg-muted'}`}>
					{info.classification}
				</span>
				<span class="text-muted-foreground">{info.description}</span>
			</p>
			{#if info.input_schema && Object.keys(info.input_schema).length}
				<details class="mt-1">
					<summary class="cursor-pointer text-muted-foreground">Input schema</summary>
					<pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(
							info.input_schema,
							null,
							2
						)}</pre>
				</details>
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
		{#if !readOnly && nodeType !== 'trigger'}
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

		<label class="flex flex-col gap-1">
			<span class={LABEL_CLASS}>Label</span>
			<Input
				class="h-8 text-xs"
				disabled={readOnly}
				bind:value={node.label}
				data-testid="wf-cfg-label"
			/>
		</label>

		{#if nodeType === 'trigger'}
			<p class="text-2xs text-muted-foreground">
				The trigger is configured in the top bar. Its output is the trigger payload.
			</p>
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
			<div class="grid grid-cols-2 gap-2">
				{@render num('max_turns', 'Max turns', 1)}
				{@render num('max_tool_calls', 'Max tool calls', 0)}
			</div>
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
				{@render text('expression', 'Expression', 'entity.alert_severity_id >= 4', true)}
			{:else}
				{@render choice('logic', 'Match', [
					['and', 'All rules (AND)'],
					['or', 'Any rule (OR)']
				])}
				<div class="flex flex-col gap-1.5">
					{#each list<Rule>(c.rules) as rule, index (index)}
						<div class="flex flex-col gap-1 rounded-md border p-1.5">
							<div class="flex items-center gap-1">
								<Input
									class="h-7 flex-1 font-mono text-xs"
									placeholder="nodes.n2.output.score"
									disabled={readOnly}
									value={str(rule.path)}
									oninput={(e) => setRule(index, { path: inputValue(e) })}
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
				['bearer', 'Bearer token']
			])}
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
				true
			)}
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
			<label class="flex items-center justify-between gap-2 text-xs">
				<span>Propose an action the analyst can accept</span>
				<Switch
					checked={proposed !== null}
					disabled={readOnly}
					onCheckedChange={(v: boolean) =>
						set('proposed_action', v ? { tool: '', arguments: {} } : null)}
				/>
			</label>
			{#if proposed}
				{@render toolSelect(proposed.tool, (name) =>
					set('proposed_action', { ...proposed, tool: name })
				)}
				{@render toolHelp(proposed.tool)}
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Arguments (JSON, string values are templates)</span>
					{#key nodeId}
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
		{:else if nodeType === 'action'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Tool</span>
				{@render toolSelect(c.tool, (name) => set('tool', name))}
			</div>
			{@render toolHelp(c.tool)}
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
				{#key nodeId}
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
				['entity', 'Users with access to the entity'],
				['owner', 'The workflow owner'],
				['users', 'Specific users']
			])}
			{#if c.audience === 'users'}
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
			{/if}
			{@render text('title', 'Title (template)')}
			{@render area('body', 'Body (template)', '', 4)}
		{:else if nodeType === 'delay'}
			{@render num('minutes', 'Minutes', 1)}
		{:else if nodeType === 'set_variables'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Variables (available as <code>vars.NAME</code>)</span>
				<PairsEditor
					rows={c.variables}
					{readOnly}
					addLabel="Add variable"
					onChange={(v) => set('variables', v)}
					testId="wf-cfg-variables"
				/>
			</div>
		{:else if nodeType === 'python'}
			<div class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Inputs (available as <code>inputs['NAME']</code>)</span>
				{#each list<ScriptInput>(c.inputs) as row, index (index)}
					<div class="flex items-center gap-1" data-testid="wf-cfg-python-input">
						<Input
							class="h-8 w-24 font-mono text-xs"
							placeholder="name"
							disabled={readOnly}
							value={str(row.name)}
							oninput={(e) => setInput(index, { name: inputValue(e) })}
						/>
						<select
							class={`${SELECT_CLASS} w-24`}
							disabled={readOnly}
							value={isPath(row.value) ? 'path' : 'template'}
							onchange={(e) =>
								setInputMode(index, (e.currentTarget as HTMLSelectElement).value === 'path')}
							title="A template renders text; a path passes the value (object, list, number) as is"
						>
							<option value="template">Template</option>
							<option value="path">Path</option>
						</select>
						<Input
							class="h-8 flex-1 font-mono text-xs"
							placeholder={isPath(row.value)
								? 'nodes.load.output.result'
								: '{{ trigger.entity_id }}'}
							disabled={readOnly}
							value={inputText(row.value)}
							oninput={(e) =>
								setInput(index, {
									value: isPath(row.value) ? { $path: inputValue(e) } : inputValue(e)
								})}
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
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Script</span>
				<textarea
					class={`${TEXTAREA_CLASS} font-mono`}
					rows={18}
					spellcheck="false"
					disabled={readOnly}
					value={str(c.code)}
					oninput={(e) => set('code', (e.currentTarget as HTMLTextAreaElement).value)}
					data-testid="wf-cfg-code"
				></textarea>
			</label>
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

		{#if nodeType !== 'trigger'}
			<TemplateHelp
				keystore={catalogue?.keystore ?? []}
				nodes={otherNodes}
				callback={nodeType === 'http_request' && c.mode === 'async'}
			/>
		{/if}
	</div>
</div>
