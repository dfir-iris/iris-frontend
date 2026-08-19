<!--
  Renders a war-room chat message body as markdown, through the same
  <MarkDownPreview> (showdown + DOMPurify) that notes, summaries and case
  descriptions use — so `**bold**`, `` `code` ``, lists, tables and links
  behave the way they do everywhere else in IRIS.

  What markdown alone can't do is the interactive bits: attachment
  references inserted by the composer render as Event / IOC / Asset /
  Task chips, datastore references as inline images or download chips,
  and `@login` as a mention chip. Those are Svelte components, and
  markdown output is an HTML string, so they're stitched in afterwards:
  see chat-body-markdown.ts for the placeholder scheme, and the effect
  below for the mounting.
-->
<script lang="ts">
	import { mount, tick, unmount } from 'svelte';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import type { ChatAttachment } from '$lib/services/war-room-chat.service';
	import ChatMessageAttachments from './ChatMessageAttachments.svelte';
	import ChatDatastoreChip from './ChatDatastoreChip.svelte';
	import ChatMentionChip from './ChatMentionChip.svelte';
	import ChatResourceChip from './ChatResourceChip.svelte';
	import {
		isResourceChipType,
		isSafeChipHref,
		markMentions,
		toMarkdownSource,
		type ResourceChipType
	} from './chat-body-markdown';

	type Props = {
		body: string;
		// When set, the parent handles attachment clicks (typically to
		// open a preview modal) rather than letting the browser follow
		// the href.
		onAttachmentClick?: (target: { type: ResourceChipType; label: string; href: string }) => void;
		// Optional file attachments (inline uploads) — handed to
		// <ChatMessageAttachments> and rendered below the text.
		attachments?: ChatAttachment[] | null;
		warRoomId?: number;
		/**
		 * System rows sit the body on the same line as the actor name, so
		 * the prose container and its paragraphs have to go inline. Only
		 * safe for the short single-paragraph bodies the backend emits.
		 */
		inline?: boolean;
	};

	let { body, onAttachmentClick, attachments, warRoomId, inline = false }: Props = $props();

	const source = $derived(toMarkdownSource(body));

	let host = $state<HTMLElement | null>(null);

	/**
	 * `text-[length:inherit]` puts the surrounding size back: `prose-sm`
	 * pins 0.875rem, which is a size up from the thread pane's `text-xs`
	 * replies. `[&>p:last-child]:inline` keeps the trailing "(edited)"
	 * and pin markers on the same line as the last paragraph instead of
	 * dropping them onto a row of their own.
	 */
	const proseClass = $derived(
		inline
			? 'inline text-[length:inherit] [&_p]:my-0 [&>p]:inline'
			: 'text-[length:inherit] [&>p:last-child]:inline'
	);

	// Stitch the interactive chips into the rendered markdown. Depends on
	// `source` alone: that's exactly when <MarkDownPreview> replaces its
	// `{@html}` subtree and wipes whatever was mounted last time.
	$effect(() => {
		void source;

		const el = host;
		if (!el) return;

		const instances: Record<string, unknown>[] = [];
		let disposed = false;

		// `{@html}` is applied in a render effect, which for a child
		// component isn't guaranteed to have run by the time this parent
		// effect fires. Waiting a tick removes the ordering assumption
		// altogether; it resolves in a microtask, so nothing paints in
		// between.
		void tick().then(() => {
			if (disposed || !host) return;

			markMentions(host);

			for (const node of host.querySelectorAll<HTMLElement>('[data-iris-chip]')) {
				// A previous run already filled this one in.
				if (node.childElementCount > 0) continue;

				const kind = node.getAttribute('data-iris-chip');
				const label = node.getAttribute('data-label') ?? '';

				if (kind === 'resource') {
					const type = node.getAttribute('data-type');
					const href = node.getAttribute('data-href');
					if (!isResourceChipType(type) || !isSafeChipHref(href)) continue;
					instances.push(
						mount(ChatResourceChip, {
							target: node,
							props: { type, label, href, onActivate: onAttachmentClick }
						})
					);
					continue;
				}

				if (kind === 'datastore') {
					const roomId = Number(node.getAttribute('data-war-room'));
					const fileId = Number(node.getAttribute('data-file'));
					if (!Number.isFinite(roomId) || !Number.isFinite(fileId)) continue;
					instances.push(
						mount(ChatDatastoreChip, {
							target: node,
							props: {
								isImage: node.getAttribute('data-kind') === 'image',
								label,
								warRoomId: roomId,
								fileId
							}
						})
					);
				}
			}

			for (const node of host.querySelectorAll<HTMLElement>('[data-iris-mention]')) {
				if (node.childElementCount > 0) continue;
				instances.push(
					mount(ChatMentionChip, {
						target: node,
						props: { handle: node.getAttribute('data-iris-mention') ?? '' }
					})
				);
			}
		});

		return () => {
			disposed = true;
			for (const instance of instances) void unmount(instance);
		};
	});
</script>

<svelte:element this={inline ? 'span' : 'div'} bind:this={host} class={inline ? 'inline' : ''}>
	<MarkDownPreview markdown={source} class={proseClass} />
</svelte:element>

<ChatMessageAttachments {attachments} {warRoomId} />
