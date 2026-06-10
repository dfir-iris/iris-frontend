<!--
  Inline chip matching the visual + data-attribute shape of mention chips
  rendered by `mention-node.ts`. Use whenever you want to display a reference
  to a case object (asset, ioc, note, task, user) inside non-tiptap UI and
  have ChipHoverHost wire up the hover popover and detail dialogs for it.
-->
<script lang="ts">
	import {
		BoxIcon,
		ShieldAlertIcon,
		FileTextIcon,
		ClipboardListIcon,
		UserIcon
	} from 'lucide-svelte';

	type Kind = 'user' | 'asset' | 'ioc' | 'note' | 'task';

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

	const colorFor = (k: Kind) => {
		if (k === 'asset') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
		if (k === 'ioc') return 'bg-red-500/15 text-red-700 dark:text-red-300';
		if (k === 'note') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
		if (k === 'task') return 'bg-violet-500/15 text-violet-700 dark:text-violet-300';
		return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
	};

	const Icon = $derived(
		kind === 'asset'
			? BoxIcon
			: kind === 'ioc'
				? ShieldAlertIcon
				: kind === 'note'
					? FileTextIcon
					: kind === 'task'
						? ClipboardListIcon
						: UserIcon
	);
</script>

<span
	class={`mention-chip mention-chip-clickable inline-flex cursor-pointer items-center gap-0.5 rounded px-1 py-0 text-xs font-medium ${colorFor(kind)}`}
	role="button"
	tabindex="0"
	title={title ?? label}
	data-mention=""
	data-kind={kind}
	data-id={String(id)}
	data-label={label}
>
	<Icon size={10} aria-hidden="true" />
	<span class="mention-chip-label">{label}</span>
</span>
