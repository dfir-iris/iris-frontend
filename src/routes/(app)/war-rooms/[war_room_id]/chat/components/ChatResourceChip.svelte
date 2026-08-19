<!--
  Inline reference to an Event / IOC / Asset / Task that the composer
  attached to a chat message.

  Mounted imperatively by <ChatMessageBody> into a placeholder inside the
  rendered markdown, so it takes plain props rather than reading context.
-->
<script lang="ts">
	import {
		AlertCircleIcon,
		ClockIcon,
		ExternalLink,
		ListChecksIcon,
		MonitorIcon
	} from 'lucide-svelte';
	import type { ResourceChipType } from './chat-body-markdown';

	type Props = {
		type: ResourceChipType;
		label: string;
		href: string;
		// When set, the chat page handles the click (typically opening a
		// preview modal) rather than letting the browser navigate.
		onActivate?: (target: { type: ResourceChipType; label: string; href: string }) => void;
	};

	let { type, label, href, onActivate }: Props = $props();

	const meta = $derived.by(() => {
		switch (type) {
			case 'event':
				return {
					Icon: ClockIcon,
					kind: 'Event',
					cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200'
				};
			case 'ioc':
				return {
					Icon: AlertCircleIcon,
					kind: 'IOC',
					cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
				};
			case 'asset':
				return {
					Icon: MonitorIcon,
					kind: 'Asset',
					cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
				};
			case 'task':
				return {
					Icon: ListChecksIcon,
					kind: 'Task',
					cls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-200'
				};
		}
	});
</script>

<button
	type="button"
	class={[
		'mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-2xs font-medium no-underline transition-colors hover:brightness-110',
		meta.cls
	]}
	title={`${meta.kind}: ${label} — click to preview`}
	onclick={() => {
		if (onActivate) onActivate({ type, label, href });
		else window.location.assign(href);
	}}
>
	<meta.Icon class="h-3 w-3 shrink-0" />
	<span class="truncate">{label}</span>
	<ExternalLink class="h-2.5 w-2.5 shrink-0 opacity-60" />
</button>
