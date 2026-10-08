<!--
  A JSON value edited as text (Ace via JsonEditor). `onChange` fires with
  the parsed value whenever the text is valid JSON; an empty text maps
  to `emptyValue`. The text is seeded once from `value`: remount the
  field (`{#key}`) to load another value.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';

	type Props = {
		value: unknown;
		onChange: (value: unknown) => void;
		emptyValue?: unknown;
		minLines?: number;
		maxLines?: number;
		readOnly?: boolean;
		/** Only accept a JSON object (not an array / scalar). */
		objectOnly?: boolean;
	};

	let {
		value,
		onChange,
		emptyValue = null,
		minLines = 6,
		maxLines = 20,
		readOnly = false,
		objectOnly = false
	}: Props = $props();

	let text = $state(
		untrack(() => (value === null || value === undefined ? '' : JSON.stringify(value, null, 2)))
	);
	let shapeError = $state<string | null>(null);

	function onInput(next: string, valid: boolean) {
		shapeError = null;
		if (!valid) return;
		if (next.trim() === '') {
			onChange(emptyValue);
			return;
		}
		const parsed = JSON.parse(next);
		if (objectOnly && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
			shapeError = 'Must be a JSON object';
			return;
		}
		onChange(parsed);
	}
</script>

<JsonEditor
	bind:value={text}
	{onInput}
	{minLines}
	{maxLines}
	{readOnly}
	theme={$mode === 'dark' ? 'dark' : 'light'}
/>
{#if shapeError}
	<p class="text-2xs text-destructive">{shapeError}</p>
{/if}
