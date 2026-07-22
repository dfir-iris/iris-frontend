<!--
  Renders a war-room chat message body. Plain text segments stay
  plain; markdown attachment links inserted by the composer are picked
  out and re-rendered as inline resource cards (Event / IOC / Asset /
  Task) so they look like real attached references instead of raw
  `[Asset "foo"](...)` markdown. `@login` mentions are lifted into
  small chips so an operator can spot at a glance who's being paged;
  self-mentions get a warmer highlight so you notice when *you* were
  named.

  The matcher is intentionally narrow: it only recognises the four
  attachment formats the composer emits. Any other markdown link (or
  bare URL) falls through to a plain `<a>` so external URLs the
  operator pastes still hyperlink.
-->
<script lang="ts">
	import {
		AlertCircleIcon,
		AtSignIcon,
		ClockIcon,
		DownloadIcon,
		ExternalLink,
		FileIcon,
		ListChecksIcon,
		MonitorIcon
	} from 'lucide-svelte';
	import { current_user } from '$lib/stores/auth.store';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
	import type { ChatAttachment } from '$lib/services/war-room-chat.service';
	import ChatImageAttachment from './ChatImageAttachment.svelte';

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
		// Optional file attachments (inline uploads) — rendered below the
		// text. Images render inline, everything else as a download link.
		attachments?: ChatAttachment[] | null;
		warRoomId?: number;
	};
	let { body, onAttachmentClick, attachments, warRoomId }: Props = $props();

	const humanBytes = (n: number): string => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
		return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	};

	const isImage = (mime: string | null | undefined): boolean =>
		typeof mime === 'string' && mime.toLowerCase().startsWith('image/');

	type Segment =
		| { kind: 'text'; text: string }
		| {
				kind: 'attachment';
				type: 'event' | 'ioc' | 'asset' | 'task';
				label: string;
				href: string;
		  }
		| {
				kind: 'datastore';
				// `image` → inline `<img>` via bearer-authenticated blob URL;
				// `file` → a download chip. The composer picks the type from
				// the file's mime_type so the renderer doesn't need a second
				// round-trip.
				isImage: boolean;
				label: string;
				warRoomId: number;
				fileId: number;
		  }
		| { kind: 'link'; label: string; href: string }
		| { kind: 'mention'; handle: string };

	// Composer-emitted format: `[Event "Foo"](/case/123/timeline)` etc.
	// Capture: type word, the quoted label, and the href.
	const ATTACH_RE =
		/\[(Event|IOC|Asset|Task) "([^"]+)"\]\((\/[^)\s]+)\)/g;
	// Datastore in-body reference emitted when the operator picks a file
	// via `#`. `warRoomId` and `fileId` are both extracted from the href
	// so the renderer can call the authenticated content endpoint.
	const DATASTORE_RE =
		/\[(Image|File) "([^"]+)"\]\((\/api\/v2\/war-rooms\/(\d+)\/datastore\/(\d+)\/content)\)/g;
	// Fallback for plain markdown links.
	const PLAIN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
	// `@handle` at a word boundary. The negative lookbehind stops us
	// matching the `@` inside an email address (foo@bar.com). Handles
	// are alphanumeric plus `._-`, matching what the composer inserts
	// off `user_login` — same shape as IRIS usernames elsewhere.
	const MENTION_RE = /(?<![A-Za-z0-9._-])@([A-Za-z0-9._-]+)/g;

	const parse = (text: string): Segment[] => {
		if (!text) return [];
		const segments: Segment[] = [];
		let cursor = 0;

		// Collect every recognised span; later spans that would overlap
		// an earlier one get dropped. Order of matcher registration
		// therefore matters — attachments first (most specific),
		// plain markdown links next, then mentions.
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
		DATASTORE_RE.lastIndex = 0;
		while ((m = DATASTORE_RE.exec(text)) !== null) {
			const start = m.index;
			const end = start + m[0].length;
			if (matches.some((x) => start < x.end && end > x.start)) continue;
			matches.push({
				start,
				end,
				seg: {
					kind: 'datastore',
					isImage: m[1] === 'Image',
					label: m[2],
					warRoomId: Number(m[4]),
					fileId: Number(m[5])
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
		MENTION_RE.lastIndex = 0;
		while ((m = MENTION_RE.exec(text)) !== null) {
			const start = m.index;
			const end = start + m[0].length;
			// Skip if the `@handle` sits inside an already-matched span
			// (e.g. inside a markdown link's label or href).
			if (matches.some((x) => start < x.end && end > x.start)) continue;
			matches.push({
				start,
				end,
				seg: { kind: 'mention', handle: m[1] }
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

	// Case-insensitive compare so `@Pamicelli`, `@pamicelli`, and
	// `@PAMICELLI` all pop the same self-highlight. `user_login` is the
	// canonical string the composer inserts, but a human writing a
	// mention by hand may vary the casing.
	const selfLogin = $derived(
		($current_user?.user_login ?? '').toLowerCase() || null
	);
	const isSelfMention = (handle: string) =>
		selfLogin != null && handle.toLowerCase() === selfLogin;

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
			</button>{:else if seg.kind === 'mention'}{@const self = isSelfMention(seg.handle)}<span
				class={[
					'mx-0.5 inline-flex items-baseline gap-0.5 rounded-md border px-1.5 py-0 align-baseline text-2xs font-medium transition-colors',
					self
						? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200'
						: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200'
				]}
				title={self ? `${seg.handle} — that's you` : `Mention: ${seg.handle}`}
			>
				<AtSignIcon class="h-2.5 w-2.5 shrink-0 self-center opacity-80" />{seg.handle}</span
			>{:else if seg.kind === 'datastore'}{#if seg.isImage}<span class="my-1 block"
				><ChatImageAttachment
					warRoomId={seg.warRoomId}
					fileId={seg.fileId}
					filename={seg.label}
				/></span
			>{:else}<a
				href={WarRoomDatastoreService.downloadUrl(seg.warRoomId, seg.fileId)}
				target="_blank"
				rel="noopener noreferrer"
				class="mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-2xs font-medium text-amber-700 no-underline transition-colors hover:brightness-110 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200"
				title={`Datastore file: ${seg.label}`}
			>
				<FileIcon class="h-3 w-3 shrink-0" />
				<span class="truncate">{seg.label}</span>
				<DownloadIcon class="h-2.5 w-2.5 shrink-0 opacity-60" />
			</a>{/if}{:else}<a
				href={seg.href}
				class="text-primary underline-offset-2 hover:underline"
				target={seg.href.startsWith('http') ? '_blank' : undefined}
				rel={seg.href.startsWith('http') ? 'noopener noreferrer' : undefined}
				>{seg.label}</a
			>{/if}
	{/each}
</span>

{#if attachments && attachments.length > 0 && warRoomId != null}
	<div class="mt-1.5 flex flex-col gap-1.5">
		{#each attachments as att (att.file_id)}
			{#if isImage(att.mime_type)}
				<ChatImageAttachment
					warRoomId={warRoomId}
					fileId={att.file_id}
					filename={att.filename}
				/>
			{:else}
				<a
					href={WarRoomDatastoreService.downloadUrl(warRoomId, att.file_id)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex max-w-[24rem] items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs no-underline hover:bg-muted"
				>
					<FileIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-medium">{att.filename}</span>
						<span class="text-2xs text-muted-foreground">
							{humanBytes(att.size_bytes)}
							{att.mime_type ? ` · ${att.mime_type}` : ''}
						</span>
					</span>
					<DownloadIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</a>
			{/if}
		{/each}
	</div>
{/if}
