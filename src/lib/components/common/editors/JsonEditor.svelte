<!--
  Reusable Ace-backed JSON editor.

  Used by the modules-config modal for `textfield_json` parameters
  (legacy IRIS used Ace for the same field type). Lazily imports
  ace-builds in the browser only — SvelteKit SSR would otherwise
  crash on `document` access during build.

  Emits:
    • `oninput(value, isValid, errorMessage)` on every keystroke so the
      surrounding form can disable Save while the JSON is malformed.

  Validation: on every change we attempt JSON.parse and surface the
  error (`Unexpected token "}" at position 42` etc.) — enough to nudge
  the user to the offending character without the heavy lift of a real
  schema validator.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';

	type Props = {
		value: string;
		onInput?: (value: string, isValid: boolean, error: string | null) => void;
		mode?: 'json' | 'html' | 'markdown';
		theme?: 'light' | 'dark';
		minLines?: number;
		maxLines?: number;
		readOnly?: boolean;
	};

	let {
		value = $bindable(''),
		onInput,
		mode = 'json',
		theme = 'light',
		minLines = 12,
		maxLines = 32,
		readOnly = false
	}: Props = $props();

	let container: HTMLDivElement | null = $state(null);
	let editor: any = null;
	let error = $state<string | null>(null);
	let suppressNextChange = false;

	const validateJson = (raw: string): { ok: boolean; err: string | null } => {
		if (mode !== 'json') return { ok: true, err: null };
		if (raw.trim() === '') return { ok: true, err: null };
		try {
			JSON.parse(raw);
			return { ok: true, err: null };
		} catch (e) {
			return { ok: false, err: (e as Error).message };
		}
	};

	onMount(async () => {
		if (!browser || !container) return;

		// Lazy import — keeps Ace out of the SSR bundle and the entry
		// chunk, so pages that never open the editor pay nothing.
		const aceModule = await import('ace-builds/src-noconflict/ace');
		const ace = (aceModule.default ?? aceModule) as typeof import('ace-builds');

		await Promise.all([
			import('ace-builds/src-noconflict/mode-json'),
			import('ace-builds/src-noconflict/mode-html'),
			import('ace-builds/src-noconflict/mode-markdown'),
			import('ace-builds/src-noconflict/theme-github'),
			import('ace-builds/src-noconflict/theme-monokai'),
			import('ace-builds/src-noconflict/ext-language_tools')
		]);

		editor = ace.edit(container, {
			mode: `ace/mode/${mode}`,
			theme: `ace/theme/${theme === 'dark' ? 'monokai' : 'github'}`,
			value,
			minLines,
			maxLines,
			fontSize: 12,
			showPrintMargin: false,
			useWorker: false,
			tabSize: 2,
			useSoftTabs: true,
			wrap: true,
			readOnly
		});

		editor.session.on('change', () => {
			if (suppressNextChange) {
				suppressNextChange = false;
				return;
			}
			const next = editor.getValue();
			value = next;
			const { ok, err } = validateJson(next);
			error = err;
			onInput?.(next, ok, err);
		});

		// Initial sync.
		const { ok, err } = validateJson(value);
		error = err;
		onInput?.(value, ok, err);
	});

	$effect(() => {
		if (!editor) return;
		if (editor.getValue() !== value) {
			suppressNextChange = true;
			editor.setValue(value, -1);
		}
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
			editor = null;
		}
	});
</script>

<div class="flex flex-col gap-1">
	<div bind:this={container} class="w-full rounded-md border font-mono text-xs"></div>
	{#if error}
		<p class="text-2xs text-destructive">
			Invalid JSON: {error}
		</p>
	{/if}
</div>
