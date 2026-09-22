<!--
  Inline chip matching the visual + data-attribute shape of mention chips
  rendered by `mention-node.ts`. Use whenever you want to display a reference
  to a case object (asset, ioc, note, task, alert, user) inside non-tiptap UI
  and have ChipHoverHost wire up the hover popover and detail dialogs for it.

  Colours and glyph come from the shared `./mention-kinds` table, so this
  stays pixel-identical to the chips tiptap renders and to the ones the
  preview sweep decorates.
-->
<script lang="ts">
	import { mentionKindIcon } from './mention-icons';
	import { MENTION_CHIP_BASE_CLASSES, mentionKindStyle, type MentionKind } from './mention-kinds';

	type Kind = MentionKind;

	let {
		kind,
		id,
		label,
		title
	}: {
		kind: Kind;
		id: number | string;
		label: string;
		title?: string;
	} = $props();

	const Icon = $derived(mentionKindIcon(kind));
	const chipClass = $derived(mentionKindStyle(kind).chipClass);
</script>

<span
	class={`${MENTION_CHIP_BASE_CLASSES} max-w-full overflow-hidden align-bottom ${chipClass}`}
	role="button"
	tabindex="0"
	title={title ?? label}
	data-mention=""
	data-kind={kind}
	data-id={String(id)}
	data-label={label}
>
	<Icon size={10} class="shrink-0" aria-hidden="true" />
	<span class="mention-chip-label min-w-0 truncate">{label}</span>
</span>
