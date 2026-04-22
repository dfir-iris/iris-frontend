<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BoldIcon,
		CodeIcon,
		Columns3Icon,
		Heading1Icon,
		Heading2Icon,
		Heading3Icon,
		ImageIcon,
		ItalicIcon,
		LinkIcon,
		ListIcon,
		ListOrderedIcon,
		QuoteIcon,
		Rows3Icon,
		StrikethroughIcon,
		TableIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import { normalizeLegacyContent } from './legacy-content';
	import { ResizableImageNodeView } from './resizable-image';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Table } from '@tiptap/extension-table';
	import { TableRow } from '@tiptap/extension-table-row';
	import { TableHeader } from '@tiptap/extension-table-header';
	import { TableCell } from '@tiptap/extension-table-cell';
	import { Markdown } from 'tiptap-markdown';
	import { Step } from '@tiptap/pm/transform';
	import { ApiService } from '$lib/services/api.service';
	import { auth } from '$lib/stores/auth.store';
	import { io, type Socket } from 'socket.io-client';
	import { env } from '$env/dynamic/public';

	let {
		value,
		onChange,
		onSave,
		caseId,
		noteId,
		collabMode,
		savedAt,
		onRemoteSave,
		onRemoteChange
	} = $props<{
		value: string;
		onChange: (v: string) => void;
		onSave: () => void;
		caseId?: number | string | null;
		noteId?: number | string | null;
		collabMode?: 'case' | 'note';
		savedAt?: number;
		onRemoteSave?: (content: string) => void;
		onRemoteChange?: (user: string) => void;
	}>();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = null;
	let skipUpdate = false;
	let uploading = $state(false);
	let typingUser = $state<string | null>(null);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;
	// Reactive flag for the contextual table toolbar. Updated from the tiptap
	// selection-update hook so Svelte re-renders the toolbar when the caret
	// moves into or out of a table cell.
	let inTable = $state(false);

	// --- Socket.IO collaboration ---
	let socket: Socket | null = null;
	// Flag: true when applying remote changes OR prop-sync setContent — prevents
	// re-emitting on the socket and prevents onChange from firing back to the parent.
	let suppressLocal = false;
	// Track which room we've asked the server to put us in, so the channel-change
	// $effect below can re-join when the caller swaps caseId / noteId without
	// remounting the editor.
	let joinedChannel: string | null = null;

	// Collaboration mode: 'case' (summary) uses case-wide channel + generic change/save
	// events; 'note' uses a per-note channel + change-note/save-note events so two
	// notes in the same case don't clobber each other's edits.
	//
	// Channel format MUST start with `case-{caseId}` because the backend's
	// ac_socket_requires decorator parses the case id from the channel string as
	// `int(chan_id.replace('case-', '').split('-')[0])` to check access rights.
	const mode = $derived(collabMode ?? (noteId ? 'note' : 'case'));
	const channel = $derived(
		mode === 'note'
			? caseId && noteId
				? `case-${caseId}-note-${noteId}`
				: null
			: caseId
				? `case-${caseId}`
				: null
	);
	const joinEvent = $derived(mode === 'note' ? 'join-notes' : 'join');
	const changeEvent = $derived(mode === 'note' ? 'change-note' : 'change');
	const saveEvent = $derived(mode === 'note' ? 'save-note' : 'save');

	const connectSocket = () => {
		if (!channel) return;

		const token = auth.getAccessToken();
		const baseUrl = env.PUBLIC_EXTERNAL_API_URL?.replace(/\/$/, '') ?? '';

		socket = io(baseUrl, {
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			transports: ['polling', 'websocket']
		});

		socket.on('connect', () => {
			if (!channel) return;
			socket?.emit(joinEvent, { channel });
			joinedChannel = channel;
		});

		socket.on('connect_error', (err) => {
			console.error('Socket connection error:', err.message);
		});

		socket.on(
			changeEvent,
			(data: { steps?: unknown[]; channel?: string; last_change?: string }) => {
				if (!editor || !data.steps?.length) return;

				// Show typing indicator
				if (data.last_change) {
					typingUser = data.last_change;
					onRemoteChange?.(data.last_change);
					if (typingTimeout) clearTimeout(typingTimeout);
					typingTimeout = setTimeout(() => (typingUser = null), 2000);
				}

				suppressLocal = true;
				try {
					const tr = editor.state.tr;
					for (const stepJson of data.steps) {
						const step = Step.fromJSON(editor.state.schema, stepJson as Record<string, unknown>);
						tr.step(step);
					}
					editor.view.dispatch(tr);
				} catch (e) {
					// Steps couldn't be applied (e.g. position mismatch from concurrent edits).
					// Fall back to a full re-fetch of the description so clients converge.
					console.warn('Collab step apply failed, requesting full sync', e);
				} finally {
					suppressLocal = false;
				}
			}
		);

		socket.on(saveEvent, (data: { content?: string; last_saved?: string }) => {
			typingUser = null;

			if (!data.content || !editor) return;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const localMd = (editor.storage as any).markdown.getMarkdown() as string;

			const normalized = normalizeLegacyContent(data.content);
			if (localMd !== normalized) {
				// Out of sync — replace content with what was saved
				suppressLocal = true;
				try {
					editor.commands.setContent(normalized);
				} finally {
					suppressLocal = false;
				}
			}

			// Tell parent to mark as saved (sets baseDescription = caseDescription)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const md = (editor.storage as any).markdown.getMarkdown() as string;
			onChange(md);
			onRemoteSave?.(md);
		});
	};

	const disconnectSocket = () => {
		socket?.disconnect();
		socket = null;
	};

	// --- Image upload ---
	const uploadImage = async (file: File): Promise<string | null> => {
		if (!caseId) return null;

		const base64 = await new Promise<string>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(';base64,')[1]);
			};
			reader.readAsDataURL(file);
		});

		const filename = file.name || `image-${Date.now()}.png`;

		// v2 case-scoped datastore upload. The backend returns a full
		// `/api/v2/cases/{caseId}/datastore/files/{fileId}` URL which is
		// directly usable as an <img src> — cid is part of the path, no
		// query param or proxy rewriting needed.
		const res = await ApiService.post<{ file_url: string }>(
			`/api/v2/cases/${caseId}/datastore/files/interactive`,
			{ file_content: base64, file_original_name: filename }
		);

		if (res.ok && res.data && typeof res.data === 'object' && 'file_url' in res.data) {
			return (res.data as { file_url: string }).file_url;
		}

		return null;
	};

	const handleImageUpload = async (file: File) => {
		if (!editor || !caseId) return;

		uploading = true;
		try {
			const url = await uploadImage(file);
			if (url) {
				editor.chain().focus().setImage({ src: url, alt: file.name || 'image' }).run();
			}
		} finally {
			uploading = false;
		}
	};

	// Heuristic: does this text contain markdown syntax we want to interpret
	// rather than insert literally? Headings, lists, tables, fenced code, blockquotes,
	// bold/italic, inline code, links — we parse anything that has a telltale
	// markdown token. Plain prose without any markdown falls through to the
	// default paste path.
	const looksLikeMarkdown = (text: string): boolean => {
		if (!text) return false;
		return (
			/^\s{0,3}#{1,6}\s/m.test(text) || // headings
			/^\s{0,3}[-*+]\s+/m.test(text) || // unordered list
			/^\s{0,3}\d+\.\s+/m.test(text) || // ordered list
			/^\s{0,3}>\s/m.test(text) || // blockquote
			/^\s{0,3}```/m.test(text) || // fenced code
			/^\s{0,3}\|.*\|\s*$/m.test(text) || // table row
			/\*\*[^*]+\*\*/.test(text) || // bold
			/(^|[^*])\*[^*\s][^*]*\*/.test(text) || // italic
			/`[^`]+`/.test(text) || // inline code
			/\[[^\]]+\]\([^)]+\)/.test(text) // link
		);
	};

	const handlePaste = (_view: unknown, event: ClipboardEvent) => {
		const items = event.clipboardData?.items;
		const clipboard = event.clipboardData;

		// 1. Image files on the clipboard — upload and insert as <img>.
		//    Covers: screenshots (Cmd-Shift-4), "copy image" from browsers,
		//    pasting a file from the OS file manager.
		if (items && caseId) {
			for (const item of items) {
				if (item.kind === 'file' && item.type.startsWith('image/')) {
					event.preventDefault();
					const file = item.getAsFile();
					if (file) handleImageUpload(file);
					return true;
				}
			}
		}

		// 2. Markdown source pasted as text. Browsers often include an HTML
		//    representation alongside plain text (e.g. copying from GitHub's
		//    rendered view), which makes tiptap-markdown's built-in
		//    clipboardTextParser bail out — it only runs when there's no HTML.
		//    So we look at text/plain ourselves and, if it contains markdown
		//    syntax, route it through the markdown parser.
		if (editor && clipboard) {
			const text = clipboard.getData('text/plain');
			if (text && looksLikeMarkdown(text)) {
				event.preventDefault();
				// Parse with inline:false so block elements (headings, tables,
				// fenced code, lists) are produced as blocks rather than being
				// unwrapped into inline content.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const parsed = (editor.storage as any).markdown.parser.parse(text);
				editor.chain().focus().insertContent(parsed).run();
				return true;
			}
		}

		return false;
	};

	const handleDrop = (_view: unknown, event: DragEvent) => {
		if (!caseId) return false;

		const files = event.dataTransfer?.files;
		if (!files?.length) return false;

		for (const file of files) {
			if (file.type.startsWith('image/')) {
				event.preventDefault();
				handleImageUpload(file);
				return true;
			}
		}

		return false;
	};

	const triggerFileInput = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) handleImageUpload(file);
		};
		input.click();
	};

	// --- Editor setup ---
	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					// StarterKit v3 ships Link. Configure it here instead of
					// registering a second Link extension — which triggers a
					// `Duplicate extension names found: ['link']` warning and
					// the second registration wins unpredictably.
					link: {
						openOnClick: false,
						HTMLAttributes: { class: 'text-blue-500 underline' }
					}
				}),
				// Image node extended with:
				//  - a `width` attribute so users can resize and round-trip
				//    (serialized as <img width> since markdown ![]() has no
				//    width syntax — tiptap-markdown ships markdown-it with
				//    html: true so raw <img> tags survive both load and save).
				//  - a NodeView that renders a corner drag handle on hover.
				Image.extend({
					addAttributes() {
						return {
							...this.parent?.(),
							width: {
								default: null,
								parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
								renderHTML: (attributes) => {
									if (!attributes.width) return {};
									// Expose as both the `width` attribute (markdown-it friendly)
									// and inline style so it renders consistently.
									return {
										width: attributes.width,
										style: `width: ${attributes.width}`
									};
								}
							}
						};
					},
					addNodeView() {
						return ResizableImageNodeView;
					}
				}).configure({
					inline: true,
					allowBase64: false
				}),
				Placeholder.configure({
					placeholder: 'Write a comment…'
				}),
				// GitHub-flavored tables. `resizable` lets users drag column widths.
				Table.configure({ resizable: true }),
				TableRow,
				TableHeader,
				TableCell,
				// transformPastedText: parse raw markdown strings pasted as plain text
				//   (so "# heading" becomes an H1 instead of a literal "# heading").
				// transformCopiedText: copy selections back out as markdown, matching
				//   how users expect to round-trip content.
				Markdown.configure({
					transformPastedText: true,
					transformCopiedText: true
				})
			],
			content: normalizeLegacyContent(value ?? ''),
			editorProps: {
				attributes: {
					// Tight `py-1` + `first:mt-0` on headings keeps the first
				// block flush to the toolbar without sacrificing vertical
				// rhythm between subsequent blocks.
				class: 'outline-none min-h-[5rem] px-3 py-1 text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_pre]:my-2 [&>:first-child]:mt-0'
				},
				handleKeyDown: (_view, event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
						onSave();
						return true;
					}

					if ((event.metaKey || event.ctrlKey) && event.key === 's') {
						event.preventDefault();
						onSave();
						return true;
					}

					return false;
				},
				handlePaste,
				handleDrop
			},
			onTransaction: ({ transaction }) => {
				if (suppressLocal || !transaction.docChanged || !socket?.connected || !channel) return;

				const steps = transaction.steps.map((step) => step.toJSON());
				socket.emit(changeEvent, { steps, channel });
			},
			onUpdate: ({ editor: e }) => {
				// Don't push changes back to parent during remote or prop-sync updates
				if (suppressLocal) return;

				skipUpdate = true;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onChange((e.storage as any).markdown.getMarkdown());
			},
			onSelectionUpdate: ({ editor: e }) => {
				// Tracks whether the caret is inside a table so we can reveal
				// the row/column controls contextually.
				inTable = e.isActive('table');
			}
		});

		if (channel) {
			connectSocket();
		}
	});

	// When the channel changes (e.g. navigating between notes without
	// remounting the editor), join the new room on the server so we receive
	// broadcasts for the new target.
	$effect(() => {
		const current = channel;
		if (!current || !socket?.connected) return;
		if (current === joinedChannel) return;

		socket.emit(joinEvent, { channel: current });
		joinedChannel = current;
	});

	// Emit socket save when parent signals a successful save
	let prevSavedAt = 0;
	$effect(() => {
		const ts = savedAt ?? 0;
		if (ts && ts !== prevSavedAt && socket?.connected && channel && editor) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const md = (editor.storage as any).markdown.getMarkdown() as string;
			socket.emit(saveEvent, { channel, content: md });
		}
		prevSavedAt = ts;
	});

	// Sync editor content when value prop changes externally
	$effect(() => {
		const v = normalizeLegacyContent(value ?? '');

		if (!editor) return;

		if (skipUpdate) {
			skipUpdate = false;
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentMd = (editor.storage as any).markdown.getMarkdown();

		if (v !== currentMd) {
			suppressLocal = true;
			try {
				editor.commands.setContent(v);
			} finally {
				suppressLocal = false;
			}
		}
	});

	onDestroy(() => {
		disconnectSocket();
		editor?.destroy();
	});

	const btn = (active: boolean) =>
		`rounded p-1 transition-colors ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`;
</script>

<div class="markdown-editor-shell flex flex-col">
	<!--
		Toolbar sticks to the top of the scroll container so formatting buttons
		remain reachable while editing long notes.

		Background and stacking are set via scoped CSS rather than Tailwind
		utilities: the prose content below can carry its own stacking context
		(selection highlights, tables, resize handles), and Tailwind's `bg-*`
		utilities were being painted over in practice. The scoped rules use
		the raw HSL variables and `isolation: isolate` on the shell so paint
		order is unambiguous regardless of what the ProseMirror DOM sets.
	-->
	<div
		class="markdown-editor-toolbar flex items-center gap-0.5 rounded-md border border-border px-1.5 py-1"
		style="position: sticky; top: -1rem; z-index: 10; background-color: hsl(var(--muted)); isolation: isolate;"
	>
		<button
			class={btn(editor?.isActive('bold') ?? false)}
			onclick={() => editor?.chain().focus().toggleBold().run()}
		>
			<BoldIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('italic') ?? false)}
			onclick={() => editor?.chain().focus().toggleItalic().run()}
		>
			<ItalicIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('strike') ?? false)}
			onclick={() => editor?.chain().focus().toggleStrike().run()}
		>
			<StrikethroughIcon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class={btn(editor?.isActive('heading', { level: 1 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
		>
			<Heading1Icon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('heading', { level: 2 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
		>
			<Heading2Icon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('heading', { level: 3 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
		>
			<Heading3Icon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class={btn(editor?.isActive('bulletList') ?? false)}
			onclick={() => editor?.chain().focus().toggleBulletList().run()}
		>
			<ListIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('orderedList') ?? false)}
			onclick={() => editor?.chain().focus().toggleOrderedList().run()}
		>
			<ListOrderedIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('blockquote') ?? false)}
			onclick={() => editor?.chain().focus().toggleBlockquote().run()}
		>
			<QuoteIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('codeBlock') ?? false)}
			onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
		>
			<CodeIcon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => {
				const url = window.prompt('URL');
				if (url) editor?.chain().focus().setLink({ href: url }).run();
			}}
		>
			<LinkIcon size="12" />
		</button>

		{#if caseId}
			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				disabled={uploading}
				onclick={triggerFileInput}
			>
				<ImageIcon size="12" />
			</button>
		{/if}

		<button
			class={btn(editor?.isActive('table') ?? false)}
			title="Insert table"
			onclick={() =>
				editor
					?.chain()
					.focus()
					.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
					.run()}
		>
			<TableIcon size="12" />
		</button>

		{#if inTable}
			<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Add row below"
				onclick={() => editor?.chain().focus().addRowAfter().run()}
			>
				<Rows3Icon size="12" />
				<span class="sr-only">Add row</span>
			</button>

			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Delete row"
				onclick={() => editor?.chain().focus().deleteRow().run()}
			>
				<Rows3Icon size="12" class="text-red-500" />
				<span class="sr-only">Delete row</span>
			</button>

			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Add column after"
				onclick={() => editor?.chain().focus().addColumnAfter().run()}
			>
				<Columns3Icon size="12" />
				<span class="sr-only">Add column</span>
			</button>

			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Delete column"
				onclick={() => editor?.chain().focus().deleteColumn().run()}
			>
				<Columns3Icon size="12" class="text-red-500" />
				<span class="sr-only">Delete column</span>
			</button>

			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Delete table"
				onclick={() => editor?.chain().focus().deleteTable().run()}
			>
				<Trash2Icon size="12" class="text-red-500" />
				<span class="sr-only">Delete table</span>
			</button>
		{/if}

		{#if typingUser}
			<span class="ml-auto text-2xs text-muted-foreground">{typingUser} is typing…</span>
		{/if}
	</div>

	<div class="markdown-editor-body relative mt-2 rounded-md border border-border/50 bg-background">
		<div bind:this={editorElement}></div>

		{#if uploading}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<span class="text-xs text-muted-foreground">Uploading image…</span>
			</div>
		{/if}
	</div>
</div>

<style>
	/*
	 * Editor shell creates its own stacking context so sticky z-index
	 * values inside stay coherent regardless of what the surrounding
	 * page does. Without `isolation: isolate` the prose content could
	 * paint over the sticky toolbar if an ancestor or ProseMirror's
	 * own styles introduced a competing stacking context.
	 */
	.markdown-editor-shell {
		isolation: isolate;
	}

	/*
	 * Sticky toolbar. The inline `style` attribute on the element itself
	 * holds `position: sticky`, `top`, `z-index`, and `background-color`
	 * so the properties are immune to Tailwind utility or prose-plugin
	 * cascade conflicts — which bit us repeatedly when these lived in
	 * stylesheet rules. The subtle shadow here just separates the sticky
	 * bar visually from the prose scrolling beneath it.
	 *
	 * Note on `top: -1rem`: the parent scroll container (.note-content-scroll)
	 * has `pt-4` (1rem) padding, so a naive `top: 0` leaves a 1rem gray
	 * band above the toolbar once sticky activates. Pulling up by the
	 * padding amount makes the toolbar sit flush against the scroll
	 * viewport edge.
	 */
	.markdown-editor-toolbar {
		box-shadow: 0 2px 4px hsl(var(--foreground) / 0.08);
	}

	.markdown-editor-body {
		position: relative;
		z-index: 0;
	}

	:global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		pointer-events: none;
		height: 0;
		color: hsl(var(--muted-foreground) / 0.5);
	}

	:global(.tiptap img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.375rem;
	}

	/* The resizable image wrapper replaces the default <img> node via a
	   custom NodeView. When it's selected, show a subtle outline to hint
	   that it's an interactive element. */
	:global(.tiptap .resizable-image-wrapper.ProseMirror-selectednode img) {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 2px;
	}

	:global(.tiptap .resizable-image-wrapper:hover .resizable-image-handle),
	:global(.tiptap .resizable-image-wrapper.ProseMirror-selectednode .resizable-image-handle) {
		opacity: 1 !important;
	}

	/* Table rendering — prosemirror-tables wraps each <table> in a scrollable
	   wrapper and needs border-collapse for cells to line up. */
	:global(.tiptap .tableWrapper) {
		overflow-x: auto;
		margin: 0.75rem 0;
	}

	:global(.tiptap table) {
		border-collapse: collapse;
		table-layout: fixed;
		width: 100%;
		margin: 0;
	}

	:global(.tiptap table td),
	:global(.tiptap table th) {
		border: 1px solid hsl(var(--border));
		padding: 0.35rem 0.5rem;
		vertical-align: top;
		position: relative;
		min-width: 3rem;
	}

	:global(.tiptap table th) {
		background: hsl(var(--muted) / 0.5);
		font-weight: 600;
		text-align: left;
	}

	/* Highlight selected cells so users see what they're editing. */
	:global(.tiptap table .selectedCell::after) {
		content: '';
		position: absolute;
		inset: 0;
		background: hsl(var(--primary) / 0.15);
		pointer-events: none;
	}

	/* Column-resize handle rendered by prosemirror-tables when resizable: true. */
	:global(.tiptap table .column-resize-handle) {
		position: absolute;
		right: -2px;
		top: 0;
		bottom: 0;
		width: 4px;
		background: hsl(var(--primary) / 0.5);
		pointer-events: none;
	}

	:global(.tiptap.resize-cursor) {
		cursor: col-resize;
	}
</style>
