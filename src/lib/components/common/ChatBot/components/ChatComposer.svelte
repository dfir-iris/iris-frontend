<!--
  Chat composer — one textarea + a Send button.

  Enter submits; Shift+Enter inserts a newline. Disabled while a stream
  is in-flight so the analyst can't stack turns before the assistant
  finishes replying (would confuse the model AND the persisted turn
  order).
-->
<script lang="ts">
	import { SendIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		disabled,
		placeholder = 'Ask Yuki anything — summarise, extract, draft…',
		onSend
	}: {
		disabled: boolean;
		placeholder?: string;
		// May return a promise resolving to `false` if the send failed —
		// in that case we keep the input's text so the analyst can
		// retry without retyping. Sync `void` returns are treated as
		// success (preserves the existing fire-and-forget path).
		onSend: (text: string) => void | Promise<boolean | void>;
	} = $props();

	let text = $state('');

	async function submit() {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		// Clear optimistically — restore only if the caller explicitly
		// signals failure with `false`. Snappier UX for the 99% happy
		// path, no lost input on the 1% auto-create-failed path.
		const stash = text;
		text = '';
		try {
			const result = onSend(trimmed);
			if (result && typeof (result as Promise<boolean>).then === 'function') {
				const ok = await (result as Promise<boolean | void>);
				if (ok === false) text = stash;
			}
		} catch {
			text = stash;
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="flex items-end gap-2 border-t bg-background p-2">
	<Textarea
		bind:value={text}
		{placeholder}
		{disabled}
		rows={2}
		class="flex-1 resize-none text-xs"
		onkeydown={onKeyDown}
	/>
	<Button size="sm" onclick={submit} {disabled}>
		<SendIcon size={14} />
	</Button>
</div>
