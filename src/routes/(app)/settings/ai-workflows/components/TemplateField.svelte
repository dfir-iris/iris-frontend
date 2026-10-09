<!--
  A template field of the node config form: `{{ … }}` blocks (or the
  references of a path / expression) are highlighted, and typing in
  one proposes the context paths, the other nodes' outputs, variables,
  keystore entries and filters. Ctrl+Space opens the list anywhere.

  The text is drawn by a backdrop under a transparent input/textarea
  (only its caret and selection show), so both must keep the exact same
  box metrics: padding, border, font and wrapping.
-->
<script lang="ts">
	import { getContext, tick } from 'svelte';
	import { cn } from '$lib/utils';
	import {
		applyCandidate,
		splitSegments,
		templateCandidates,
		templateQuery,
		templateSegments,
		type TemplateCandidate,
		type TemplateMode,
		type TemplateQuery,
		type TemplateSegment,
		type TemplateSources
	} from '../helpers/template-complete';
	import { templateSamples } from '../helpers/template-samples';
	import type { TemplateFieldCtx, WorkflowEditorCtx } from '../helpers/editor';
	import { TEMPLATE_FIELD_CTX, WORKFLOW_EDITOR_CTX } from '../helpers/ui';

	type Props = {
		value: string;
		onInput: (value: string) => void;
		mode?: TemplateMode;
		multiline?: boolean;
		rows?: number;
		/** Single line: `sm` is the compact row height of the list editors. */
		size?: 'sm' | 'md';
		mono?: boolean;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		testId?: string;
	};

	let {
		value,
		onInput,
		mode = 'template',
		multiline = false,
		rows = 4,
		size = 'md',
		mono = true,
		placeholder = '',
		disabled = false,
		class: className = '',
		testId
	}: Props = $props();

	const editor = getContext<WorkflowEditorCtx | undefined>(WORKFLOW_EDITOR_CTX);
	const field = getContext<TemplateFieldCtx | undefined>(TEMPLATE_FIELD_CTX);

	let el = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let backdrop = $state<HTMLDivElement | null>(null);
	let marker = $state<HTMLSpanElement | null>(null);

	let samples = $state<string[]>([]);
	let sampled = false;
	let query = $state<TemplateQuery | null>(null);
	let items = $state<TemplateCandidate[]>([]);
	let active = $state(0);
	let pos = $state({ left: 0, top: 0 });

	const listId = `wf-tpl-${Math.random().toString(36).slice(2, 10)}`;
	const open = $derived(query !== null && items.length > 0);

	const sources = $derived<TemplateSources>({
		nodes: editor
			? Object.entries(editor.nodeTypes)
					.filter(([id]) => id !== field?.nodeId)
					.map(([id, type]) => ({
						id,
						type,
						label: editor.meta[id]?.label ?? '',
						config: editor.meta[id]?.config
					}))
			: [],
		keys: editor?.catalogue?.keystore ?? [],
		samples,
		callback: field?.callback ?? false
	});
	const nodeIds = $derived(editor ? new Set(Object.keys(editor.nodeTypes)) : null);

	const segments = $derived(templateSegments(value, mode, nodeIds));
	const split = $derived(splitSegments(segments, open && query ? query.from : value.length));
	const missing = $derived(
		segments.filter((s) => s.kind === 'invalid').map((s) => s.title ?? '')[0] ?? ''
	);

	const TONES: Record<TemplateSegment['kind'], string> = {
		plain: '',
		brace: 'bg-sky-500/15 text-sky-500 dark:text-sky-400',
		expr: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		invalid: 'bg-destructive/15 text-destructive underline decoration-wavy'
	};

	const KIND_LABELS: Record<TemplateCandidate['kind'], string> = {
		context: 'ctx',
		node: 'node',
		field: 'field',
		var: 'var',
		key: 'key',
		filter: 'filter'
	};

	// Identical box for the field and its backdrop.
	const box = $derived(
		cn(
			'w-full rounded-md border px-2 text-xs',
			mono && 'font-mono',
			multiline
				? 'min-h-[72px] whitespace-pre-wrap break-words py-1.5'
				: cn('whitespace-pre', size === 'sm' ? 'h-7' : 'h-8')
		)
	);

	function loadSamples() {
		if (sampled || !editor) return;
		sampled = true;
		templateSamples(editor.workflowId).then((paths) => (samples = paths));
	}

	function close() {
		query = null;
		items = [];
	}

	/** `auto`: while typing, only open where a completion is likely wanted. */
	function refresh(auto: boolean) {
		if (!el || disabled) return close();
		const caret = el.selectionStart ?? value.length;
		const q = templateQuery(el.value, caret, mode);
		if (!q || (auto && q.kind === 'path' && !q.prefix && !q.fresh)) return close();
		const found = templateCandidates(q, sources);
		if (!found.length || (found.length === 1 && found[0].value === q.prefix)) return close();
		query = q;
		items = found;
		active = 0;
		tick().then(place);
	}

	function place() {
		if (!marker || !backdrop || !el) return;
		const width = el.clientWidth;
		const left = marker.offsetLeft - backdrop.scrollLeft;
		pos = {
			left: Math.max(0, Math.min(left, width - 288)),
			top: marker.offsetTop - backdrop.scrollTop + 18
		};
	}

	function syncScroll() {
		if (el && backdrop) {
			backdrop.scrollTop = el.scrollTop;
			backdrop.scrollLeft = el.scrollLeft;
		}
	}

	function grow() {
		if (!multiline || !el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight + 2}px`;
	}

	$effect(() => {
		void value;
		tick().then(() => {
			grow();
			syncScroll();
		});
	});

	async function accept(candidate: TemplateCandidate) {
		if (!el || !query) return;
		const out = applyCandidate(el.value, query, candidate);
		el.value = out.text;
		onInput(out.text);
		await tick();
		el.focus();
		el.setSelectionRange(out.caret, out.caret);
		syncScroll();
		// `key('` goes on with the keystore names
		if (candidate.value.endsWith("('")) refresh(false);
		else close();
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
			e.preventDefault();
			loadSamples();
			refresh(false);
			return;
		}
		if (!open) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const step = e.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + items.length) % items.length;
			tick().then(() =>
				document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
			);
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			accept(items[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
		}
	}

	function oninput(e: Event) {
		onInput((e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
		refresh(true);
		syncScroll();
	}
</script>

{#snippet backdropText()}{#each split[0] as seg, i (i)}<span class={TONES[seg.kind]}
			>{seg.text}</span
		>{/each}<span bind:this={marker}></span>{#each split[1] as seg, i (i)}<span
			class={TONES[seg.kind]}>{seg.text}</span
		>{/each}{#if multiline}&#8203;{/if}{/snippet}

<div class={cn('relative', className)}>
	<div
		bind:this={backdrop}
		aria-hidden="true"
		class={cn(
			box,
			'pointer-events-none absolute inset-0 overflow-hidden border-transparent bg-background',
			!multiline && 'flex items-center [&>span]:shrink-0'
		)}
	>
		{@render backdropText()}
	</div>
	{#if multiline}
		<textarea
			bind:this={el}
			class={cn(
				box,
				'relative block resize-none overflow-hidden bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
			)}
			{rows}
			{placeholder}
			{disabled}
			{value}
			spellcheck="false"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls={listId}
			{oninput}
			{onkeydown}
			onscroll={syncScroll}
			onclick={close}
			onfocus={loadSamples}
			onblur={close}
			data-testid={testId}
		></textarea>
	{:else}
		<input
			bind:this={el}
			class={cn(
				box,
				'relative block bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
			)}
			{placeholder}
			{disabled}
			{value}
			spellcheck="false"
			autocomplete="off"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls={listId}
			{oninput}
			{onkeydown}
			onscroll={syncScroll}
			onselect={syncScroll}
			onkeyup={syncScroll}
			onclick={close}
			onfocus={loadSamples}
			onblur={close}
			data-testid={testId}
		/>
	{/if}

	{#if open}
		<ul
			id={listId}
			role="listbox"
			class="absolute z-50 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-xs shadow-md"
			style={`left: ${pos.left}px; top: ${pos.top}px`}
			data-testid="wf-template-completions"
		>
			{#each items as item, i (item.value)}
				<li
					id={`${listId}-${i}`}
					role="option"
					aria-selected={i === active}
					class={cn(
						'flex cursor-pointer items-baseline gap-2 rounded px-1.5 py-1',
						i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
					)}
					onmousedown={(e) => {
						// Keep the focus (and the caret) in the field
						e.preventDefault();
						accept(item);
					}}
					onmouseenter={() => (active = i)}
				>
					<span class="w-9 shrink-0 text-right text-2xs text-muted-foreground"
						>{KIND_LABELS[item.kind]}</span
					>
					<span class="min-w-0 flex-1 truncate font-mono">{item.value}</span>
					{#if item.detail}
						<span class="max-w-[45%] truncate text-2xs text-muted-foreground">{item.detail}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
{#if missing}
	<p class="mt-0.5 text-2xs text-destructive">{missing}</p>
{/if}
