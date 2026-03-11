<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { LinkIcon, ListIcon, ListOrderedIcon, SheetIcon } from 'lucide-svelte';
	import ace from 'ace-builds/src-noconflict/ace';
	import type { Ace } from 'ace-builds';
	import 'ace-builds/src-noconflict/mode-markdown';
	import 'ace-builds/src-noconflict/ext-language_tools';
	import Preview from './Preview.svelte';

	let { value, onChange, onSave } = $props<{
		value: string;
		onChange: (v: string) => void;
		onSave: () => void;
	}>();

	let editorElement: HTMLDivElement;
	let editor: Ace.Editor | null = null;

	const insertSnippet = (editor: Ace.Editor, snippet: string) => {
		const snippetManager = ace.require('ace/snippets').snippetManager as {
			insertSnippet: (ed: Ace.Editor, s: string) => void;
		};

		snippetManager.insertSnippet(editor, snippet);
		editor.focus();
	};

	onMount(() => {
		editor = ace.edit(editorElement, {
			mode: 'ace/mode/markdown',
			value: value ?? '',
			showPrintMargin: false,
			wrap: true,
			useWorker: false
		});

		(editor as Ace.Editor).setOptions({
			enableBasicAutocompletion: true,
			enableLiveAutocompletion: true
		});

		(editor as Ace.Editor).getSession().on('change', () => {
			if (!editor) return;

			const md = editor.getValue();
			onChange(md);
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'bold',
			bindKey: { win: 'Ctrl-B', mac: 'Cmd-B' },
			exec: (e) => insertSnippet(e, '**${1:$SELECTION}**')
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'italic',
			bindKey: { win: 'Ctrl-I', mac: 'Cmd-I' },
			exec: (e) => insertSnippet(e, '*${1:$SELECTION}*')
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'save',
			bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' },
			exec: () => onSave()
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'save',
			bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' },
			exec: () => onSave()
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'head_1',
			bindKey: { win: 'Ctrl-Shift-1', mac: 'Cmd-Shift-1' },
			exec: (e) => insertSnippet(e, '# ${1:$SELECTION}')
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'head_2',
			bindKey: { win: 'Ctrl-Shift-2', mac: 'Cmd-Shift-2' },
			exec: (e) => insertSnippet(e, '## ${1:$SELECTION}')
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'head_3',
			bindKey: { win: 'Ctrl-Shift-3', mac: 'Cmd-Shift-3' },
			exec: (e) => insertSnippet(e, '### ${1:$SELECTION}')
		});

		(editor as Ace.Editor).commands.addCommand({
			name: 'head_4',
			bindKey: { win: 'Ctrl-Shift-4', mac: 'Cmd-Shift-4' },
			exec: (e) => insertSnippet(e, '#### ${1:$SELECTION}')
		});
	});

	$effect(() => {
		if (!editor) return;

		const current = editor.getValue();

		if ((value ?? '') !== current) {
			editor.setValue(value ?? '', -1);
		}
	});

	onDestroy(() => editor?.destroy());
</script>

<div class="space-y-2">
	<div class="flex flex-wrap gap-2">
		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '**${1:$SELECTION}**')}
		>
			B
		</button>

		<button
			class="rounded-md border px-3 py-1 italic"
			onclick={() => insertSnippet(editor as Ace.Editor, '*${1:$SELECTION}*')}
		>
			I
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '# ${1:$SELECTION}')}
		>
			H1
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '## ${1:$SELECTION}')}
		>
			H2
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '### ${1:$SELECTION}')}
		>
			H3
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '#### ${1:$SELECTION}')}
		>
			H4
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '```\\n${1:$SELECTION}\\n```')}
		>
			{'</>'}
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '[${1:$SELECTION}](url)')}
		>
			<LinkIcon />
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '|\t|\t|\t|\n|--|--|--|\n|\t|\t|\t|\n')}
		>
			<SheetIcon />
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '\n- ')}
		>
			<ListIcon />
		</button>

		<button
			class="rounded-md border px-3 py-1"
			onclick={() => insertSnippet(editor as Ace.Editor, '\n1. ')}
		>
			<ListOrderedIcon />
		</button>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="rounded-md border bg-background">
			<div bind:this={editorElement} class="h-full min-h-24 w-full"></div>
		</div>

		<div class="rounded-md border bg-background p-3">
			<Preview markdown={value} />
		</div>
	</div>
</div>
