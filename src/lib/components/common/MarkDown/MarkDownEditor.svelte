<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
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
	import { createMentionNode } from './mention-node';
	import { buildSuggestion } from './mentions.svelte';
	import type { MentionItem } from './MentionList.svelte';
	import { UsersService, type User } from '$lib/services/users.service';
	import { CASE_ASSETS_CTX, type CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import { getContext, mount, unmount } from 'svelte';
	import MentionPopover, { type MentionPopoverPayload } from './MentionPopover.svelte';
	import AssetDetailDialog from '../../../../routes/(app)/case/[case_id]/assets/[asset_id]/AssetDetailDialog.svelte';
	import IocDetailDialog from '../../../../routes/(app)/case/[case_id]/iocs/[ioc_id]/IocDetailDialog.svelte';
	import TaskDetailDialog from '../../../../routes/(app)/case/[case_id]/tasks/[task_id]/TaskDetailDialog.svelte';
	import NoteDetailDialog from '../../../../routes/(app)/case/[case_id]/notes/[note_id]/NoteDetailDialog.svelte';

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

	type ViewMode = 'view' | 'edit' | 'edit-preview';
	let viewMode = $state<ViewMode>('view');

	const renderedHtml = $derived(DOMPurify.sanitize(converter.makeHtml(value ?? '')));

	const enterEdit = async () => {
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

	let usersCache: User[] | null = null;
	let usersPromise: Promise<User[]> | null = null;

	const loadUsers = async (): Promise<User[]> => {
		if (usersCache) return usersCache;
		if (!usersPromise) {
			usersPromise = (async () => {
				// /manage/users/list returns the legacy IRIS wrapper
				//   { status, message, data: User[] }
				// nested inside our RequestResponse.data — same indirection every
				// other caller in the app uses.
				const res = await UsersService.list();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const inner = (res?.data as any)?.data;
				if (Array.isArray(inner)) {
					usersCache = inner as User[];
					return usersCache;
				}
				if (Array.isArray(res?.data)) {
					usersCache = res.data as User[];
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
			ensureTasksLoaded()
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
					['asset', 'ioc', 'note', 'task']
				)
			],
			content: normalizeLegacyContent(value ?? ''),
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
		closePopover();
		disconnectSocket();
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
				role="textbox"
				tabindex="0"
				ondblclick={enterEdit}
				class="prose prose-sm dark:prose-invert max-w-none cursor-text px-1 text-sm leading-normal [&_p]:my-1.5 [&_p]:text-sm [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h2]:text-base [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0 [&_li]:text-sm [&_blockquote]:my-2 [&_blockquote]:text-sm [&_pre]:my-2 [&_pre]:text-xs [&_code]:text-xs {viewMode ===
				'edit-preview'
					? 'rounded-md border border-border/50 bg-background p-3'
					: ''}"
			>
				{#if (value ?? '').trim().length === 0}
					<p class="italic text-muted-foreground">
						{viewMode === 'edit-preview' ? 'Nothing to preview yet.' : 'Double-click to edit…'}
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
</style>
