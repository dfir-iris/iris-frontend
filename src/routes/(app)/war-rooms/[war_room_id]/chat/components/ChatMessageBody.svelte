<!--
  Renders a war-room chat message body. Plain text segments stay
  plain; markdown attachment links inserted by the composer are picked
  out and re-rendered as inline resource cards (Event / IOC / Asset /
  Task) so they look like real attached references instead of raw
  `[Asset "foo"](...)` markdown.

  The matcher is intentionally narrow: it only recognises the four
  formats the composer emits. Any other markdown link (or bare URL)
  falls through to a plain `<a>` so external URLs the operator
  pastes still hyperlink.
-->
<script lang="ts">
	import {
		AlertCircleIcon,
		ClockIcon,
		ExternalLink,
		ListChecksIcon,
		MonitorIcon
	} from 'lucide-svelte';

	type Props = {
		body: string;
		// When set, the parent handles attachment clicks (typically to
		// open a preview modal) rather than letting the browser follow
		// the href.
		onAttachmentClick?: (target: {
			type: 'event' | 'ioc' | 'asset' | 'task';
			label: string;
			href: string;
		}) => void;
	};
	let { body, onAttachmentClick }: Props = $props();

	type Segment =
		| { kind: 'text'; text: string }
		| {
				kind: 'attachment';
				type: 'event' | 'ioc' | 'asset' | 'task';
				label: string;
				href: string;
		  }
		| { kind: 'link'; label: string; href: string };

	// Composer-emitted format: `[Event "Foo"](/case/123/timeline)` etc.
	// Capture: type word, the quoted label, and the href.
	const ATTACH_RE =
		/\[(Event|IOC|Asset|Task) "([^"]+)"\]\((\/[^)\s]+)\)/g;
	// Fallback for plain markdown links.
	const PLAIN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;

	const parse = (text: string): Segment[] => {
		if (!text) return [];
		const segments: Segment[] = [];
		let cursor = 0;

		// First pass: pull every attachment we recognise. Anything not
		// claimed by the attachment matcher falls through to the
		// plain-link pass, then to literal text.
		const matches: Array<{
			start: number;
			end: number;
			seg: Segment;
		}> = [];
		ATTACH_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = ATTACH_RE.exec(text)) !== null) {
			const typeWord = m[1].toLowerCase() as
				| 'event'
				| 'ioc'
				| 'asset'
				| 'task';
			matches.push({
				start: m.index,
				end: m.index + m[0].length,
				seg: {
					kind: 'attachment',
					type: typeWord,
					label: m[2],
					href: m[3]
				}
			});
		}
		PLAIN_LINK_RE.lastIndex = 0;
		while ((m = PLAIN_LINK_RE.exec(text)) !== null) {
			const start = m.index;
			const end = start + m[0].length;
			// Skip if any attachment match already covers this span.
			if (matches.some((x) => start < x.end && end > x.start)) continue;
			matches.push({
				start,
				end,
				seg: { kind: 'link', label: m[1], href: m[2] }
			});
		}
		matches.sort((a, b) => a.start - b.start);

		for (const m of matches) {
			if (m.start > cursor) {
				segments.push({ kind: 'text', text: text.slice(cursor, m.start) });
			}
			segments.push(m.seg);
			cursor = m.end;
		}
		if (cursor < text.length) {
			segments.push({ kind: 'text', text: text.slice(cursor) });
		}
		return segments;
	};

	const segments = $derived(parse(body));

	const attachmentMeta = (type: 'event' | 'ioc' | 'asset' | 'task') => {
		switch (type) {
			case 'event':
				return {
					Icon: ClockIcon,
					label: 'Event',
					cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200'
				};
			case 'ioc':
				return {
					Icon: AlertCircleIcon,
					label: 'IOC',
					cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
				};
			case 'asset':
				return {
					Icon: MonitorIcon,
					label: 'Asset',
					cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
				};
			case 'task':
				return {
					Icon: ListChecksIcon,
					label: 'Task',
					cls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-200'
				};
		}
	};
</script>

<span class="inline whitespace-pre-wrap break-words">
	{#each segments as seg, i (i)}
		{#if seg.kind === 'text'}{seg.text}{:else if seg.kind === 'attachment'}{@const meta = attachmentMeta(seg.type)}<button
				type="button"
				class={[
					'mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-2xs font-medium transition-colors hover:brightness-110',
					meta.cls
				]}
				title={`${meta.label}: ${seg.label} — click to preview`}
				onclick={() => {
					if (onAttachmentClick) {
						onAttachmentClick({ type: seg.type, label: seg.label, href: seg.href });
					} else {
						window.location.assign(seg.href);
					}
				}}
			>
				<meta.Icon class="h-3 w-3 shrink-0" />
				<span class="truncate">{seg.label}</span>
				<ExternalLink class="h-2.5 w-2.5 shrink-0 opacity-60" />
			</button>{:else}<a
				href={seg.href}
				class="text-primary underline-offset-2 hover:underline"
				target={seg.href.startsWith('http') ? '_blank' : undefined}
				rel={seg.href.startsWith('http') ? 'noopener noreferrer' : undefined}
				>{seg.label}</a
			>{/if}
	{/each}
</span>
