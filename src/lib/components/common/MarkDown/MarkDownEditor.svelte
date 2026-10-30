<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
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
	import { Annotation, Compartment, EditorState, Prec } from '@codemirror/state';
	import { EditorView, keymap, placeholder } from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
	import { normalizeLegacyContent } from './legacy-content';
	import { renderMarkdown } from './render-markdown';
	import { authenticateDatastoreImages } from './authenticate-datastore-images';
	import { decorateMentionChips } from './decorate-mention-chips';
	import { highlightCodeBlocks } from './highlight-code-blocks';
	import { isInCode, markdownLivePreview } from './markdown-live-preview';
	import { markdownMentions } from './markdown-mentions';
	import { markdownTheme } from './markdown-theme';
	import {
		activeFormats,
		deleteTable,
		insertAtCaret,
		insertTable,
		NO_ACTIVE_FORMATS,
		runTableOp,
		toggleCodeBlock,
		toggleHeading,
		toggleInlineMark,
		toggleLinePrefix,
		toggleLink,
		type ActiveFormats
	} from './markdown-commands';
	import { hasStructuredHtml, htmlToMarkdown } from './html-to-markdown';
	import { ApiService } from '$lib/services/api.service';
	import { auth } from '$lib/stores/auth.store';
	import { io, type Socket } from 'socket.io-client';
	import { socketOrigin } from '$lib/config/api.config';
	import * as Y from 'yjs';
	import { Awareness } from 'y-protocols/awareness';
	import { SocketYjsProvider } from '$lib/collab/socket-yjs-provider';
	import type { MentionItem } from './MentionList.svelte';
	import { UsersService, type MentionableUser } from '$lib/services/users.service';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import { CaseDatastoreService } from '$lib/services/case-datastore.service';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';
	import { AlertService } from '$lib/services/alerts.service';
	import type { Alert } from '$lib/types/resources/alert';
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
		readOnly = false,
		onSyncStateChange,
		onLocalEdit
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
		/** Collab only: whether some local edits aren't stored by the server yet. */
		onSyncStateChange?: (unsynced: boolean) => void;
		/** Collab only: fired on every edit made in this editor. */
		onLocalEdit?: () => void;
	}>();

	type ViewMode = 'view' | 'edit' | 'edit-preview';
	// initialMode is a one-shot seed — we deliberately capture its value
	// once and never reactively rebind. untrack() also silences the
	// state_referenced_locally warning.
	let viewMode = $state<ViewMode>(untrack(() => initialMode));

	// In collab mode the parent's `value` prop is empty on mount and only
	// gets populated by an async fetch that races the Yjs sync-init, so the
	// view mode never reads `value` there: it renders `docText`, the
	// editor's own document, kept current by the update listener. The
	// "empty" placeholder waits for `hasHydrated` so it never flashes
	// before we know whether the doc actually is empty. Non-collab
	// callers render `value`.
	let hasHydrated = $state<boolean>(false);
	let docText = $state<string>('');
	// Container for the {@html renderedHtml} preview. We bind it so we
	// can sweep its `<img>` children and swap any datastore URLs to
	// bearer-authenticated blob URLs — otherwise the browser fetches the
	// raw `/api/v2/cases/.../files/N` with no Authorization header and
	// the server 401s.
	let previewContainerEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		// The mode is checked first so `renderedHtml` is only computed when
		// it is shown.
		if (viewMode !== 'view' && viewMode !== 'edit-preview') return;
		void renderedHtml;
		if (!previewContainerEl) return;
		// Chips are stored as bare data attributes; the sweep gives them
		// their icon and colours. Code blocks get the editor's colours.
		decorateMentionChips(previewContainerEl);
		highlightCodeBlocks(previewContainerEl);
		const dispose = authenticateDatastoreImages(previewContainerEl);
		return dispose;
	});

	const enterEdit = async () => {
		if (effectiveReadOnly) return;
		if (viewMode === 'view') {
			viewMode = 'edit';
			await tick();
			// The editor was laid out while hidden.
			view?.requestMeasure();
			view?.focus();
		}
	};

	const exitEdit = () => {
		viewMode = 'view';
	};

	const togglePreview = () => {
		viewMode = viewMode === 'edit' ? 'edit-preview' : 'edit';
	};

	let editorElement = $state<HTMLDivElement | null>(null);
	let view: EditorView | null = null;
	let uploading = $state(false);
	// What the caret is in, for the toolbar's pressed buttons and the
	// contextual table controls.
	let active = $state<ActiveFormats>(NO_ACTIVE_FORMATS);
	const readOnlyCompartment = new Compartment();
	// Marks the changes the component makes itself (the parent resetting
	// `value`), which are not user edits and must not echo to `onChange`.
	const External = Annotation.define<boolean>();

	// --- Real-time collaboration (Yjs) -----------------------------------
	// The editor is CRDT-backed via Yjs: its document is bound to the
	// `markdown` Y.Text of the doc by y-codemirror.
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
		collabMode ?? (warRoomNoteId ? 'war-room-note' : sitrepId ? 'sitrep' : noteId ? 'note' : 'case')
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

	// What the view mode shows (see `docText` above).
	const shownMarkdown = $derived(docName ? docText : (value ?? ''));
	const viewIsEmpty = $derived(shownMarkdown.trim().length === 0);

	// The HTML we render inside {@html …} in view / edit-preview modes.
	// Derived lazily: while editing it is never read, so typing doesn't
	// re-render the whole note to HTML on every keystroke.
	const renderedHtml = $derived(renderMarkdown(shownMarkdown));

	// Non-collab callers (no docName) have their content from the start:
	// the plain-form/task/evidence/IOC/asset call sites.
	untrack(() => {
		if (!docName) hasHydrated = true;
	});

	// Non-collab: replace the editor content when the parent resets
	// `value` from outside (e.g. dialog opens a different event). Only
	// when the incoming value wasn't emitted by us — that way normal user
	// typing (which updates lastEmittedMarkdown) doesn't round-trip into
	// a replace that would move the cursor.
	$effect(() => {
		if (docName) return;
		const md = value ?? '';
		if (md === lastEmittedMarkdown) return;
		if (!view) return;
		lastEmittedMarkdown = md;
		const next = normalizeLegacyContent(md);
		if (next === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next },
			annotations: [External.of(true)]
		});
	});

	let socket: Socket | null = null;
	// `ydoc` and `awareness` are created EAGERLY (in the same tick as the
	// component's `<script>` runs, before `onMount`) rather than lazily
	// inside `connectCollab()`, because they need to be non-null when we
	// build the editor — y-codemirror binds the editor to the doc's
	// `markdown` Y.Text when its extension is created. The socket/provider
	// are still lazy: those come up in `connectCollab()`.
	//
	// `untrack()` mirrors the pattern used above for `initialMode`: we
	// intentionally want the value of `docName` at construction time,
	// not a reactive subscription. Subsequent doc changes go through
	// the doc-change $effect which tears down and re-creates both.
	let ydoc: Y.Doc | null = untrack(() => (docName ? new Y.Doc() : null));
	let provider: SocketYjsProvider | null = null;
	// Awareness identity for the remote carets peers draw. We fill
	// this in once the server's sync-init hands us the resolved user info.
	let awareness: Awareness | null = ydoc ? new Awareness(ydoc) : null;
	// Read-only bit computed from the server's `can_write` on join. The
	// server is the single source of truth for editor content in Option
	// A — it's also the single source of truth for the write-permission
	// answer. We never seed content from any client-side fallback path,
	// so if the server reports read-only that's the whole story.
	let readOnlyFromServer = $state(false);
	// The server's doc was replaced by an unrelated one (see
	// `SocketYjsProvider.onDocReplaced`): ours can't sync anymore.
	let docReplaced = $state(false);
	// Effective read-only combines the caller's opt-in (`readOnly` prop)
	// with the server's verdict. A local user editing the DOM without
	// write access can still generate Yjs updates, but the server drops
	// them — this signal prevents that from happening client-side too.
	const effectiveReadOnly = $derived(readOnly || readOnlyFromServer || docReplaced);

	// The update listener fires on every doc change — including the
	// very first one, applying the server's initial `y_state`. If we
	// called `onChange(md)` on it, the parent's `draftContent` would
	// drift from its `baseContent` (the server column can differ from
	// the live doc, e.g. a legacy note converted on load). Parents that
	// derive "unsaved" from `draft !== base` would then flag every
	// freshly-opened note as dirty. We hold `onChange` back until the
	// initial `sync-init` has been applied — after that, every onChange
	// is a user edit.
	//
	// Non-collab callers (no docName, e.g. task/evidence forms) don't
	// go through `sync-init` at all, so we default the flag to true
	// for them so their onChange fires immediately.
	//
	// `untrack()` — we deliberately want the initial value only. The
	// caller wraps this component in `{#key <id>}` so a docName swap
	// forces a full remount, which is when this initialiser re-runs.
	let readyForOnChange = $state<boolean>(untrack(() => !docName));
	// Last markdown we handed the parent via `onChange` (or received from
	// it). Guards against echo emissions: a change that leaves the text
	// as it was must not flip the parent's dirty flag.
	let lastEmittedMarkdown: string | null = null;

	const connectCollab = () => {
		if (!docName || !ydoc || !awareness) return;

		const token = auth.getAccessToken();
		const baseUrl = socketOrigin();

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
			// Read on every (re)connect: the token in hand at mount has
			// usually been rotated by the time the socket reconnects, and a
			// rejected reconnect leaves the editor offline.
			auth: (cb) => {
				const current = auth.getAccessToken();
				cb(current ? { token: current } : {});
			},
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
				const color = pickCursorColor(user.id ?? 0);
				awareness?.setLocalStateField('user', {
					name: user.name ?? 'user',
					userId: user.id,
					color,
					colorLight: `${color}33`
				});
				// No cold-start seeding path. The server owns the
				// authoritative Y.Doc (see `iris_engine/collab/render.py`
				// and `business/collab.ensure_snapshot`) — by the time this
				// callback fires, `SocketYjsProvider` has applied the
				// server's y_state, and y-codemirror has already copied the
				// `markdown` text into the editor. Inserting anything here
				// would duplicate the content.
				//
				// From here on, a doc change → onChange is a real user edit.
				// See `readyForOnChange` at the top of the module for the
				// reason we gated it in the first place.
				if (view) {
					docText = view.state.doc.toString();
					lastEmittedMarkdown = docText;
				}
				readyForOnChange = true;
				hasHydrated = true;
			},
			onPermissionDenied: () => {
				readOnlyFromServer = true;
			},
			onSyncStateChange: (unsynced) => onSyncStateChange?.(unsynced),
			onLocalEdit: () => onLocalEdit?.(),
			onDocReplaced: () => {
				docReplaced = true;
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
		'#f87171',
		'#fb923c',
		'#fbbf24',
		'#4ade80',
		'#22d3ee',
		'#60a5fa',
		'#a78bfa',
		'#f472b6'
	];
	const pickCursorColor = (userId: number) =>
		CURSOR_PALETTE[Math.abs(userId) % CURSOR_PALETTE.length];

	// --- Image upload ---
	// Images go to the case datastore, or to the war room's own datastore
	// for war-room notes, summary and sitreps, which have no case.
	const canUploadImages = $derived(!!caseId || !!warRoomId);

	const uploadImage = async (file: File): Promise<string | null> => {
		const filename = file.name || `image-${Date.now()}.png`;

		if (!caseId) {
			if (!warRoomId) return null;
			const named = file.name ? file : new File([file], filename, { type: file.type });
			const res = await WarRoomDatastoreService.upload(Number(warRoomId), named);
			if (res.ok && res.data && typeof res.data === 'object' && 'file_id' in res.data) {
				return WarRoomDatastoreService.downloadUrl(Number(warRoomId), res.data.file_id);
			}
			toast({
				title: 'Could not upload image',
				description: typeof res.data === 'string' ? res.data : undefined,
				variant: 'destructive'
			});
			return null;
		}

		const base64 = await new Promise<string>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(';base64,')[1]);
			};
			reader.readAsDataURL(file);
		});

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

	const handleImageUpload = async (file: File, at?: number) => {
		if (!view || !canUploadImages) return;

		uploading = true;
		try {
			const url = await uploadImage(file);
			if (url && view) {
				const alt = (file.name || 'image').replace(/[[\]]/g, '');
				if (at !== undefined) {
					view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } });
				}
				insertAtCaret(view, `![${alt}](${url})`);
			}
		} finally {
			uploading = false;
		}
	};

	// Heuristic: is this text markdown source? Then it is pasted as is,
	// even when the clipboard also carries an HTML rendering of it (e.g.
	// copying from a code view on GitHub) — converting that HTML back
	// would only lose fidelity.
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

	const handlePaste = (event: ClipboardEvent, target: EditorView): boolean => {
		const items = event.clipboardData?.items;
		const clipboard = event.clipboardData;

		// 1. Image files on the clipboard — upload and insert as an image.
		//    Covers: screenshots (Cmd-Shift-4), "copy image" from browsers,
		//    pasting a file from the OS file manager.
		if (items && canUploadImages) {
			for (const item of items) {
				if (item.kind === 'file' && item.type.startsWith('image/')) {
					event.preventDefault();
					const file = item.getAsFile();
					if (file) handleImageUpload(file);
					return true;
				}
			}
		}

		// 2. Rich text — a web page, a document, an IRIS preview — comes in
		//    as markdown, so its headings, lists, tables, links and chips
		//    survive. Plain text, markdown source and anything pasted into
		//    code go in as typed (CodeMirror's own paste).
		if (!clipboard) return false;
		const html = clipboard.getData('text/html');
		const text = clipboard.getData('text/plain');
		if (!html || looksLikeMarkdown(text)) return false;
		if (isInCode(target.state, target.state.selection.main.head)) return false;
		if (!hasStructuredHtml(html)) return false;
		const md = htmlToMarkdown(html);
		if (!md) return false;
		event.preventDefault();
		insertAtCaret(target, md);
		return true;
	};

	const handleDrop = (event: DragEvent, target: EditorView): boolean => {
		if (!canUploadImages) return false;

		const files = event.dataTransfer?.files;
		if (!files?.length) return false;

		for (const file of files) {
			if (file.type.startsWith('image/')) {
				event.preventDefault();
				const at = target.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined;
				handleImageUpload(file, at);
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

	// Per-query cache keyed by the trimmed lowercased `q` so re-opening
	// the popover with the same prefix reuses the previous response.
	// The backend caps each response at `_MENTION_LIMIT` (see
	// `blueprints/rest/v2/avatars.py`); caching client-side used to
	// mean anyone past that cap was unreachable — see the bug reported
	// 2026-07-17. Keying the cache on `q` fixes that: each keystroke
	// hits the server and gets the server-side prefix match.
	const usersByQuery = new Map<string, MentionableUser[]>();
	const inflightUsers = new Map<string, Promise<MentionableUser[]>>();

	const loadUsers = async (q: string = ''): Promise<MentionableUser[]> => {
		const key = q.trim().toLowerCase();
		const cached = usersByQuery.get(key);
		if (cached) return cached;
		const inflight = inflightUsers.get(key);
		if (inflight) return inflight;

		const p = (async () => {
			// `/api/v2/users/mentionable` is auth-gated but not admin-
			// gated, so analysts (who can't call `/manage/users`) can
			// still list colleagues to mention. Payload is deliberately
			// minimal (id, login, name).
			const res = await UsersService.listMentionable(key);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const inner = (res?.data as any)?.data;
			let list: MentionableUser[] = [];
			if (Array.isArray(inner)) {
				list = inner as MentionableUser[];
			} else if (Array.isArray(res?.data)) {
				list = res.data as MentionableUser[];
			}
			usersByQuery.set(key, list);
			inflightUsers.delete(key);
			return list;
		})();
		inflightUsers.set(key, p);
		return p;
	};

	const fuzzy = (haystack: string, needle: string) =>
		haystack.toLowerCase().includes(needle.toLowerCase());

	// War-room teams are cached alongside users so the @-popover can list
	// both. Only populated when `warRoomId` is set on the editor.
	let teamCache: Array<{ team_id: number; name: string; description: string | null }> | null = null;
	let teamPromise: Promise<
		Array<{ team_id: number; name: string; description: string | null }>
	> | null = null;

	const loadTeams = async () => {
		if (!warRoomId) return [];
		if (teamCache) return teamCache;
		if (!teamPromise) {
			teamPromise = (async () => {
				try {
					const { WarRoomTeamsService } = await import('$lib/services/war-room-teams.service');
					const res = await WarRoomTeamsService.list(Number(warRoomId));
					if (res.ok && Array.isArray(res.data)) {
						teamCache = res.data;
						return res.data;
					}
				} catch {
					// Teams are additive — a failure to fetch them shouldn't
					// break the @-user popover.
				}
				teamCache = [];
				return [];
			})();
		}
		return teamPromise;
	};

	const fetchUserItems = async (query: string): Promise<MentionItem[]> => {
		const q = query.trim();

		// Users are filtered *server-side* — passing `q` to loadUsers
		// scopes the response to matches for that prefix/substring so
		// large tenants (>_MENTION_LIMIT users) still surface the
		// intended target when their name is typed. Teams are small
		// enough to keep filtering client-side.
		const [users, teams] = await Promise.all([loadUsers(q), loadTeams()]);

		// Teams surface at the top of the popover — quicker to reach when
		// the operator wants to page a whole group, and keeps the mental
		// model "@-team pages a bunch of people" front and center.
		const filteredTeams = q ? teams.filter((t) => fuzzy(t.name, q)) : teams;
		const teamItems: MentionItem[] = filteredTeams.slice(0, 4).map((t) => ({
			id: t.team_id,
			label: t.name,
			sublabel: t.description ?? 'Team',
			kind: 'team' as const
		}));

		const userItems: MentionItem[] = users.slice(0, 8 - teamItems.length).map((u) => ({
			id: u.user_id,
			label: u.user_name,
			sublabel: u.user_login,
			kind: 'user' as const
		}));

		return [...teamItems, ...userItems];
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

	// Alerts are the odd bucket out: assets/IOCs/notes/tasks/datastore all
	// have a CASE_*_CTX the whole page shares, but there is no alerts
	// context on a case page. The list is small (the alerts linked to this
	// one case) so we hold it locally for the life of the editor instance —
	// the same one-fetch-then-reuse contract makeLazyLoader gives the
	// others, just with the cache here instead of in a store.
	let caseAlerts: Alert[] | null = null;

	const ensureAlertsLoaded = makeLazyLoader(
		() => caseAlerts !== null,
		async () => {
			const numericCaseId = Number(caseId);
			if (!Number.isFinite(numericCaseId)) {
				// War-room notes and other case-less mounts: record the empty
				// result so we don't retry on every keystroke.
				caseAlerts = [];
				return caseAlerts;
			}
			const res = await AlertService.list({ case_id: numericCaseId, per_page: 100 }, { fetch });
			caseAlerts =
				res.ok && res.data && typeof res.data !== 'string' ? (res.data.data?.alerts ?? []) : [];
			return caseAlerts;
		}
	);

	// Per-id detail fetch behind the alert chip's hover card. Separate from
	// `caseAlerts` above because a chip can reference an alert the `#`
	// picker never listed — an older escalation, or one whose case link was
	// since removed.
	const cachedAlerts = new Map<number, Alert | null>();
	const loadAlert = async (alertId: number): Promise<Alert | null> => {
		const cached = cachedAlerts.get(alertId);
		if (cached !== undefined) return cached;
		const res = await AlertService.get(alertId, { fetch });
		const alert = res.ok && res.data && typeof res.data !== 'string' ? res.data : null;
		cachedAlerts.set(alertId, alert);
		return alert;
	};

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
			ensureDatastoreLoaded(),
			ensureAlertsLoaded()
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
				? iocs.filter((i) => fuzzy(i.ioc_value ?? '', q) || fuzzy(i.ioc_type?.type_name ?? '', q))
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

		if (caseAlerts) {
			// Matched on id as well as title: the chip's label is `Alert #N`,
			// so "the number" is how operators refer to an alert and is what
			// they'll type after the `#` trigger.
			const filtered = q
				? caseAlerts.filter((a) => fuzzy(a.alert_title ?? '', q) || fuzzy(String(a.alert_id), q))
				: caseAlerts;
			for (const a of filtered.slice(0, PER_KIND)) {
				out.push({
					// Short and stable — the title is long and mutable, so it
					// goes in the sublabel here and in the hover card later.
					id: a.alert_id,
					label: `Alert #${a.alert_id}`,
					sublabel: a.alert_title,
					kind: 'alert'
				});
			}
		}

		return out;
	};

	// --- Chip click popover ---
	//
	// Delegated handlers on the editor body. Work for both:
	//   - view/preview HTML rendered via {@html renderedHtml}
	//   - the chip widgets the live preview draws in edit mode

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
				assignees: task?.task_assignees?.map((a) => a.name || a.user).join(', ') || null,
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
							const md = `[${(file?.file_original_name ?? label).replace(/[[\]]/g, '')}](${url})`;
							try {
								await navigator.clipboard.writeText(md);
								toast({ title: 'Markdown link copied', variant: 'success' });
							} catch {
								toast({ title: 'Copy failed', variant: 'destructive' });
							}
						}
					: undefined
			};
		} else if (kind === 'alert') {
			// Unlike every other kind here there is no context cache to read
			// from — the alert is fetched on hover and memoised for the life
			// of the editor. Misses are cached too, so a chip pointing at a
			// deleted alert doesn't re-request on every hover.
			const alert = Number.isFinite(numericId) ? await loadAlert(numericId) : null;
			payload = {
				kind: 'alert',
				id,
				label,
				title: alert?.alert_title ?? null,
				severity: alert?.severity?.severity_name ?? null,
				status: alert?.status?.status_name ?? null,
				customer: alert?.customer?.customer_name ?? null,
				// Navigate instead of mounting AlertDetailDialog the way the
				// case-object kinds above do: that dialog needs ALERTS_CTX,
				// CASES_CTX, COMMENTS_PANEL_CTX and
				// INVESTIGATION_FLOW_PANEL_CTX, none of which a case page
				// provides. `/alerts/[alert_id]` sets all four up itself.
				onOpen: Number.isFinite(numericId) ? () => goto(`/alerts/${numericId}`) : undefined
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

	const askLinkUrl = () => window.prompt('URL');

	// --- Editor setup ---
	onMount(() => {
		if (!editorElement) return;

		const collab = ydoc ? ydoc.getText('markdown') : null;

		view = new EditorView({
			parent: editorElement,
			state: EditorState.create({
				// In collab mode the content comes from the server's
				// `sync-init`: y-codemirror fills the editor when the y_state
				// is applied. Non-collab callers get their prop content now.
				doc: docName ? '' : normalizeLegacyContent(value ?? ''),
				extensions: [
					// Before the default keymap, so Mod-Enter saves rather
					// than inserting a blank line.
					Prec.highest(
						keymap.of([
							{ key: 'Mod-Enter', run: () => (onSave(), true) },
							{ key: 'Mod-s', run: () => (onSave(), true), preventDefault: true },
							{ key: 'Mod-b', run: (v) => toggleInlineMark(v, '**') },
							{ key: 'Mod-i', run: (v) => toggleInlineMark(v, '*') },
							{ key: 'Mod-k', run: (v) => toggleLink(v, askLinkUrl) }
						])
					),
					// Yjs has its own undo manager in collab mode: CodeMirror's
					// history would undo the peers' edits too.
					...(collab && awareness
						? [
								yCollab(collab, awareness, { undoManager: new Y.UndoManager(collab) }),
								keymap.of(yUndoManagerKeymap)
							]
						: [history(), keymap.of(historyKeymap)]),
					keymap.of([...defaultKeymap, indentWithTab]),
					markdown({ base: markdownLanguage, codeLanguages: languages }),
					markdownLivePreview(),
					markdownMentions({ users: fetchUserItems, caseObjects: fetchCaseItems }),
					markdownTheme(),
					EditorView.lineWrapping,
					placeholder('Write a comment…'),
					readOnlyCompartment.of(readOnlyExtensions(effectiveReadOnly)),
					EditorView.domEventHandlers({ paste: handlePaste, drop: handleDrop }),
					EditorView.updateListener.of((update) => {
						if (update.docChanged || update.selectionSet || update.focusChanged) {
							active = activeFormats(update.state);
						}
						if (!update.docChanged) return;
						const md = update.state.doc.toString();
						// The view mode in collab renders this, including the
						// content the server's y_state brings in.
						if (docName) docText = md;
						if (update.transactions.some((tr) => tr.annotation(External))) return;
						if (!readyForOnChange) {
							// The initial sync: not an edit. See `readyForOnChange`.
							lastEmittedMarkdown = md;
							return;
						}
						if (md === lastEmittedMarkdown) return;
						lastEmittedMarkdown = md;
						onChange(md);
					})
				]
			})
		});

		if (docName) {
			connectCollab();
			// Intentionally no safety-net seed: the server is the sole
			// source of truth for editor content. If `sync-init` never
			// arrives, the editor stays empty and the `[collab]
			// connect_error` log tells operators why. Falling back to
			// `value` from the parent would duplicate content once the
			// doc does sync.
		}
	});

	function readOnlyExtensions(readOnly: boolean) {
		return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
	}

	// y-codemirror binds the editor to one Y.Text when its extension is
	// created; swapping the Y.Doc afterwards does NOT rebind, and quietly
	// leaves the editor pointing at a dead doc. Parent pages already wrap
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

	// Keep the editor's editable state in lockstep with the effective
	// read-only signal. This covers three transitions:
	//   1. Caller flips `readOnly` prop (e.g. a parent switches modes).
	//   2. Server reports `can_write=false` at join time.
	//   3. Server sends a mid-session `permission-denied` after an
	//      ACL change.
	// A read-only editor refuses local edits, so Yjs never sees an
	// update to forward. Belt AND braces — the server also drops writes
	// from unauthorised users via `resolve_doc` on every incoming `sync`
	// message.
	$effect(() => {
		const readOnlyNow = effectiveReadOnly;
		if (!view) return;
		view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExtensions(readOnlyNow)) });
		if (readOnlyNow && viewMode !== 'view') {
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
	// There is no `value` prop → editor content sync in collab mode:
	// Yjs is the source of truth once we've joined a doc, and replacing
	// the text here would clobber concurrent remote edits.

	onDestroy(() => {
		closePopover();
		// The editor first: y-codemirror unhooks from the Y.Text and the
		// awareness before they are destroyed.
		view?.destroy();
		view = null;
		disconnectCollab();
	});

	// Toolbar actions go through here so a click with no editor (not
	// mounted yet) is a no-op.
	const run = (command: (v: EditorView) => unknown) => {
		if (view) command(view);
	};

	const btn = (pressed: boolean) =>
		`rounded p-1 transition-colors ${pressed ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`;
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
		order is unambiguous regardless of what the editor DOM sets.

		Mousedown on the toolbar is cancelled so a click doesn't take the
		focus out of the editor — unfocused, the live preview hides the
		markdown syntax the caret is on.
	-->
	{#if docReplaced}
		<div
			class="mb-2 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
			role="alert"
		>
			<span class="flex-1">
				This document was replaced on the server while you were disconnected. Reload the page to
				keep editing. Changes made since the disconnection can't be saved: copy them first.
			</span>
			<button
				type="button"
				class="rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-500/60 dark:hover:bg-amber-900/40"
				onclick={() => location.reload()}
			>
				Reload
			</button>
		</div>
	{:else if readOnlyFromServer}
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
			role="toolbar"
			tabindex="-1"
			onmousedown={(e) => e.preventDefault()}
		>
			<button
				type="button"
				title="Bold"
				class={btn(active.bold)}
				onclick={() => run((v) => toggleInlineMark(v, '**'))}
			>
				<BoldIcon size="12" />
			</button>

			<button
				type="button"
				title="Italic"
				class={btn(active.italic)}
				onclick={() => run((v) => toggleInlineMark(v, '*'))}
			>
				<ItalicIcon size="12" />
			</button>

			<button
				type="button"
				title="Strikethrough"
				class={btn(active.strike)}
				onclick={() => run((v) => toggleInlineMark(v, '~~'))}
			>
				<StrikethroughIcon size="12" />
			</button>

			<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

			<button
				type="button"
				title="Heading 1"
				class={btn(active.heading === 1)}
				onclick={() => run((v) => toggleHeading(v, 1))}
			>
				<Heading1Icon size="12" />
			</button>

			<button
				type="button"
				title="Heading 2"
				class={btn(active.heading === 2)}
				onclick={() => run((v) => toggleHeading(v, 2))}
			>
				<Heading2Icon size="12" />
			</button>

			<button
				type="button"
				title="Heading 3"
				class={btn(active.heading === 3)}
				onclick={() => run((v) => toggleHeading(v, 3))}
			>
				<Heading3Icon size="12" />
			</button>

			<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

			<button
				type="button"
				title="Bulleted list"
				class={btn(active.bulletList)}
				onclick={() => run((v) => toggleLinePrefix(v, 'bullet'))}
			>
				<ListIcon size="12" />
			</button>

			<button
				type="button"
				title="Numbered list"
				class={btn(active.orderedList)}
				onclick={() => run((v) => toggleLinePrefix(v, 'ordered'))}
			>
				<ListOrderedIcon size="12" />
			</button>

			<button
				type="button"
				title="Quote"
				class={btn(active.blockquote)}
				onclick={() => run((v) => toggleLinePrefix(v, 'quote'))}
			>
				<QuoteIcon size="12" />
			</button>

			<button
				type="button"
				title="Code block"
				class={btn(active.codeBlock)}
				onclick={() => run(toggleCodeBlock)}
			>
				<CodeIcon size="12" />
			</button>

			<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

			<button
				type="button"
				title={active.link ? 'Remove link' : 'Link'}
				class={btn(active.link)}
				onclick={() => run((v) => toggleLink(v, askLinkUrl))}
			>
				<LinkIcon size="12" />
			</button>

			{#if canUploadImages}
				<button
					type="button"
					title="Insert image"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					disabled={uploading}
					onclick={triggerFileInput}
				>
					<ImageIcon size="12" />
				</button>
			{/if}

			<button
				type="button"
				class={btn(active.table)}
				title="Insert table"
				onclick={() => run(insertTable)}
			>
				<TableIcon size="12" />
			</button>

			{#if active.table}
				<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Add row below"
					onclick={() => run((v) => runTableOp(v, 'addRowAfter'))}
				>
					<Rows3Icon size="12" />
					<span class="sr-only">Add row</span>
				</button>

				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Delete row"
					onclick={() => run((v) => runTableOp(v, 'deleteRow'))}
				>
					<Rows3Icon size="12" class="text-red-500" />
					<span class="sr-only">Delete row</span>
				</button>

				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Add column after"
					onclick={() => run((v) => runTableOp(v, 'addColumnAfter'))}
				>
					<Columns3Icon size="12" />
					<span class="sr-only">Add column</span>
				</button>

				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Delete column"
					onclick={() => run((v) => runTableOp(v, 'deleteColumn'))}
				>
					<Columns3Icon size="12" class="text-red-500" />
					<span class="sr-only">Delete column</span>
				</button>

				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Delete table"
					onclick={() => run(deleteTable)}
				>
					<Trash2Icon size="12" class="text-red-500" />
					<span class="sr-only">Delete table</span>
				</button>
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
		markdown via the same pipeline as MarkDownPreview (`renderMarkdown`).
		The editor element stays mounted at all times (just hidden when
		not in 'edit') so the collab socket and editor state survive transitions
		without re-init.
	-->
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
				class="prose prose-sm dark:prose-invert max-w-none cursor-text px-1 text-sm leading-normal [&_blockquote]:my-2 [&_blockquote]:text-sm [&_code]:text-xs [&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-lg [&_h2]:mb-1 [&_h2]:mt-2.5 [&_h2]:text-base [&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0 [&_li]:text-sm [&_ol]:my-1.5 [&_p]:my-1.5 [&_p]:text-sm [&_pre]:my-2 [&_pre]:text-xs [&_ul]:my-1.5 {viewMode ===
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
	<IocDetailDialog caseId={Number(caseId)} iocId={iocDialogId} bind:open={iocDialogOpen} />
{/if}

{#if taskDialogId !== null && caseId != null}
	<TaskDetailDialog caseId={Number(caseId)} taskId={taskDialogId} bind:open={taskDialogOpen} />
{/if}

{#if noteDialogId !== null && caseId != null}
	<NoteDetailDialog caseId={Number(caseId)} noteId={noteDialogId} bind:open={noteDialogOpen} />
{/if}

<style>
	/*
	 * Editor shell creates its own stacking context so sticky z-index
	 * values inside stay coherent regardless of what the surrounding
	 * page does. Without `isolation: isolate` the prose content could
	 * paint over the sticky toolbar if an ancestor or the editor's
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

	/* NOTE: the `.mention-chip` layout rules used to live here as `:global()`
	   declarations, which meant they only shipped on pages that imported this
	   component. Chips now also appear in read-only previews on pages with no
	   editor at all (the cases list, comments, alert cards — anywhere
	   `MarkDownPreview` decorates a backend-written chip), so they moved to
	   `src/app.css`. */

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
</style>
