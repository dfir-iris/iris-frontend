<!--
  Request body: the default IRIS envelope, a Jinja template, or none.
  Templates start from a preset or from scratch. The side panel lists
  every path the sample event carries (a click inserts it at the cursor
  in the chosen form) and the template syntax.
-->
<script lang="ts">
	import { BookOpenIcon, BracesIcon, PlusIcon, SearchIcon, VariableIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		BODY_PRESETS,
		CONTENT_TYPES,
		flattenContext,
		variableExpression,
		type BodyPreset,
		type InsertStyle,
		type WebhookForm
	} from '../helpers/webhook-form';
	import ChoiceGroup from './ChoiceGroup.svelte';

	type Props = {
		form: WebhookForm;
		context: Record<string, unknown> | null;
		errors: Record<string, string[]>;
	};

	let { form = $bindable(), context, errors }: Props = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let insertStyle = $state<InsertStyle>('escaped');
	let variableQuery = $state('');
	let panel = $state<'variables' | 'syntax'>('variables');
	let pendingPreset = $state<BodyPreset | null>(null);
	let confirmPresetOpen = $state(false);

	const variables = $derived.by(() => {
		const all = context ? flattenContext(context) : [];
		const q = variableQuery.trim().toLowerCase();
		return q
			? all.filter((v) => v.path.toLowerCase().includes(q) || v.preview.toLowerCase().includes(q))
			: all;
	});

	const MODES = [
		{
			value: 'default' as const,
			label: 'IRIS payload',
			title: 'The full event envelope as JSON'
		},
		{ value: 'template' as const, label: 'Custom template', title: 'A Jinja template you write' },
		{ value: 'none' as const, label: 'No body', title: 'Send no body (e.g. for GET)' }
	];

	const INSERT_STYLES = [
		{
			value: 'escaped' as const,
			label: 'In a string',
			title: '{{ x | json_escape }} — for use inside "…" in JSON'
		},
		{ value: 'json' as const, label: 'JSON value', title: '{{ x | tojson }} — a JSON value' },
		{ value: 'raw' as const, label: 'Raw', title: '{{ x }} — the value as text' }
	];

	const SYNTAX: { code: string; text: string }[] = [
		{ code: '{{ title }}', text: 'Print a value.' },
		{ code: '{% if case %}…{% endif %}', text: 'Only when the event belongs to a case.' },
		{ code: '{% for i in items %}…{% endfor %}', text: 'Loop over the objects of the event.' },
		{
			code: '"case": {{ case | tojson }}',
			text: 'tojson — a JSON value, quotes included.'
		},
		{
			code: '"text": "{{ summary | json_escape }}"',
			text: 'json_escape — text inside a JSON string.'
		},
		{
			code: "{{ url | link(title, 'slack') }}",
			text: 'link(text, style) — a link in markdown, slack, html or plain.'
		},
		{
			code: "{{ items | pluck('ioc_value') | tojson }}",
			text: 'pluck(path) — one field of each item.'
		}
	];

	function applyPreset(preset: BodyPreset) {
		if (form.body_template.trim() && form.body_template !== preset.template) {
			pendingPreset = preset;
			confirmPresetOpen = true;
			return;
		}
		usePreset(preset);
	}

	function usePreset(preset: BodyPreset) {
		form.body_mode = 'template';
		form.body_template = preset.template;
		form.content_type = preset.content_type;
		pendingPreset = null;
	}

	function insert(text: string) {
		if (form.body_mode !== 'template') form.body_mode = 'template';
		const el = textarea;
		if (!el) {
			form.body_template += text;
			return;
		}
		const start = el.selectionStart ?? form.body_template.length;
		const end = el.selectionEnd ?? start;
		form.body_template = `${form.body_template.slice(0, start)}${text}${form.body_template.slice(end)}`;
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + text.length, start + text.length);
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab' || e.shiftKey) return;
		e.preventDefault();
		insert('  ');
	}

	const TYPE_TONES: Record<string, string> = {
		string: 'text-emerald-700 dark:text-emerald-400',
		number: 'text-blue-700 dark:text-blue-400',
		boolean: 'text-purple-700 dark:text-purple-400',
		null: 'text-muted-foreground',
		object: 'text-muted-foreground',
		list: 'text-amber-700 dark:text-amber-400'
	};
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<ChoiceGroup options={MODES} bind:value={form.body_mode} ariaLabel="Body mode" />
		<div class="flex flex-wrap items-center gap-2">
			{#if form.body_mode !== 'none'}
				<label class="text-xs text-muted-foreground" for="webhook-content-type">Content-Type</label>
				<Input
					id="webhook-content-type"
					class="h-8 w-56 font-mono text-xs"
					list="webhook-content-types"
					bind:value={form.content_type}
				/>
				<datalist id="webhook-content-types">
					{#each CONTENT_TYPES as type (type)}<option value={type}></option>{/each}
				</datalist>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="h-8 text-xs">
							<BracesIcon size={12} class="mr-1" /> Presets
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-80">
					<DropdownMenu.Label class="text-2xs font-normal text-muted-foreground">
						Replaces the template
					</DropdownMenu.Label>
					{#each BODY_PRESETS as preset (preset.id)}
						<DropdownMenu.Item onSelect={() => applyPreset(preset)}>
							<div class="flex flex-col">
								<span class="text-xs font-medium">{preset.label}</span>
								<span class="text-2xs text-muted-foreground">{preset.description}</span>
							</div>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#each errors.content_type ?? [] as message (message)}
		<p class="text-xs text-destructive">{message}</p>
	{/each}

	{#if form.body_mode === 'default'}
		<div class="flex max-w-3xl flex-col gap-2 text-xs text-muted-foreground">
			<p>
				The IRIS event envelope, as JSON: <code class="font-mono">event</code>,
				<code class="font-mono">event_label</code>, <code class="font-mono">title</code>,
				<code class="font-mono">summary</code>, <code class="font-mono">url</code>,
				<code class="font-mono">case</code>, <code class="font-mono">actor</code>,
				<code class="font-mono">timestamp</code>, <code class="font-mono">delivery_id</code> and the
				full object in <code class="font-mono">data</code>. The preview shows it for the sample
				event.
			</p>
			<p>
				Chat tools (Slack, Teams…) expect their own format: start from one of the
				<b>Presets</b>.
			</p>
		</div>
	{:else if form.body_mode === 'none'}
		<p class="max-w-3xl text-xs text-muted-foreground">
			No body and no Content-Type are sent. Event data can still go in the URL, query parameters or
			headers with <code class="font-mono">{'{{ variables }}'}</code>.
		</p>
	{:else}
		<div
			class="grid min-h-[380px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)]"
		>
			<div class="flex min-h-[380px] min-w-0 flex-col gap-1 xl:min-h-0">
				<Textarea
					bind:ref={textarea}
					bind:value={form.body_template}
					onkeydown={onKeydown}
					spellcheck={false}
					aria-label="Body template"
					class="min-h-0 flex-1 resize-none bg-muted/20 font-mono text-xs leading-relaxed md:text-xs"
					placeholder={'{\n  "text": "{{ title | json_escape }}"\n}'}
					data-testid="webhook-body-template"
				/>
				{#each errors.body_template ?? [] as message (message)}
					<p class="text-xs text-destructive">{message}</p>
				{/each}
			</div>

			<aside
				class="flex max-h-[420px] min-h-0 flex-col overflow-hidden rounded-md border xl:max-h-none"
			>
				<div class="flex border-b text-xs" role="tablist" aria-label="Template helpers">
					{#each [{ id: 'variables', label: 'Variables', icon: VariableIcon }, { id: 'syntax', label: 'Syntax', icon: BookOpenIcon }] as item (item.id)}
						<button
							type="button"
							role="tab"
							aria-selected={panel === item.id}
							class={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
								panel === item.id
									? 'border-primary font-medium text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground'
							}`}
							onclick={() => (panel = item.id as 'variables' | 'syntax')}
						>
							<item.icon size={12} />
							{item.label}
						</button>
					{/each}
				</div>

				{#if panel === 'variables'}
					<div class="flex flex-col gap-2 border-b p-2">
						<div class="relative">
							<SearchIcon
								size={12}
								class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								class="h-7 pl-7 text-xs"
								placeholder="Filter variables"
								bind:value={variableQuery}
							/>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="text-2xs text-muted-foreground">Insert as</span>
							<ChoiceGroup options={INSERT_STYLES} bind:value={insertStyle} ariaLabel="Insert as" />
						</div>
					</div>
					<ul class="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-2xs">
						{#if !context}
							<li class="px-3 py-4 text-center font-sans text-xs text-muted-foreground">
								Loading the sample event…
							</li>
						{:else if variables.length === 0}
							<li class="px-3 py-4 text-center font-sans text-xs text-muted-foreground">
								No variable matches "{variableQuery}".
							</li>
						{/if}
						{#each variables as variable (variable.path)}
							<li>
								<button
									type="button"
									class="group flex w-full items-center gap-2 py-1 pr-2 text-left hover:bg-muted/60"
									style={`padding-left: ${0.75 + (variableQuery ? 0 : variable.depth) * 0.75}rem`}
									title={`Insert ${variableExpression(variable.path, insertStyle)}`}
									onclick={() => insert(variableExpression(variable.path, insertStyle))}
								>
									<span class="shrink-0 text-foreground">
										{variableQuery ? variable.path : variable.path.split(/\.|\[/).pop()}
									</span>
									<span class={`min-w-0 flex-1 truncate text-right ${TYPE_TONES[variable.type]}`}>
										{variable.preview}
									</span>
									<PlusIcon
										size={11}
										class="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
									/>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
						<p class="mb-3 text-muted-foreground">
							Jinja templates. With a JSON content type the rendered body must be valid JSON.
						</p>
						<dl class="flex flex-col gap-3">
							{#each SYNTAX as entry (entry.code)}
								<div class="flex flex-col gap-1">
									<dt>
										<code class="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-2xs"
											>{entry.code}</code
										>
									</dt>
									<dd class="text-muted-foreground">{entry.text}</dd>
								</div>
							{/each}
						</dl>
						<p class="mt-3 text-muted-foreground">
							<code class="font-mono">items</code> is <code class="font-mono">data</code> as a list;
							<code class="font-mono">payload</code> is the whole envelope.
						</p>
					</div>
				{/if}
			</aside>
		</div>
	{/if}
</div>

<ConfirmationDialog
	bind:open={confirmPresetOpen}
	title="Replace the template?"
	message={pendingPreset
		? `The current template will be replaced by the ${pendingPreset.label} preset.`
		: ''}
	confirmText="Replace"
	onConfirm={() => pendingPreset && usePreset(pendingPreset)}
/>
