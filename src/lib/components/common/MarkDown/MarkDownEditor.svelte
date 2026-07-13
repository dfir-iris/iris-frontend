<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import DOMPurify from 'dompurify';
	import { converter } from './converter';
	import {
		BoldIcon,
		CheckIcon,
		CodeIcon,
		Columns3Icon,
		EyeIcon,
		Heading1Icon,
		Heading2Icon,
		Heading3Icon,
		ImageIcon,
		ItalicIcon,
		LinkIcon,
		ListIcon,
		ListOrderedIcon,
		PencilIcon,
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
	import { authenticateDatastoreImages } from './authenticate-datastore-images';
	import { ResizableImageNodeView } from './resizable-image';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Table } from '@tiptap/extension-table';
	import { TableRow } from '@tiptap/extension-table-row';
	import { TableHeader } from '@tiptap/extension-table-header';
	import { TableCell } from '@tiptap/extension-table-cell';
	import { Markdown } from 'tiptap-markdown';
	import { ApiService } from '$lib/services/api.service';
	import { auth } from '$lib/stores/auth.store';
	import { io, type Socket } from 'socket.io-client';
	import { env } from '$env/dynamic/public';
	import * as Y from 'yjs';
	import { Awareness } from 'y-protocols/awareness';
	import Collaboration from '@tiptap/extension-collaboration';
	// `extension-collaboration-caret` supersedes `extension-collaboration-cursor`
	// for tiptap 3.22+. The old package (v3.0.0) was mispublished and pins
	// against `y-prosemirror`'s ySyncPluginKey directly, while the current
	// collaboration extension uses `@tiptap/y-tiptap`'s rebranded key. Mixing
	// the two produces "can't access property 'doc', ystate is undefined"
	// at cursor-plugin init because the keys don't match. Caret uses the
	// same y-tiptap import path, so state lookup works.
	import CollaborationCaret from '@tiptap/extension-collaboration-caret';
	import { SocketYjsProvider } from '$lib/collab/socket-yjs-provider';
	import { createMentionNode } from './mention-node';
	import { buildSuggestion } from './mentions.svelte';
	import type { MentionItem } from './MentionList.svelte';
	import { UsersService, type MentionableUser } from '$lib/services/users.service';
	import { CASE_ASSETS_CTX, type CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import { toast } from '$lib/stores/toast.store';
	import { getContext, mount, unmount } from 'svelte';
	import MentionPopover, { type MentionPopoverPayload } from './MentionPopover.svelte';
	import AssetDetailDialog from '../../../../routes/(app)/case/[case_id]/assets/[asset_id]/AssetDetailDialog.svelte';
	import IocDetailDialog from '../../../../routes/(app)/case/[case_id]/iocs/[ioc_id]/IocDetailDialog.svelte';
	import TaskDetailDialog from '../../../../routes/(app)/case/[case_id]/tasks/[task_id]/TaskDetailDialog.svelte';
	import NoteDetailDialog from '../../../../routes/(app)/case/[case_id]/notes/[note_id]/NoteDetailDialog.svelte';

	// `savedAt`, `onRemoteSave`, `onRemoteChange` are kept in the prop
	// shape so existing call sites don't have to change, but they're
	// no-ops now that Yjs handles sync + presence. Removing them would
	// be a breaking API change across every editor mount in the SPA;
	// the underscore prefixes signal intent to the type-check pass
	// without touching the public shape.
	let {
		value,
		onChange,
		onSave,
		caseId,
		noteId,
		warRoomNoteId,
		warRoomId,
		sitrepId,
		collabMode,
		savedAt: _savedAt,
		onRemoteSave: _onRemoteSave,
		onRemoteChange: _onRemoteChange,
		initialMode = 'view',
		readOnly = false
	} = $props<{
		value: string;
		onChange: (v: string) => void;
		onSave: () => void;
		caseId?: number | string | null;
		noteId?: number | string | null;
		warRoomNoteId?: number | string | null;
		warRoomId?: number | string | null;
		sitrepId?: number | string | null;
		collabMode?: 'case' | 'note' | 'war-room-note' | 'war-room-summary' | 'sitrep';
		savedAt?: number;
		onRemoteSave?: (content: string) => void;
		onRemoteChange?: (user: string) => void;
		initialMode?: 'view' | 'edit' | 'edit-preview';
		readOnly?: boolean;
	}>();

	type ViewMode = 'view' | 'edit' | 'edit-preview';
	// initialMode is a one-shot seed — we deliberately capture its value
	// once and never reactively rebind. untrack() also silences the
	// state_referenced_locally warning.
	let viewMode = $state<ViewMode>(untrack(() => initialMode));

	// In collab mode the parent's `value` prop is empty on mount and only
	// gets populated by an async fetch that races the Yjs sync-init.
	// Both the view-mode preview and the "empty" placeholder used to key
	// off `value`, which is why you'd see the note briefly, then the
	// placeholder, then a false "unsaved changes" badge. We now:
	//   * gate the "empty" placeholder behind `hasHydrated` so it never
	//     flashes before we know whether the doc actually is empty.
	//   * derive the view-mode preview from an editor-tracked HTML
	//     snapshot (`viewHtml`) for collab callers, so the parent's
	//     stale/empty `value` doesn't leak into the display.
	// `hasHydrated` and `viewHtml` are populated below in the collab
	// wire-up path (see the `onUpdate` hook and the connectCollab
	// sync-init handler). Non-collab callers set `viewHtml` from the
	// showdown-based converter path — same as before this fix.
	let hasHydrated = $state<boolean>(false);
	let viewHtml = $state<string>('');
	let viewIsEmpty = $state<boolean>(true);

	// The HTML we render inside {@html …} in view / edit-preview modes.
	// Kept as an alias for `viewHtml` so the surrounding markup that
	// used to read `renderedHtml` continues to work.
	const renderedHtml = $derived(viewHtml);

	// Container for the {@html renderedHtml} preview. We bind it so we
	// can sweep its `<img>` children and swap any datastore URLs to
	// bearer-authenticated blob URLs — otherwise the browser fetches the
	// raw `/api/v2/cases/.../files/N` with no Authorization header and
	// the server 401s.
	let previewContainerEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		void renderedHtml;
		void viewMode;
		if (viewMode !== 'view' && viewMode !== 'edit-preview') return;
		if (!previewContainerEl) return;
		const dispose = authenticateDatastoreImages(previewContainerEl);
		return dispose;
	});

	// Same problem in the editable surface: TipTap renders inline images
	// as raw `<img>` and the browser hits the v2 endpoint unauthenticated.
	// We re-sweep on every value change and on edit-mode entry; the
	// helper is idempotent so already-swapped `<img>` are skipped.
	$effect(() => {
		void value;
		void viewMode;
		if (viewMode !== 'edit') return;
		if (!editorElement) return;
		const dispose = authenticateDatastoreImages(editorElement);
		return dispose;
	});

	const enterEdit = async () => {
		if (effectiveReadOnly) return;
		if (viewMode === 'view') {
			viewMode = 'edit';
			await tick();
			editor?.commands.focus();
		}
	};

	const exitEdit = () => {
		viewMode = 'view';
	};

	const togglePreview = () => {
		viewMode = viewMode === 'edit' ? 'edit-preview' : 'edit';
	};

	let editorElement = $state<HTMLDivElement | null>(null);
	let editor: Editor | null = null;
	let uploading = $state(false);
	// `typingUser` fed the old "X is typing…" hint above the toolbar.
	// Yjs's CollaborationCursor replaces it with per-user cursor
	// decorations, but the template block that reads this state is
	// left in place (null → hidden via `{#if}`) so we don't churn the
	// toolbar markup in the same commit as the collab swap.
	let typingUser = $state<string | null>(null);
	// Reactive flag for the contextual table toolbar. Updated from the tiptap
	// selection-update hook so Svelte re-renders the toolbar when the caret
	// moves into or out of a table cell.
	let inTable = $state(false);

	// --- Real-time collaboration (Yjs) -----------------------------------
	// The editor is CRDT-backed via Yjs + TipTap's Collaboration extension.
	// The server (`/collab` SocketIO namespace) is a dumb relay: we ship it
	// opaque Yjs updates and it fans them out to peers on the same doc.
	// See `iris-frontend/src/lib/collab/socket-yjs-provider.ts` for the
	// transport shim.

	// Collaboration mode drives the doc-name we open on the server:
	//   * 'note'             → `note:<noteId>`
	//   * 'case' (summary)   → `case-summary:<caseId>`
	//   * 'war-room-note'    → `war-room-note:<warRoomNoteId>`
	//   * 'war-room-summary' → `war-room-summary:<warRoomId>`
	//   * 'sitrep'           → `sitrep:<sitrepId>`
	// The mode inference falls back to case-summary when nothing more
	// specific is supplied — the same behaviour as before phase 2.
	const mode = $derived(
		collabMode ??
			(warRoomNoteId
				? 'war-room-note'
				: sitrepId
					? 'sitrep'
					: noteId
						? 'note'
						: 'case')
	);
	const docName = $derived(
		mode === 'note'
			? noteId
				? `note:${noteId}`
				: null
			: mode === 'war-room-note'
				? warRoomNoteId
					? `war-room-note:${warRoomNoteId}`
					: null
				: mode === 'war-room-summary'
					? warRoomId
						? `war-room-summary:${warRoomId}`
						: null
					: mode === 'sitrep'
						? sitrepId
							? `sitrep:${sitrepId}`
							: null
						: caseId
							? `case-summary:${caseId}`
							: null
	);

	// Non-collab callers (no docName): hydrate immediately and drive the
	// view-mode HTML from the same showdown-converter pipeline used
	// before this fix. Keeps the legacy plain-form/task/evidence/IOC/
	// asset call sites working unchanged.
	untrack(() => {
		if (!docName) {
			hasHydrated = true;
			const md = value ?? '';
			viewHtml = DOMPurify.sanitize(converter.makeHtml(normalizeLegacyContent(md)));
			viewIsEmpty = md.trim().length === 0;
		}
	});

	// Non-collab: keep the preview aligned with the parent's `value` prop
	// so external state changes (form field updates, restored revisions
	// on the non-collab path) refresh the view. This is a no-op in
	// collab mode — that path is fed by `editor.getHTML()` on every
	// ProseMirror update instead (see the onUpdate hook below).
	$effect(() => {
		if (docName) return;
		const md = value ?? '';
		viewHtml = DOMPurify.sanitize(converter.makeHtml(normalizeLegacyContent(md)));
		viewIsEmpty = md.trim().length === 0;
	});

	let socket: Socket | null = null;
	// `ydoc` and `awareness` are created EAGERLY (in the same tick as the
	// component's `<script>` runs, before `onMount`) rather than lazily
	// inside `connectCollab()`, because they need to be non-null when we
	// construct the TipTap `Editor` — the Collaboration extension binds
	// the ProseMirror doc to a Y.XmlFragment at extension-init time, and
	// if we hand it a null document the binding never happens. The
	// socket/provider are still lazy: those come up in `connectCollab()`.
	//
	// `untrack()` mirrors the pattern used above for `initialMode`: we
	// intentionally want the value of `docName` at construction time,
	// not a reactive subscription. Subsequent doc changes go through
	// the doc-change $effect which tears down and re-creates both.
	let ydoc: Y.Doc | null = untrack(() => (docName ? new Y.Doc() : null));
	let provider: SocketYjsProvider | null = null;
	// Awareness identity for the CollaborationCursor extension. We fill
	// this in once the server's sync-init hands us the resolved user info.
	let awareness: Awareness | null = ydoc ? new Awareness(ydoc) : null;
	// Read-only bit computed from the server's `can_write` on join. The
	// server is the single source of truth for editor content in Option
	// A — it's also the single source of truth for the write-permission
	// answer. We never seed content from any client-side fallback path,
	// so if the server reports read-only that's the whole story.
	let readOnlyFromServer = $state(false);
	// Effective read-only combines the caller's opt-in (`readOnly` prop)
	// with the server's verdict. A local user editing the DOM without
	// write access can still generate Yjs updates, but the server drops
	// them — this signal prevents that from happening client-side too.
	const effectiveReadOnly = $derived(readOnly || readOnlyFromServer);

	// `onUpdate` fires on every ProseMirror doc change — including the
	// very first mutation caused by applying the server's initial
	// `y_state`. If we called `onChange(md)` on that first mutation,
	// the parent's `draftContent` would drift from its `baseContent`
	// due to cosmetic differences between the server-column markdown
	// and what tiptap-markdown renders (whitespace, escape backslashes,
	// trailing newlines). Parents that derive "unsaved" from
	// `draft !== base` would then flag every freshly-opened note as
	// dirty. We hold `onChange` back until the initial `sync-init`
	// has been applied — after that, every onChange is a user edit.
	//
	// Non-collab callers (no docName, e.g. task/evidence forms) don't
	// go through `sync-init` at all, so we default the flag to true
	// for them so their onChange fires immediately.
	//
	// `untrack()` — we deliberately want the initial value only. The
	// caller wraps this component in `{#key <id>}` so a docName swap
	// forces a full remount, which is when this initialiser re-runs.
	let readyForOnChange = $state<boolean>(untrack(() => !docName));
	// Last markdown we handed the parent via `onChange`. Guards against
	// echo emissions: y-prosemirror often fires a second `onUpdate` right
	// after the initial `sync-init` replay (a housekeeping flush that
	// re-serialises the same state). Without this guard, that second
	// tick would call `onChange(md)` with a string identical to the one
	// we suppressed the first time, and the parent's `draftContent`
	// would suddenly diverge from `baseContent` — the phantom "unsaved
	// changes" you'd see on every freshly-loaded note. Comparing string
	// equality is cheap next to the ProseMirror-to-markdown render.
	let lastEmittedMarkdown: string | null = null;

	const connectCollab = () => {
		if (!docName || !ydoc || !awareness) return;

		const token = auth.getAccessToken();
		const baseUrl = env.PUBLIC_EXTERNAL_API_URL?.replace(/\/$/, '') ?? '';

		// WebSocket-first for low latency; polling fallback covers proxies
		// that block WS.
		//
		// Auth: the SPA's Flask-issued JWT lives in localStorage. We CAN'T
		// carry it in a header on WS handshakes (browsers strip custom
		// headers on the upgrade), so we send it via socket.io's own
		// `auth` handshake payload — the backend's `on_connect(auth)`
		// receives it verbatim regardless of transport. `extraHeaders`
		// stays as a belt-and-braces for polling-only proxies.
		socket = io(`${baseUrl}/collab`, {
			auth: token ? { token } : {},
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			transports: ['websocket', 'polling'],
			reconnectionAttempts: 5
		});

		socket.on('connect_error', (err) => {
			console.error('Collab socket connection error:', err.message);
		});

		provider = new SocketYjsProvider({
			socket,
			docName,
			ydoc,
			awareness,
			onSyncInit: ({ canWrite, user }) => {
				readOnlyFromServer = !canWrite;
				// Set the local awareness user AFTER we know who the server
				// thinks we are. `name` and `userId` are what peers see on
				// our cursor — but note that we DO NOT rely on peers being
				// honest about their own values. `SocketYjsProvider` rewrites
				// every incoming peer's `user.name` / `user.userId` from the
				// server-attested `awareness-identity` broadcast before the
				// cursor extension renders them, so a malicious peer can't
				// pretend to be someone else here. `color` is presentational
				// only and we pass it through as-is.
				awareness?.setLocalStateField('user', {
					name: user.name ?? 'user',
					userId: user.id,
					color: pickCursorColor(user.id ?? 0)
				});
				// No cold-start seeding path anymore. The server owns the
				// authoritative Y.Doc (see `iris_engine/collab/render.py`
				// and `business/collab.ensure_snapshot`) — by the time this
				// callback fires, the server has already sent us the
				// y_state bytes and `SocketYjsProvider` has applied them.
				// The editor's XmlFragment is populated correctly; any
				// client-side `commands.setContent()` here would produce
				// content duplication.
				//
				// From here on, onUpdate → onChange is a real user edit.
				// See `readyForOnChange` at the top of the module for the
				// reason we gated it in the first place.
				readyForOnChange = true;
				// The view-mode mirror is fed from `onUpdate`, NOT from
				// here. sync-init runs at the socket-message boundary —
				// before y-prosemirror has flushed the applied Y-state
				// into ProseMirror's document — so reading
				// `editor.storage.markdown.getMarkdown()` right now would
				// return an empty string and (via `lastEmittedMarkdown`)
				// silently swallow the subsequent onUpdate that carries
				// the real content. `hasHydrated` still flips true here
				// so the view-mode template stops showing the loading
				// skeleton; the next `onUpdate` (y-prosemirror's
				// post-sync flush) populates the mirror before the next
				// paint.
				hasHydrated = true;
			},
			onPermissionDenied: () => {
				readOnlyFromServer = true;
			}
		});
	};

	const disconnectCollab = () => {
		provider?.destroy();
		provider = null;
		ydoc?.destroy();
		ydoc = null;
		awareness = null;
		socket?.disconnect();
		socket = null;
	};

	// Deterministic per-user color for cursor decoration. Not security-
	// sensitive — just needs to be stable across sessions so User Alice
	// always shows up with the same shade to everyone else.
	const CURSOR_PALETTE = [
		'#f87171', '#fb923c', '#fbbf24', '#4ade80',
		'#22d3ee', '#60a5fa', '#a78bfa', '#f472b6'
	];
	const pickCursorColor = (userId: number) =>
		CURSOR_PALETTE[Math.abs(userId) % CURSOR_PALETTE.length];

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

	// --- Mentions: users (@) and assets (#) ---
	//
	// Users are fetched once on first trigger and reused; the user list is
	// small (workspace members) and rarely changes during an edit session.
	// Assets come from the case-scoped context so they stay in sync with the
	// rest of the UI without an extra fetch.
	const caseAssets = getContext<CaseAssetsContext | undefined>(CASE_ASSETS_CTX);
	const caseIocs = getContext<CaseIocsContext | undefined>(CASE_IOCS_CTX);
	const caseNotes = getContext<CaseNotesContext | undefined>(CASE_NOTES_CTX);
	const caseTasks = getContext<CaseTasksContext | undefined>(CASE_TASKS_CTX);
	const caseDatastore = getContext<CaseDatastoreContext | undefined>(CASE_DATASTORE_CTX);

	let usersCache: MentionableUser[] | null = null;
	let usersPromise: Promise<MentionableUser[]> | null = null;

	const loadUsers = async (): Promise<MentionableUser[]> => {
		if (usersCache) return usersCache;
		if (!usersPromise) {
			usersPromise = (async () => {
				// `/api/v2/users/mentionable` is auth-gated but not admin-
				// gated, so analysts (who can't call `/manage/users`) can
				// still list colleagues to mention. Payload is deliberately
				// minimal (id, login, name) — the popup does its own fuzzy
				// filter locally on top of this cache.
				const res = await UsersService.listMentionable();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const inner = (res?.data as any)?.data;
				if (Array.isArray(inner)) {
					usersCache = inner as MentionableUser[];
					return usersCache;
				}
				if (Array.isArray(res?.data)) {
					usersCache = res.data as MentionableUser[];
					return usersCache;
				}
				usersCache = [];
				return [];
			})();
		}
		return usersPromise;
	};

	const fuzzy = (haystack: string, needle: string) =>
		haystack.toLowerCase().includes(needle.toLowerCase());

	const fetchUserItems = async (query: string): Promise<MentionItem[]> => {
		const users = await loadUsers();
		const q = query.trim();
		const filtered = q
			? users.filter((u) => fuzzy(u.user_name, q) || fuzzy(u.user_login, q))
			: users;
		return filtered.slice(0, 8).map((u) => ({
			id: u.user_id,
			label: u.user_name,
			sublabel: u.user_login,
			kind: 'user' as const
		}));
	};

	// Generic lazy-loader factory. Mention chips are usable from anywhere in
	// the case (e.g. typing `#asset` in a note even though the assets sidebar
	// hasn't loaded yet). When the context's cache is empty on first trigger
	// we kick off a single fetch — subsequent triggers reuse the populated
	// cache.
	const makeLazyLoader = <T,>(
		hasData: () => boolean,
		load: () => Promise<T[] | unknown> | undefined
	) => {
		let pending: Promise<unknown> | null = null;
		return async (): Promise<void> => {
			if (hasData()) return;
			if (!pending) {
				try {
					pending = Promise.resolve(load());
				} catch {
					pending = null;
					return;
				}
			}
			try {
				await pending;
			} finally {
				pending = null;
			}
		};
	};

	const ensureAssetsLoaded = makeLazyLoader(
		() => (caseAssets?.assets()?.length ?? 0) > 0,
		() => caseAssets?.listPaginated({ per_page: 100 }, { fetch })
	);

	const ensureIocsLoaded = makeLazyLoader(
		() => (caseIocs?.iocs()?.length ?? 0) > 0,
		() => caseIocs?.listPaginated({ per_page: 100 }, { fetch })
	);

	const ensureNotesLoaded = makeLazyLoader(
		() => (caseNotes?.notes()?.length ?? 0) > 0,
		() => caseNotes?.loadTree({ fetch })
	);

	const ensureTasksLoaded = makeLazyLoader(
		() => (caseTasks?.tasks()?.length ?? 0) > 0,
		() => caseTasks?.listPaginated({ per_page: 100 }, { fetch })
	);

	const ensureDatastoreLoaded = makeLazyLoader(
		() => Object.keys(caseDatastore?.fileById ?? {}).length > 0,
		() => caseDatastore?.loadTree({ fetch })
	);

	// Unified case-object fetcher. A single `#` trigger surfaces assets,
	// IOCs, notes, and tasks together — the suggestion list shows their kind
	// icon next to each match so users can pick the right reference. We cap
	// each kind at 4 hits per query so one large bucket can't crowd the
	// others out of an 8-row dropdown.
	const fetchCaseItems = async (query: string): Promise<MentionItem[]> => {
		const q = query.trim();
		await Promise.all([
			ensureAssetsLoaded(),
			ensureIocsLoaded(),
			ensureNotesLoaded(),
			ensureTasksLoaded(),
			ensureDatastoreLoaded()
		]);

		const out: MentionItem[] = [];
		const PER_KIND = 4;

		if (caseAssets) {
			const assets = caseAssets.assets() ?? [];
			const filtered = q ? assets.filter((a) => fuzzy(a.asset_name ?? '', q)) : assets;
			for (const a of filtered.slice(0, PER_KIND)) {
				out.push({
					id: a.asset_id,
					label: a.asset_name ?? `Asset #${a.asset_id}`,
					sublabel: a.asset_type?.asset_name,
					kind: 'asset'
				});
			}
		}

		if (caseIocs) {
			const iocs = caseIocs.iocs() ?? [];
			const filtered = q
				? iocs.filter(
						(i) =>
							fuzzy(i.ioc_value ?? '', q) || fuzzy(i.ioc_type?.type_name ?? '', q)
					)
				: iocs;
			for (const i of filtered.slice(0, PER_KIND)) {
				out.push({
					id: i.ioc_id,
					label: i.ioc_value ?? `IOC #${i.ioc_id}`,
					sublabel: i.ioc_type?.type_name,
					kind: 'ioc'
				});
			}
		}

		if (caseNotes) {
			const notes = caseNotes.notes() ?? [];
			const filtered = q ? notes.filter((n) => fuzzy(n.note_title ?? '', q)) : notes;
			for (const n of filtered.slice(0, PER_KIND)) {
				out.push({
					id: n.note_id,
					label: n.note_title ?? `Note #${n.note_id}`,
					kind: 'note'
				});
			}
		}

		if (caseTasks) {
			const tasks = caseTasks.tasks() ?? [];
			const filtered = q ? tasks.filter((t) => fuzzy(t.task_title ?? '', q)) : tasks;
			for (const t of filtered.slice(0, PER_KIND)) {
				out.push({
					id: t.id,
					label: t.task_title ?? `Task #${t.id}`,
					sublabel: t.status?.status_name,
					kind: 'task'
				});
			}
		}

		if (caseDatastore) {
			const files = Object.values(caseDatastore.fileById);
			const filtered = q
				? files.filter(
						(f) =>
							fuzzy(f.file_original_name, q) ||
							fuzzy(f.file_description ?? '', q) ||
							fuzzy(f.file_tags ?? '', q)
					)
				: files;
			for (const f of filtered.slice(0, PER_KIND)) {
				out.push({
					id: f.file_id,
					label: f.file_original_name,
					sublabel: f.file_tags || undefined,
					kind: 'datastore'
				});
			}
		}

		return out;
	};

	// --- Chip click popover ---
	//
	// Single delegated handler on the editor body. Works for both:
	//   - view/preview HTML rendered via {@html renderedHtml}
	//   - tiptap atomic mention nodes in edit mode
	// Atomic mentions still bubble click events normally; we preventDefault
	// so the click doesn't move the cursor to the chip's left edge.

	let popoverHandle: { destroy: () => void } | null = null;

	// Detail dialog state for each case-object kind. Living here means the
	// dialogs inherit the surrounding Svelte context (CASE_*_CTX) — needed
	// because each *DetailView reads its context via getContext.
	let assetDialogId = $state<number | null>(null);
	let assetDialogOpen = $state(false);
	let iocDialogId = $state<number | null>(null);
	let iocDialogOpen = $state(false);
	let taskDialogId = $state<number | null>(null);
	let taskDialogOpen = $state(false);
	let noteDialogId = $state<number | null>(null);
	let noteDialogOpen = $state(false);

	const openAssetDialog = (id: number) => {
		assetDialogId = id;
		assetDialogOpen = true;
	};

	const openIocDialog = (id: number) => {
		iocDialogId = id;
		iocDialogOpen = true;
	};

	const openTaskDialog = (id: number) => {
		taskDialogId = id;
		taskDialogOpen = true;
	};

	const openNoteDialog = (id: number) => {
		noteDialogId = id;
		noteDialogOpen = true;
	};

	const closePopover = () => {
		popoverHandle?.destroy();
		popoverHandle = null;
		activeChip = null;
	};

	const openPopoverFor = async (el: HTMLElement) => {
		closePopover();

		const kind = el.getAttribute('data-kind') ?? 'user';
		const id = el.getAttribute('data-id') ?? '';
		const label = el.getAttribute('data-label') ?? el.textContent?.replace(/^[@#]/, '') ?? '';
		const numericId = Number(id);

		let payload: MentionPopoverPayload;

		if (kind === 'asset') {
			const asset = caseAssets?.byId[numericId];
			payload = {
				kind: 'asset',
				id,
				label,
				asset_type: asset?.asset_type?.asset_name ?? null,
				asset_ip: asset?.asset_ip ?? null,
				asset_domain: asset?.asset_domain ?? null,
				onOpen: Number.isFinite(numericId) ? () => openAssetDialog(numericId) : undefined
			};
		} else if (kind === 'ioc') {
			const ioc = caseIocs?.byId[numericId];
			payload = {
				kind: 'ioc',
				id,
				label,
				ioc_type: ioc?.ioc_type?.type_name ?? null,
				ioc_description: ioc?.ioc_description ?? null,
				onOpen: Number.isFinite(numericId) ? () => openIocDialog(numericId) : undefined
			};
		} else if (kind === 'note') {
			const note = caseNotes?.byId[numericId];
			const folder = note?.directory_id ? caseNotes?.foldersById[note.directory_id] : null;
			payload = {
				kind: 'note',
				id,
				label,
				directory: folder?.name ?? null,
				onOpen: Number.isFinite(numericId) ? () => openNoteDialog(numericId) : undefined
			};
		} else if (kind === 'task') {
			const task = caseTasks?.byId[numericId];
			payload = {
				kind: 'task',
				id,
				label,
				status: task?.status?.status_name ?? null,
				assignees:
					task?.task_assignees?.map((a) => a.name || a.user).join(', ') || null,
				onOpen: Number.isFinite(numericId) ? () => openTaskDialog(numericId) : undefined
			};
		} else if (kind === 'datastore') {
			const file = caseDatastore?.fileById[numericId];
			const dsCaseId = Number(caseId);
			const url = Number.isFinite(dsCaseId)
				? CaseDatastoreService.getViewUrl(dsCaseId, numericId)
				: null;
			payload = {
				kind: 'datastore',
				id,
				label,
				file_size: file?.file_size ?? null,
				file_url: url,
				onPreview: url ? () => window.open(url, '_blank') : undefined,
				onDownload: url
					? () => {
							const a = document.createElement('a');
							a.href = url;
							a.download = file?.file_original_name ?? label;
							a.rel = 'noopener';
							document.body.appendChild(a);
							a.click();
							a.remove();
						}
					: undefined,
				onCopyMarkdown: url
					? async () => {
							const md = `[${(file?.file_original_name ?? label).replace(/[\[\]]/g, '')}](${url})`;
							try {
								await navigator.clipboard.writeText(md);
								toast({ title: 'Markdown link copied', variant: 'success' });
							} catch {
								toast({ title: 'Copy failed', variant: 'destructive' });
							}
						}
					: undefined
			};
		} else {
			const users = await loadUsers();
			const user = users.find((u) => String(u.user_id) === id);
			payload = {
				kind: 'user',
				id,
				label,
				user_login: user?.user_login ?? null
			};
		}

		const rect = el.getBoundingClientRect();
		const host = document.createElement('div');
		host.style.position = 'absolute';
		host.style.zIndex = '60';
		host.style.top = `${rect.bottom + window.scrollY + 4}px`;
		host.style.left = `${rect.left + window.scrollX}px`;
		document.body.appendChild(host);
		popoverHostEl = host;

		// Hovering the popover keeps it open; leaving it (to anywhere other
		// than the chip) starts the close grace period.
		host.addEventListener('mouseenter', cancelCloseTimer);
		host.addEventListener('mouseleave', (e) => {
			const toEl = e.relatedTarget as Node | null;
			if (toEl && activeChip?.contains(toEl)) return;
			scheduleClose();
		});

		const onClose = () => {
			closePopover();
		};

		const component = mount(MentionPopover, {
			target: host,
			props: { payload, onClose }
		});

		popoverHandle = {
			destroy: () => {
				unmount(component);
				host.remove();
				if (popoverHostEl === host) popoverHostEl = null;
			}
		};
	};

	// --- Hover-driven popover ---
	//
	// Show the popover when the cursor lingers on a chip; hide it when the
	// cursor leaves both the chip AND the popover for a brief grace period.
	// The grace period lets users slide their pointer from chip → popover
	// without it disappearing en route.

	const HOVER_OPEN_DELAY = 300;
	const HOVER_CLOSE_DELAY = 200;

	let activeChip: HTMLElement | null = null;
	let openTimer: ReturnType<typeof setTimeout> | null = null;
	let closeTimer: ReturnType<typeof setTimeout> | null = null;
	let popoverHostEl = $state<HTMLElement | null>(null);

	const cancelOpenTimer = () => {
		if (openTimer) {
			clearTimeout(openTimer);
			openTimer = null;
		}
	};

	const cancelCloseTimer = () => {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	};

	const scheduleClose = () => {
		cancelCloseTimer();
		closeTimer = setTimeout(() => {
			closePopover();
			activeChip = null;
		}, HOVER_CLOSE_DELAY);
	};

	const handleChipMouseEnter = (chip: HTMLElement) => {
		cancelCloseTimer();
		if (activeChip === chip && popoverHandle) return; // already showing for this chip
		cancelOpenTimer();
		openTimer = setTimeout(() => {
			openTimer = null;
			activeChip = chip;
			openPopoverFor(chip);
		}, HOVER_OPEN_DELAY);
	};

	const handleChipMouseLeave = (e: MouseEvent) => {
		cancelOpenTimer();
		// If the cursor is moving onto the popover itself, don't close.
		const toEl = e.relatedTarget as Node | null;
		if (toEl && popoverHostEl?.contains(toEl)) return;
		scheduleClose();
	};

	const handleBodyMouseOver = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		// `mouseenter` doesn't bubble, so we synthesize per-chip enter detection
		// here. Each chip is entered exactly once per pointer-in event because
		// we early-out when activeChip already matches.
		handleChipMouseEnter(chip);
	};

	const handleBodyMouseOut = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		// Only react when the pointer has truly left the chip's bounds — when
		// it's still inside, relatedTarget will be a child of the chip.
		const toEl = e.relatedTarget as Node | null;
		if (toEl && chip.contains(toEl)) return;
		handleChipMouseLeave(e);
	};

	// Keyboard equivalents: focusing a chip via Tab opens the popover; blurring
	// closes it (unless focus moved into the popover). Required by the a11y
	// linter and genuinely useful for keyboard users.
	const handleBodyFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		cancelCloseTimer();
		cancelOpenTimer();
		activeChip = chip;
		openPopoverFor(chip);
	};

	const handleBodyFocusOut = (e: FocusEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		const toEl = e.relatedTarget as Node | null;
		if (toEl && (chip.contains(toEl) || popoverHostEl?.contains(toEl))) return;
		scheduleClose();
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
					// Yjs's Collaboration extension supplies its own undo/redo
					// via `y-prosemirror` — running both would double-apply
					// undo transactions. StarterKit v3 renamed the toggle to
					// `undoRedo`; disabling it is the officially documented
					// setup for collab-enabled TipTap editors.
					undoRedo: false,
					// StarterKit v3 ships Link. Configure it here instead of
					// registering a second Link extension — which triggers a
					// `Duplicate extension names found: ['link']` warning and
					// the second registration wins unpredictably.
					link: {
						openOnClick: false,
						HTMLAttributes: { class: 'text-blue-500 underline' }
					}
				}),
				// Real-time CRDT sync. The Collaboration extension binds
				// the editor's ProseMirror state to a `Y.XmlFragment` on
				// the Y.Doc; every local edit becomes an outbound Yjs
				// update, every remote update is applied without ever
				// touching the raw editor state.
				...(ydoc
					? [
							// `field: 'prosemirror'` matches the XmlFragment name
					// the server writes to in `iris_engine/collab/render.py`
					// (see `_PROSEMIRROR_FIELD`). y-tiptap defaults to
					// `'default'` — if we accept that, the editor pulls
					// from an empty fragment and the note stays blank
					// even though `y_state` was applied to the doc. Yes,
					// really: y-prosemirror uses NAMED XmlFragments
					// inside the Y.Doc as its ProseMirror-bound root,
					// and both sides have to agree on the name.
					Collaboration.configure({ document: ydoc, field: 'prosemirror' }),
							...(awareness
								? [
										CollaborationCaret.configure({
											// The extension expects a provider-shaped object with
											// `.awareness`. We're not using Hocuspocus — we've got
											// our own Socket.IO transport — so we pass a plain
											// wrapper. Only `.awareness` is read at runtime.
											provider: { awareness } as never,
											// Seed the local awareness user with a null-safe default;
											// `sync-init` fires a moment later and overwrites this
											// with the server-attested identity via
											// `setLocalStateField('user', ...)`.
											user: { name: 'user', color: pickCursorColor(0) }
										})
									]
								: [])
						]
					: []),
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
				}),
				// @ users — kept separate from case objects since the user list
				// is workspace-wide rather than case-scoped.
				createMentionNode(
					'userMention',
					'user',
					buildSuggestion('@', { nodeName: 'userMention', fetchItems: fetchUserItems })
				),
				// # case objects (assets / iocs / notes / tasks) all share one
				// trigger. The suggestion item's `kind` drives chip rendering
				// and which detail panel/route opens on click.
				createMentionNode(
					'caseMention',
					'asset',
					buildSuggestion('#', { nodeName: 'caseMention', fetchItems: fetchCaseItems }),
					['asset', 'ioc', 'note', 'task', 'datastore']
				)
			],
			// In collab mode (docName set) the initial content is seeded
			// from the server's `sync-init` payload — starting with `value`
			// here would race the Yjs replay and produce a brief flash of
			// stale content before the doc syncs in. Non-collab callers
			// still get their prop content immediately.
			content: docName ? '' : normalizeLegacyContent(value ?? ''),
			// Initial editability. `effectiveReadOnly` is reactive; we
			// wire a `$effect` below to keep TipTap in sync when the
			// server flips the read-only flag mid-session (e.g. an ACL
			// revocation while the editor is open).
			editable: !effectiveReadOnly,
			editorProps: {
				attributes: {
					// Tight `py-1` + `first:mt-0` on headings keeps the first
				// block flush to the toolbar without sacrificing vertical
				// rhythm between subsequent blocks.
				class: 'outline-none min-h-[5rem] px-3 py-1 text-sm leading-normal prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_p]:text-sm [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h2]:text-base [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0 [&_li]:text-sm [&_blockquote]:my-2 [&_blockquote]:text-sm [&_pre]:my-2 [&_pre]:text-xs [&_code]:text-xs [&>:first-child]:mt-0'
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
			// Yjs owns wire sync via the Collaboration extension +
			// `ydoc.on('update')` in the provider. This hook only
			// mirrors the current markdown rendering to the parent so
			// its `value` prop / save-badge logic keeps working; the
			// server derives its own markdown from the authoritative
			// Y.Doc when it flushes to the source column (see
			// `iris_engine/collab/render.py`).
			onUpdate: ({ editor: e }) => {
				// Always refresh the view-mode HTML snapshot from the
				// current ProseMirror doc, INCLUDING the initial onUpdate
				// y-prosemirror fires when it flushes the server's
				// y_state. That first flush is how view-only viewers
				// ever see content — if we bail out early here, the
				// view stays permanently blank.
				viewHtml = e.getHTML();
				viewIsEmpty = e.isEmpty;
				// The parent-visible `onChange` emission is a separate
				// concern: we gate it on `readyForOnChange` so the
				// initial hydration doesn't look like a user edit and
				// doesn't flip the parent's dirty flag.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const md = (e.storage as any).markdown.getMarkdown() as string;
				if (!readyForOnChange) {
					// Record what we just rendered so the immediate
					// post-hydration flush (y-prosemirror often emits a
					// second identical onUpdate one tick after sync-init)
					// is treated as an echo and skipped below.
					lastEmittedMarkdown = md;
					return;
				}
				// Skip echo emissions: identical markdown means no user
				// edit happened; passing it to `onChange` would
				// spuriously flip the parent's dirty flag.
				if (md === lastEmittedMarkdown) return;
				lastEmittedMarkdown = md;
				onChange(md);
			},
			onSelectionUpdate: ({ editor: e }) => {
				// Tracks whether the caret is inside a table so we can reveal
				// the row/column controls contextually.
				inTable = e.isActive('table');
			}
		});

		if (docName) {
			connectCollab();
			// Intentionally no safety-net seed: the server is the sole
			// source of truth for editor content in Option A. If
			// `sync-init` never arrives, the editor stays empty and the
			// `[collab] connect_error` log tells operators why. Falling
			// back to `value` from the parent would be the bug that
			// produced content duplication in the previous design.
		}
	});

	// The Collaboration extension binds the ProseMirror doc to a
	// specific Y.XmlFragment at extension-init time (in `new Editor`);
	// swapping the Y.Doc afterwards does NOT rebind, and quietly leaves
	// the editor pointing at a dead fragment. Parent pages already wrap
	// this component in `{#key <id>}` so navigating between notes /
	// sitreps forces a full remount, which is the only reliable way to
	// swap docs. We assert that the docName never mutates under our
	// feet, and log loudly if it does — so a future refactor that
	// removes the `{#key ...}` at the call site surfaces immediately
	// rather than silently breaking collab.
	// `untrack()` — same reason as the eager `ydoc`/`awareness` init above:
	// we deliberately snapshot the initial docName and let the $effect
	// below detect divergences, rather than reactively subscribing here.
	let joinedDoc: string | null = $state(untrack(() => docName));
	$effect(() => {
		const current = docName;
		if (current === joinedDoc) return;
		console.warn(
			`collab: docName changed under a mounted editor (${joinedDoc} → ${current}). ` +
				`Wrap the editor in {#key <id>} at the call site to force a remount instead.`
		);
		joinedDoc = current;
	});

	// Keep TipTap's editable state in lockstep with the effective
	// read-only signal. This covers three transitions:
	//   1. Caller flips `readOnly` prop (e.g. a parent switches modes).
	//   2. Server reports `can_write=false` at join time.
	//   3. Server sends a mid-session `permission-denied` after an
	//      ACL change.
	// TipTap's `setEditable(false)` refuses local mutations at the
	// ProseMirror layer, so Yjs never sees an update to forward. Belt
	// AND braces — the server also drops writes from unauthorised users
	// via `resolve_doc` on every incoming `sync` message.
	$effect(() => {
		if (!editor) return;
		editor.setEditable(!effectiveReadOnly);
		if (effectiveReadOnly && viewMode !== 'view') {
			// If we were in edit mode when access was revoked, fall back
			// to the read-only rendered view so the user isn't staring
			// at a locked-out editable surface.
			viewMode = 'view';
		}
	});

	// `savedAt` is now cosmetic — Yjs syncs continuously and the server
	// flushes to the source column on last-client-disconnect (plus, in
	// a future revision, on a periodic tick). Parent components can
	// keep passing `savedAt` for their save-badge UI; we no longer
	// re-broadcast on it.
	//
	// `value` prop → editor content sync is also gone for collab mode:
	// Yjs is the source of truth once we've joined a doc, and blindly
	// calling `setContent` here would clobber concurrent remote edits.
	// The one-time cold-start seeding lives in `onSyncInit` above.
	// Non-collab callers (no docName) get their content via `content:`
	// in the Editor constructor, which is unchanged.

	onDestroy(() => {
		closePopover();
		disconnectCollab();
		editor?.destroy();
	});

	const btn = (active: boolean) =>
		`rounded p-1 transition-colors ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`;
</script>

<div class="markdown-editor-shell flex flex-col">
	<!--
		Toolbar sticks to the top of the scroll container so formatting buttons
		remain reachable while editing long notes. Only rendered while editing
		— in 'view' mode we show the rendered markdown without any chrome.

		Background and stacking are set via scoped CSS rather than Tailwind
		utilities: the prose content below can carry its own stacking context
		(selection highlights, tables, resize handles), and Tailwind's `bg-*`
		utilities were being painted over in practice. The scoped rules use
		the raw HSL variables and `isolation: isolate` on the shell so paint
		order is unambiguous regardless of what the ProseMirror DOM sets.
	-->
	{#if readOnlyFromServer}
		<!--
			Server-side ACL banner. Rendered even when `readOnly` was
			also passed by the caller, because "the caller set us to
			view-only" and "the server refuses your write" mean very
			different things to the user and only the second one
			warrants a warning.
		-->
		<div
			class="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
			role="status"
		>
			You don't have permission to edit this document. Changes are read-only.
		</div>
	{/if}
	{#if viewMode !== 'view'}
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

		<div class="ml-auto flex items-center gap-0.5">
			<button
				class="flex items-center gap-1 rounded p-1 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
				title={viewMode === 'edit-preview' ? 'Back to editing' : 'Preview rendered markdown'}
				onclick={togglePreview}
			>
				{#if viewMode === 'edit-preview'}
					<PencilIcon size="12" />
					<span>Edit</span>
				{:else}
					<EyeIcon size="12" />
					<span>Preview</span>
				{/if}
			</button>

			<button
				class="flex items-center gap-1 rounded p-1 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
				title="Exit edit mode"
				onclick={exitEdit}
			>
				<CheckIcon size="12" />
				<span>Done</span>
			</button>
		</div>
	</div>
	{/if}

	<!--
		Body wrapper. In 'view' or 'edit-preview' mode we show the rendered
		markdown via the same DOMPurify+converter pipeline as MarkDownPreview.
		The tiptap editor element stays mounted at all times (just hidden when
		not in 'edit') so the collab socket and editor state survive transitions
		without re-init.
	-->
	<!-- svelte-ignore a11y_mouse_events_have_key_events — keyboard equivalents
		 live in onfocusin/onfocusout below (focus events on mention chips).
		 The Svelte linter only recognises onfocus/onblur for this rule, which
		 do not bubble and therefore can't be used here. -->
	<div
		class="markdown-editor-body relative {viewMode === 'edit'
			? 'mt-2 rounded-md border border-border/50 bg-background'
			: ''}"
		role="group"
		onmouseover={handleBodyMouseOver}
		onmouseout={handleBodyMouseOut}
		onfocusin={handleBodyFocusIn}
		onfocusout={handleBodyFocusOut}
	>
		{#if viewMode === 'view' || viewMode === 'edit-preview'}
			<div
				bind:this={previewContainerEl}
				role="textbox"
				tabindex="0"
				ondblclick={enterEdit}
				class="prose prose-sm dark:prose-invert max-w-none cursor-text px-1 text-sm leading-normal [&_p]:my-1.5 [&_p]:text-sm [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h2]:text-base [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0 [&_li]:text-sm [&_blockquote]:my-2 [&_blockquote]:text-sm [&_pre]:my-2 [&_pre]:text-xs [&_code]:text-xs {viewMode ===
				'edit-preview'
					? 'rounded-md border border-border/50 bg-background p-3'
					: ''}"
			>
				{#if !hasHydrated}
					<!--
						Collab mode, waiting for the server's sync-init. We used
						to fall through to "Double-click to edit…" here, which
						flashed the empty-state placeholder for every doc that
						had content — including ones the user could see loaded
						a moment earlier. A soft skeleton stripe reads as "still
						loading" rather than "this doc is empty, edit me".
					-->
					<div class="space-y-2 px-1 py-2" aria-hidden="true">
						<div class="h-3 w-2/3 animate-pulse rounded bg-muted/50"></div>
						<div class="h-3 w-11/12 animate-pulse rounded bg-muted/40"></div>
						<div class="h-3 w-4/5 animate-pulse rounded bg-muted/40"></div>
					</div>
				{:else if viewIsEmpty}
					<p class="italic text-muted-foreground">
						{#if viewMode === 'edit-preview'}
							Nothing to preview yet.
						{:else if effectiveReadOnly}
							No content.
						{:else}
							Double-click to edit…
						{/if}
					</p>
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html renderedHtml}
				{/if}
			</div>
		{/if}

		<div bind:this={editorElement} class:hidden={viewMode !== 'edit'}></div>

		{#if uploading}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<span class="text-xs text-muted-foreground">Uploading image…</span>
			</div>
		{/if}
	</div>
</div>

{#if assetDialogId !== null}
	<AssetDetailDialog assetId={assetDialogId} bind:open={assetDialogOpen} />
{/if}

{#if iocDialogId !== null && caseId != null}
	<IocDetailDialog
		caseId={Number(caseId)}
		iocId={iocDialogId}
		bind:open={iocDialogOpen}
	/>
{/if}

{#if taskDialogId !== null && caseId != null}
	<TaskDetailDialog
		caseId={Number(caseId)}
		taskId={taskDialogId}
		bind:open={taskDialogOpen}
	/>
{/if}

{#if noteDialogId !== null && caseId != null}
	<NoteDetailDialog
		caseId={Number(caseId)}
		noteId={noteDialogId}
		bind:open={noteDialogOpen}
	/>
{/if}

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

	/* Mention chip rendered both inside tiptap and in the read-only preview.
	   `display: inline-flex` with a tiny gap keeps the chip glued to surrounding
	   text without inheriting the prose plugin's heading sizes. */
	:global(.mention-chip) {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		line-height: 1.1;
		padding: 0.05rem 0.3rem;
		margin: 0 0.05rem;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-weight: 500;
		white-space: nowrap;
	}

	:global(.mention-chip-icon) {
		flex-shrink: 0;
		width: 0.7rem;
		height: 0.7rem;
	}

	:global(.mention-chip-clickable) {
		cursor: pointer;
		transition: filter 120ms ease;
	}

	:global(.mention-chip-clickable:hover) {
		filter: brightness(0.92);
	}

	/*
	 * Containment for content wider than the available container.
	 * Without these the preview HTML for notes/summaries with pasted
	 * images, long code blocks, or unbreakable URLs would overflow the
	 * panel and get clipped by an ancestor's `overflow:hidden`. We scope
	 * to `.markdown-editor-body` so we don't conflict with prose styling
	 * elsewhere in the app.
	 *
	 *  - <img>: scale down to fit the container width; preserve aspect
	 *    ratio via height:auto.
	 *  - <pre>: keep formatting (no wrap) but allow horizontal scroll.
	 *  - block content: break very long words / URLs that would
	 *    otherwise force a wider-than-container line.
	 */
	:global(.markdown-editor-body img) {
		max-width: 100%;
		height: auto;
	}

	:global(.markdown-editor-body pre) {
		overflow-x: auto;
		max-width: 100%;
	}

	:global(.markdown-editor-body) {
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	/*
	 * Remote-cursor styling for `@tiptap/extension-collaboration-caret`.
	 *
	 * Without these rules the extension inserts unstyled `<span class=
	 * "collaboration-carets__caret">` + `<div class=".__label">` nodes
	 * into the text flow. Every keystroke triggers a re-render (see the
	 * awareness event chain) and the unstyled label ends up briefly
	 * pushing surrounding text around — which reads as "text blinking
	 * because it comes and goes." Positioning the label absolutely
	 * anchors it out of the flow and stops the flicker.
	 *
	 * The `border-color` and `background-color` are picked from the
	 * `user.color` attribute the client sets when it seeds local
	 * awareness (see `pickCursorColor(user.id)`). The extension writes
	 * that color as an inline style on the caret span, so we don't need
	 * to hardcode anything here — we only own the layout.
	 */
	:global(.collaboration-carets__caret) {
		position: relative;
		border-left: 1px solid;
		border-right: 1px solid;
		margin-left: -1px;
		margin-right: -1px;
		pointer-events: none;
		word-break: normal;
	}

	:global(.collaboration-carets__label) {
		position: absolute;
		top: -1.4em;
		left: -1px;
		padding: 0.1rem 0.4rem;
		border-radius: 3px 3px 3px 0;
		font-size: 0.7rem;
		font-weight: 500;
		line-height: 1;
		color: white;
		white-space: nowrap;
		user-select: none;
		/* Keep the label above the sticky toolbar layer but below modal
		   dialogs. Also fade to make rapid cursor movement feel less
		   twitchy without hiding presence entirely. */
		z-index: 5;
		opacity: 0.9;
		transition: opacity 100ms ease;
	}

	/*
	 * Optional selection tint for a remote peer's ProseMirror selection.
	 * y-prosemirror's default selectionBuilder returns
	 * `{ nodeName: 'span', class: 'ProseMirror-yjs-selection', style: ...}`.
	 * The inline style already sets background-color; we only need to
	 * keep it from swallowing pointer events on our own content.
	 */
	:global(.ProseMirror-yjs-selection) {
		pointer-events: none;
	}
</style>
