<!--
  War-room chat. Slack-ish stream: bubbles for operator messages,
  inline system rows for activity. A composer with an attachments
  popover that lets the operator paste a reference to an event / IOC /
  asset / task from any of the war-room's attached cases without
  leaving the chat — the picker reads the existing case sub-resource
  APIs (no new backend) and inserts a markdown stub the chat renders.
-->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		AlertCircle,
		AlertOctagon,
		BarChart3,
		Bell,
		ChevronDown,
		ChevronRight,
		ClockIcon,
		FileText,
		Filter,
		Gavel,
		Loader2,
		MessageSquare,
		Paperclip,
		Pin,
		PinOff,
		ListChecks,
		Search,
		Send,
		Slash,
		SmilePlus,
		Trash2,
		Waypoints,
		WaypointsIcon,
		X
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import * as Popover from '$lib/components/ui/popover';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import ChatMessageBody from './components/ChatMessageBody.svelte';
	import ChatComposerMentions from './components/ChatComposerMentions.svelte';
	import AttachmentPreviewDialog, {
		type AttachmentTarget
	} from './components/AttachmentPreviewDialog.svelte';
	import StreamRefCard from './components/StreamRefCard.svelte';
	import WarRoomThreadPane from './components/WarRoomThreadPane.svelte';
	import MessageReactions from './components/MessageReactions.svelte';
	import PollCard from './components/PollCard.svelte';
	import PollComposer from './components/PollComposer.svelte';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatMessageKind,
		type ChatPoll,
		type ChatThreadRoot
	} from '$lib/services/war-room-chat.service';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { current_user } from '$lib/stores/auth.store';
	import { UsersService } from '$lib/services/users.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let messages = $state<ChatMessage[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let exhausted = $state(false);
	let body = $state('');
	let sending = $state(false);
	let composerEl: HTMLTextAreaElement | null = $state(null);
	let listEl: HTMLDivElement | null = $state(null);

	// --- Stream filter model ---------------------------------------------
	//
	// The Stream tab shows every kind of war-room event: operator
	// messages, war-room-level system rows, and the firehose of case
	// activity mirrored from every attached case. The filter pane lets
	// the operator turn each lane off individually:
	//
	//   * `globalFilters` controls the non-case-activity kinds via a
	//     single set of opt-in keys (Messages, Tasks, SitReps, Notes,
	//     System, Case attached/detached).
	//
	//   * `excludedCases` opts an entire case out of the stream — useful
	//     when a quiet case is generating noise during a triage.
	//
	//   * `excludedCaseActivities` opts specific activity types out per
	//     case (so the operator can mute "note.updated" on Case #12 but
	//     keep seeing IOC events on it).
	//
	// Default state: everything on. Exclusions are opt-out, additions are
	// noticed automatically — a case attached later simply starts
	// streaming.

	const GLOBAL_FILTERS = [
		{ key: 'message', label: 'Messages', kinds: ['message'] as const },
		{ key: 'tasks', label: 'Tasks', kinds: ['task_assigned', 'task_completed'] as const },
		{ key: 'sitreps', label: 'SitReps', kinds: ['sitrep_published'] as const },
		{ key: 'notes', label: 'Notes / Pins', kinds: ['note', 'pin'] as const },
		{ key: 'system', label: 'System', kinds: ['system'] as const },
		{
			key: 'case_link',
			label: 'Case attached / detached',
			kinds: ['case_attached', 'case_detached'] as const
		}
	];

	let globalFilters = $state<Set<string>>(
		new Set(GLOBAL_FILTERS.map((f) => f.key))
	);

	// Per-case exclusions. Empty by default — operator opts out.
	let excludedCases = $state<Set<number>>(new Set());
	let excludedCaseActivities = $state<Record<number, Set<string>>>({});

	// --- Persistent filter preferences ----------------------------------
	//
	// One preference bag per user, keyed as `war_room_stream`, applies
	// across every war room they open. Loaded once on mount from the
	// server; saved with a debounce whenever the operator flips a
	// toggle. Sets aren't JSON — we serialize them as arrays and
	// rehydrate back into Sets on read. The `filtersHydrated` gate
	// stops us from persisting the initial-render defaults before the
	// server round-trip finishes, which would race the server-side
	// preference back to defaults.
	type StreamPrefs = {
		globalFilters: string[];
		excludedCases: number[];
		excludedCaseActivities: Record<string, string[]>;
	};
	const STREAM_PREF_KEY = 'war_room_stream';
	let filtersHydrated = $state(false);
	let savePrefTimer: ReturnType<typeof setTimeout> | null = null;

	const loadFilterPrefs = async () => {
		try {
			const res = await UsersService.getMyPreference<StreamPrefs>(STREAM_PREF_KEY);
			if (res.ok && res.data && typeof res.data !== 'string') {
				const value = (res.data as { value: StreamPrefs | null }).value;
				if (value && typeof value === 'object') {
					if (Array.isArray(value.globalFilters)) {
						globalFilters = new Set(value.globalFilters);
					}
					if (Array.isArray(value.excludedCases)) {
						excludedCases = new Set(value.excludedCases);
					}
					if (value.excludedCaseActivities && typeof value.excludedCaseActivities === 'object') {
						const next: Record<number, Set<string>> = {};
						for (const [k, v] of Object.entries(value.excludedCaseActivities)) {
							const caseId = Number(k);
							if (Number.isFinite(caseId) && Array.isArray(v)) {
								next[caseId] = new Set(v);
							}
						}
						excludedCaseActivities = next;
					}
				}
			}
		} finally {
			filtersHydrated = true;
		}
	};

	const saveFilterPrefsNow = async () => {
		const payload: StreamPrefs = {
			globalFilters: Array.from(globalFilters),
			excludedCases: Array.from(excludedCases),
			excludedCaseActivities: Object.fromEntries(
				Object.entries(excludedCaseActivities).map(([k, v]) => [k, Array.from(v)])
			)
		};
		await UsersService.setMyPreference(STREAM_PREF_KEY, payload);
	};

	// Every relevant state change schedules a save 500ms later. That
	// coalesces bursts (e.g. toggling several checkboxes in a row) into
	// a single PUT while still feeling responsive if the operator moves
	// on. The `$effect` reads all three states so any of them changing
	// arms the timer.
	$effect(() => {
		void globalFilters;
		void excludedCases;
		void excludedCaseActivities;
		if (!filtersHydrated) return;
		if (savePrefTimer) clearTimeout(savePrefTimer);
		savePrefTimer = setTimeout(() => {
			void saveFilterPrefsNow();
		}, 500);
	});

	// Grouped activity types. Categories collapse the 27 flat checkboxes
	// from earlier into 8 expandable groups so the sidebar stays compact
	// without losing granularity. Each group has its own checkbox: ticking
	// it toggles every slug in the group at once; the parent shows an
	// indeterminate state when some — but not all — child slugs are on.
	const ACTIVITY_GROUPS: { key: string; label: string; slugs: { slug: string; label: string }[] }[] = [
		{
			key: 'notes',
			label: 'Notes',
			slugs: [
				{ slug: 'note.created', label: 'Created' },
				{ slug: 'note.updated', label: 'Updated' },
				{ slug: 'note.deleted', label: 'Deleted' },
				{ slug: 'directory.created', label: 'Folder created' },
				{ slug: 'directory.updated', label: 'Folder updated' },
				{ slug: 'directory.deleted', label: 'Folder deleted' }
			]
		},
		{
			key: 'iocs',
			label: 'IOCs',
			slugs: [
				{ slug: 'ioc.created', label: 'Created' },
				{ slug: 'ioc.updated', label: 'Updated' },
				{ slug: 'ioc.deleted', label: 'Deleted' }
			]
		},
		{
			key: 'assets',
			label: 'Assets',
			slugs: [
				{ slug: 'asset.created', label: 'Created' },
				{ slug: 'asset.updated', label: 'Updated' },
				{ slug: 'asset.deleted', label: 'Deleted' }
			]
		},
		{
			key: 'evidence',
			label: 'Evidence',
			slugs: [
				{ slug: 'evidence.created', label: 'Added' },
				{ slug: 'evidence.updated', label: 'Updated' },
				{ slug: 'evidence.deleted', label: 'Deleted' }
			]
		},
		{
			key: 'tasks',
			label: 'Tasks',
			slugs: [
				{ slug: 'task.created', label: 'Added' },
				{ slug: 'task.updated', label: 'Updated' },
				{ slug: 'task.deleted', label: 'Deleted' }
			]
		},
		{
			key: 'events',
			label: 'Timeline events',
			slugs: [
				{ slug: 'event.created', label: 'Added' },
				{ slug: 'event.updated', label: 'Updated' },
				{ slug: 'event.deleted', label: 'Deleted' }
			]
		},
		{
			key: 'case',
			label: 'Case lifecycle',
			slugs: [
				{ slug: 'case.created', label: 'Created' },
				{ slug: 'case.closed', label: 'Closed' },
				{ slug: 'case.reopened', label: 'Re-opened' },
				{ slug: 'case.updated', label: 'Updated' },
				{ slug: 'case.reviewer_changed', label: 'Reviewer changed' },
				{ slug: 'alert.linked', label: 'Alert linked / unlinked' }
			]
		},
		{
			key: 'other',
			label: 'Other',
			slugs: [{ slug: 'case.other', label: 'Uncategorised' }]
		}
	];

	// Flat list of all known slugs — used by `selectNone`-style bulk ops
	// and by the bookkeeping when an entire case is muted.
	const ALL_ACTIVITY_SLUGS = ACTIVITY_GROUPS.flatMap((g) =>
		g.slugs.map((s) => s.slug)
	);

	const globalKeyForKind = (k: ChatMessageKind): string | null => {
		for (const f of GLOBAL_FILTERS) {
			if ((f.kinds as readonly string[]).includes(k)) return f.key;
		}
		return null;
	};

	const visibleMessages = $derived.by(() =>
		messages.filter((m) => {
			if (m.deleted_at) return false;

			// Case activity: gated by per-case + per-type exclusions.
			if (m.kind === 'case_activity') {
				if (m.ref_case_id == null) return true;
				if (excludedCases.has(m.ref_case_id)) return false;
				const slug = m.activity_type ?? 'case.other';
				const set = excludedCaseActivities[m.ref_case_id];
				if (set && set.has(slug)) return false;
				return true;
			}

			// Case attached / detached are case-scoped too — let the
			// operator mute a specific case across all event types.
			if (m.kind === 'case_attached' || m.kind === 'case_detached') {
				if (m.ref_case_id != null && excludedCases.has(m.ref_case_id)) {
					return false;
				}
				return globalFilters.has('case_link');
			}

			// Everything else is gated by the global toggles.
			const key = globalKeyForKind(m.kind);
			return key ? globalFilters.has(key) : true;
		})
	);

	const toggleGlobal = (key: string) => {
		const next = new Set(globalFilters);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		globalFilters = next;
	};

	const toggleCase = (caseId: number) => {
		const next = new Set(excludedCases);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		excludedCases = next;
	};

	const toggleCaseActivity = (caseId: number, slug: string) => {
		const current = excludedCaseActivities[caseId] ?? new Set<string>();
		const next = new Set(current);
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		excludedCaseActivities = { ...excludedCaseActivities, [caseId]: next };
	};

	const isCaseActivityOn = (caseId: number, slug: string) =>
		!(excludedCaseActivities[caseId]?.has(slug) ?? false);

	const isCaseOn = (caseId: number) => !excludedCases.has(caseId);

	const selectAll = () => {
		globalFilters = new Set(GLOBAL_FILTERS.map((f) => f.key));
		excludedCases = new Set();
		excludedCaseActivities = {};
	};

	const selectNone = () => {
		globalFilters = new Set();
		excludedCases = new Set(attachedCases.map((c) => c.case_id));
	};

	// Slash-commands reference is low-signal once the operator knows the
	// vocabulary — fold by default so it doesn't push Threads / Cases
	// content off the bottom of the sidebar. Click the header to reveal.
	let slashOpen = $state(false);

	// Per-case section expansion (collapsed by default — keeps the pane
	// short when many cases are attached).
	let caseSectionsOpen = $state<Record<number, boolean>>({});
	const toggleCaseSection = (caseId: number) => {
		caseSectionsOpen = {
			...caseSectionsOpen,
			[caseId]: !(caseSectionsOpen[caseId] ?? false)
		};
	};

	// Per-(case, group) expansion. Stored under a composite key so we
	// don't have to reset state when the operator switches cases.
	let groupSectionsOpen = $state<Record<string, boolean>>({});
	const groupKey = (caseId: number, groupKey: string) =>
		`${caseId}:${groupKey}`;
	const toggleGroupSection = (caseId: number, gk: string) => {
		const k = groupKey(caseId, gk);
		groupSectionsOpen = { ...groupSectionsOpen, [k]: !groupSectionsOpen[k] };
	};

	// Aggregate state for a group's parent checkbox: 'all' (every slug on),
	// 'none' (every slug off) or 'some' (mixed — renders as indeterminate).
	const groupState = (
		caseId: number,
		group: (typeof ACTIVITY_GROUPS)[number]
	): 'all' | 'none' | 'some' => {
		const excluded = excludedCaseActivities[caseId] ?? new Set<string>();
		const onCount = group.slugs.filter((s) => !excluded.has(s.slug)).length;
		if (onCount === 0) return 'none';
		if (onCount === group.slugs.length) return 'all';
		return 'some';
	};

	const toggleGroup = (
		caseId: number,
		group: (typeof ACTIVITY_GROUPS)[number]
	) => {
		const current = excludedCaseActivities[caseId] ?? new Set<string>();
		const next = new Set(current);
		const state = groupState(caseId, group);
		// Mixed and all-on collapse to all-off; all-off expands to all-on.
		// Mirrors the "click an indeterminate checkbox to clear" behaviour
		// from native tri-state controls.
		const wantOn = state === 'none';
		for (const s of group.slugs) {
			if (wantOn) next.delete(s.slug);
			else next.add(s.slug);
		}
		excludedCaseActivities = { ...excludedCaseActivities, [caseId]: next };
	};

	// Attached cases drive the attachments picker (events / IOCs / assets
	// / tasks come from these).
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	const loadAttachedCases = async () => {
		const res = await WarRoomsService.listCases(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			attachedCases = res.data;
		}
	};

	const scrollToBottom = async () => {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	};

	// Top-of-stream quick-filter. Free text is sent to the server as a
	// `search` param on every list call so filtering doesn't rely on
	// how much has been paged into memory — a match from six weeks ago
	// shows up as long as it's in the DB.
	let streamSearch = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	// Snapshot the actively-applied search string so poll / loadOlder
	// keep using the same needle even if the user is mid-typing when
	// a poll tick fires.
	let appliedSearch = $state('');

	const load = async () => {
		loading = true;
		const search = appliedSearch || undefined;
		const res = await WarRoomChatService.list(warRoomId, { limit: 80, search });
		if (res.ok && Array.isArray(res.data)) {
			messages = [...res.data].reverse();
			if (res.data.length < 80) exhausted = true;
			else exhausted = false;
		}
		loading = false;
		scrollToBottom();
	};

	const loadOlder = async () => {
		if (loadingMore || exhausted || messages.length === 0) return;
		loadingMore = true;
		const before = messages[0].message_id;
		const search = appliedSearch || undefined;
		const res = await WarRoomChatService.list(warRoomId, {
			before,
			limit: 80,
			search
		});
		loadingMore = false;
		if (res.ok && Array.isArray(res.data)) {
			if (res.data.length === 0) {
				exhausted = true;
				return;
			}
			const prevHeight = listEl?.scrollHeight ?? 0;
			const prevTop = listEl?.scrollTop ?? 0;
			messages = [...[...res.data].reverse(), ...messages];
			await tick();
			if (listEl) {
				const delta = listEl.scrollHeight - prevHeight;
				listEl.scrollTop = prevTop + delta;
			}
			if (res.data.length < 80) exhausted = true;
		}
	};

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	const messageKey = (m: ChatMessage) =>
		// Live-merged stream mixes real chat ids (positive) and virtual
		// UserActivity ids (negative) — `message_id` alone isn't ordered
		// across both. We dedupe on (message_id, created_at) instead so
		// the poll never appends a row we already have.
		`${m.message_id}:${m.created_at ?? ''}`;

	const pollNewer = async () => {
		if (messages.length === 0) return load();
		const seen = new Set(messages.map(messageKey));
		const search = appliedSearch || undefined;
		const res = await WarRoomChatService.list(warRoomId, { limit: 50, search });
		if (res.ok && Array.isArray(res.data)) {
			const fresh = (res.data as ChatMessage[]).filter(
				(m) => !seen.has(messageKey(m))
			);
			if (fresh.length > 0) {
				const wasAtBottom =
					listEl != null &&
					listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
				// Newest first from the API; reverse so the resulting array
				// stays chronologically ordered (oldest at top).
				messages = [...messages, ...[...fresh].reverse()];
				if (wasAtBottom) scrollToBottom();
			}
		}
	};

	// Debounced apply — 250ms after the operator stops typing, we
	// promote the input into `appliedSearch` and reload the stream.
	// Same feel as the topbar global search's debounce.
	const scheduleStreamSearch = () => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			const next = streamSearch.trim();
			if (next === appliedSearch) return;
			appliedSearch = next;
			exhausted = false;
			messages = [];
			void load();
		}, 250);
	};

	const clearStreamSearch = () => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		streamSearch = '';
		if (appliedSearch !== '') {
			appliedSearch = '';
			exhausted = false;
			messages = [];
			void load();
		}
	};

	onMount(() => {
		// Hydrate filter prefs before the first paint so the sidebar
		// renders with the operator's saved selection rather than the
		// "everything on" defaults. `void`d intentionally: the load
		// helpers below don't depend on prefs, they'll rerender when
		// the filters settle.
		void loadFilterPrefs();
		void load();
		void loadAttachedCases();
		void loadThreads();
		void loadTraceLog();
		pollTimer = setInterval(() => {
			void pollNewer();
			void loadThreads();
			void loadTraceLog();
		}, 4000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	// Used by the per-bubble delete affordance to decide whether to render
	// the Trash button. Server-side enforcement is the source of truth
	// (the DELETE endpoint rejects anything but the author), but hiding
	// the button for non-authors keeps the UI honest.
	const currentUserId = $derived(($current_user?.user_id ?? null) as number | null);

	// Shared confirmation dialog state — one modal handles every
	// "are you sure?" on this page (delete a message, delete a
	// decision/pin from the trace log). Each call site stashes the
	// copy + the action to run; the dialog closes itself and fires
	// the closure via `onConfirm`.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmActionText = $state('Delete');
	let pendingAction: (() => Promise<void>) | null = null;

	const askConfirm = (opts: {
		title: string;
		message: string;
		actionText?: string;
		run: () => Promise<void>;
	}) => {
		confirmTitle = opts.title;
		confirmMessage = opts.message;
		confirmActionText = opts.actionText ?? 'Delete';
		pendingAction = opts.run;
		confirmOpen = true;
	};

	const runConfirmed = () => {
		const action = pendingAction;
		pendingAction = null;
		if (action) void action();
	};

	const doRemoveMessage = async (messageId: number) => {
		const res = await WarRoomChatService.remove(warRoomId, messageId);
		if (res.ok) {
			// Mirror the server's soft-delete: stamp deleted_at locally so
			// the existing `.filter((m) => m.deleted_at)` in visibleMessages
			// drops it without waiting for the next poll.
			messages = messages.map((x) =>
				x.message_id === messageId
					? { ...x, deleted_at: new Date().toISOString(), body: null }
					: x
			);
			// If the deleted row was a trace-worthy kind, drop it from the
			// sidebar index too instead of waiting for the next poll —
			// otherwise the operator would keep seeing an entry they just
			// removed. The next poll would reconcile anyway; this is just
			// for immediacy.
			traceLog = traceLog.filter((t) => t.message_id !== messageId);
		} else {
			toast({
				title: 'Could not delete message',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	const removeMessage = (m: ChatMessage) => {
		askConfirm({
			title: 'Delete this message?',
			message: 'It will be hidden from the stream. This can\'t be undone.',
			run: () => doRemoveMessage(m.message_id)
		});
	};

	// Sidebar delete for decisions / pins / notes. Same soft-delete on
	// the server; the trace log's own row disappears from the
	// filteredTraceLog once the local `traceLog` is patched.
	const removeTraceEntry = (t: ChatMessage) => {
		const label =
			t.kind === 'decision'
				? 'decision'
				: t.kind === 'pin'
					? 'pin'
					: t.is_pinned
						? 'pinned message'
						: 'note';
		askConfirm({
			title: `Delete this ${label}?`,
			message:
				`It will be removed from the stream and the Decisions & Pins index. ` +
				`This can't be undone.`,
			run: () => doRemoveMessage(t.message_id)
		});
	};

	// Toggle the caller's reaction on `emoji` for `messageId`. The
	// backend handler is idempotent — same emoji from the same user
	// adds it if absent, removes it otherwise. We optimistically patch
	// the local `reactions` array so the pill updates instantly; the
	// next poll (or refetch) reconciles the count if the server saw a
	// concurrent write.
	const toggleReaction = async (messageId: number, emoji: string) => {
		if (currentUserId == null) return;
		const idx = messages.findIndex((m) => m.message_id === messageId);
		if (idx < 0) return;
		const msg = messages[idx];
		const existing = (msg.reactions ?? []).find((r) => r.emoji === emoji);
		const mine = existing?.user_ids.includes(currentUserId) ?? false;

		const nextReactions = [...(msg.reactions ?? [])];
		if (existing) {
			const rIdx = nextReactions.findIndex((r) => r.emoji === emoji);
			if (mine) {
				const nextUsers = existing.user_ids.filter((u) => u !== currentUserId);
				if (nextUsers.length === 0) {
					nextReactions.splice(rIdx, 1);
				} else {
					nextReactions[rIdx] = {
						...existing,
						count: nextUsers.length,
						user_ids: nextUsers
					};
				}
			} else {
				nextReactions[rIdx] = {
					...existing,
					count: existing.count + 1,
					user_ids: [...existing.user_ids, currentUserId]
				};
			}
		} else {
			nextReactions.push({ emoji, count: 1, user_ids: [currentUserId] });
		}
		messages[idx] = { ...msg, reactions: nextReactions };

		const res = await WarRoomChatService.toggleReaction(warRoomId, messageId, emoji);
		if (!res.ok) {
			// Revert the optimistic patch — swap the message back to its
			// pre-click state so the user sees a truthful count.
			messages[idx] = msg;
			toast({
				title: 'Could not save reaction',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// Poll composer state. `pollComposerOpen` toggles the modal;
	// `submitPoll` bridges the composer's payload to the REST layer
	// and returns a boolean so the modal can decide whether to
	// dismiss on success.
	let pollComposerOpen = $state(false);

	const submitPoll = async (body: {
		question: string;
		options: string[];
		is_multi_select: boolean;
		is_anonymous: boolean;
		closes_at: string | null;
	}): Promise<boolean> => {
		const res = await WarRoomChatService.createPoll(warRoomId, body);
		if (res.ok) {
			// A companion `kind='poll'` chat message was created on the
			// server; grabbing the newest page picks it up and inlines
			// its poll state so the stream can render the card right away.
			await pollNewer();
			scrollToBottom();
			return true;
		}
		toast({
			title: 'Could not create poll',
			description:
				typeof res.data === 'string'
					? res.data
					: ((res.data as { message?: string } | null)?.message ??
						res.error?.message ??
						'Unknown error'),
			variant: 'destructive'
		});
		return false;
	};

	// Cast the caller's votes for a poll living at `messageId`. We
	// optimistically patch the inlined poll state so the card
	// re-renders instantly, then refetch the authoritative state on
	// success to reconcile tallies (other users may have voted
	// concurrently).
	const voteOnPoll = async (messageId: number, optionIds: number[]) => {
		const idx = messages.findIndex((m) => m.message_id === messageId);
		if (idx < 0) return;
		const msg = messages[idx];
		if (!msg.poll) return;
		const pollId = msg.poll.poll_id;
		const res = await WarRoomChatService.voteOnPoll(warRoomId, pollId, optionIds);
		if (res.ok && res.data) {
			messages[idx] = { ...msg, poll: res.data as ChatPoll };
		} else {
			toast({
				title: 'Could not save vote',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	const closePoll = async (messageId: number) => {
		const idx = messages.findIndex((m) => m.message_id === messageId);
		if (idx < 0) return;
		const msg = messages[idx];
		if (!msg.poll) return;
		const res = await WarRoomChatService.closePoll(warRoomId, msg.poll.poll_id);
		if (res.ok && res.data) {
			messages[idx] = { ...msg, poll: res.data as ChatPoll };
		} else {
			toast({
				title: 'Could not close poll',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// Toggle the sticky pin on a message. Backend enforces war-room
	// write. Optimistically flips `is_pinned` locally; the trace-log
	// poll picks up the row (or drops it) within a tick.
	const togglePin = async (m: ChatMessage) => {
		const idx = messages.findIndex((x) => x.message_id === m.message_id);
		if (idx < 0) return;
		const before = messages[idx];
		const next = !before.is_pinned;
		messages[idx] = { ...before, is_pinned: next };
		const res = await WarRoomChatService.setMessagePin(warRoomId, m.message_id, next);
		if (!res.ok) {
			messages[idx] = before;
			toast({
				title: next ? 'Could not pin message' : 'Could not unpin message',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
			return;
		}
		void loadTraceLog();
	};

	const send = async () => {
		const text = body.trim();
		if (!text) return;
		sending = true;
		const res = await WarRoomChatService.post(warRoomId, text);
		sending = false;
		if (res.ok) {
			body = '';
			await pollNewer();
			void loadThreads();
			void loadTraceLog();
			scrollToBottom();
			composerEl?.focus();
		} else {
			toast({
				title: 'Could not send message',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// The mention component owns Up/Down/Enter/Esc when its popup is
	// open — we hand the event over first and only fall through to the
	// default Enter-sends behaviour when the mention picker didn't claim
	// the key.
	let mentions = $state<{
		handleKeydown: (e: KeyboardEvent) => boolean;
		handleInput: () => void;
	} | null>(null);

	const onKey = (e: KeyboardEvent) => {
		if (mentions?.handleKeydown(e)) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	};

	const onInput = (e: Event) => {
		body = (e.target as HTMLTextAreaElement).value;
		mentions?.handleInput();
	};

	// Attachment preview state. The chip click fires `onAttachmentClick`
	// with `{type, label, href}` and we extract the caseId from the href
	// (`/case/<id>/<sub>`) so the preview modal can fetch directly.
	let previewOpen = $state(false);
	let previewTarget = $state<AttachmentTarget | null>(null);

	const openPreview = (t: {
		type: 'event' | 'ioc' | 'asset' | 'task';
		label: string;
		href: string;
	}) => {
		const m = t.href.match(/^\/case\/(\d+)\//);
		if (!m) {
			window.location.assign(t.href);
			return;
		}
		previewTarget = {
			kind: t.type,
			caseId: Number(m[1]),
			label: t.label
		};
		previewOpen = true;
	};

	const SLASH_COMMANDS = [
		{ cmd: '/note', desc: 'Pin a quick note' },
		{ cmd: '/pin', desc: 'Highlight a message' },
		{ cmd: '/decision', desc: 'Log a command decision' },
		{ cmd: '/attach <case_id>', desc: 'Attach a case' },
		{ cmd: '/detach <case_id>', desc: 'Detach a case' },
		{ cmd: '/task [@user] <title>', desc: 'Create a task' },
		{ cmd: '/assign @user <title>', desc: 'Create + assign a task' },
		{ cmd: '/sitrep <title>', desc: 'Start a SitRep draft' },
		{ cmd: '/summary', desc: 'Auto-fill SitRep from snapshot' },
		{ cmd: '/state <…>', desc: 'Flip war-room state' },
		{ cmd: '/priority <…>', desc: 'Stamp a priority banner' },
		{ cmd: '/thread <title>', desc: 'Open a named topic' }
	];

	// --- Threads ---------------------------------------------------------
	//
	// The threads sidebar pulls `/chat/threads` — roots that have either
	// at least one reply or a named title. Clicking a thread opens the
	// side-pane on the right of the stream.
	//
	// Refreshes piggy-back on the existing chat poll: every 4s we also
	// re-fetch the threads list so reply counts and last-activity stay
	// fresh while the operator is looking at the page.

	let threads = $state<ChatThreadRoot[]>([]);
	let openThread = $state<ChatThreadRoot | null>(null);

	// Fields that actually change over time on a thread root; used to
	// decide whether the currently-open thread's props need to be
	// reassigned. Without this check, every poll (~4s) reassigns
	// `openThread` to a fresh object even when nothing changed — which
	// re-triggers the pane's `$effect` and blanks the visible reply
	// list into a "Loading replies…" spinner. That's what the operator
	// sees as a constant "refresh flicker".
	const threadChanged = (a: ChatThreadRoot, b: ChatThreadRoot) =>
		a.reply_count !== b.reply_count ||
		a.last_activity_at !== b.last_activity_at ||
		a.thread_title !== b.thread_title ||
		a.is_followed !== b.is_followed ||
		a.deleted_at !== b.deleted_at;

	const loadThreads = async () => {
		const res = await WarRoomChatService.listThreads(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			threads = res.data as ChatThreadRoot[];
			// Keep the currently open thread's badge state in sync — but
			// only reassign if the row *actually* changed. Otherwise the
			// pane's $effect fires on every no-op poll and blanks the
			// reply list.
			if (openThread) {
				const updated = threads.find((t) => t.message_id === openThread!.message_id);
				if (updated && threadChanged(openThread, updated)) {
					openThread = updated;
				}
			}
		}
	};

	const openThreadFor = async (messageId: number) => {
		// First check the threads list — if the message is already a root
		// there, we can open immediately.
		const existing = threads.find((t) => t.message_id === messageId);
		if (existing) {
			openThread = existing;
			return;
		}
		// Otherwise we need to materialise a synthetic root from the
		// message data we have, then re-fetch the threads list so the new
		// thread shows up in the sidebar after the first reply lands.
		const m = messages.find((x) => x.message_id === messageId);
		if (!m) return;
		openThread = {
			message_id: m.message_id,
			thread_title: m.thread_title,
			preview: (m.body ?? '').slice(0, 200) || null,
			kind: m.kind,
			author_id: m.author_id,
			author_login: m.author_login,
			author_name: m.author_name,
			reply_count: 0,
			last_activity_at: m.created_at,
			created_at: m.created_at,
			deleted_at: m.deleted_at,
			is_followed: false
		};
	};

	const closeThread = () => {
		openThread = null;
	};

	// --- Decisions & Pins sidebar index --------------------------------
	//
	// A time-ordered "who decided what and when" surface. Pulls
	// `/chat/trace-log` which returns every decision / pin / note in the
	// war room — including replies inside threads, which the main
	// stream listing hides. Refreshes on the same 4s cadence as the
	// stream and threads.
	let traceLog = $state<ChatMessage[]>([]);
	let traceFilter = $state('');

	const loadTraceLog = async () => {
		const res = await WarRoomChatService.listTraceLog(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			traceLog = res.data as ChatMessage[];
		}
	};

	// Filter matches body text, kind label, or author. Case-insensitive.
	// Empty needle short-circuits to avoid re-allocating the array on
	// every render while nothing's typed.
	const filteredTraceLog = $derived.by(() => {
		const needle = traceFilter.trim().toLowerCase();
		if (!needle) return traceLog;
		return traceLog.filter((t) => {
			const body = (t.body ?? '').toLowerCase();
			const kind = (t.kind ?? '').toLowerCase();
			const author = (t.author_name ?? t.author_login ?? '').toLowerCase();
			return body.includes(needle) || kind.includes(needle) || author.includes(needle);
		});
	});

	// Jump to a trace entry: if it's a reply, open the thread pane so
	// the entry is visible in-context; otherwise scroll the main
	// stream to that row and highlight it briefly.
	let highlightMessageId = $state<number | null>(null);
	const jumpToTrace = async (m: ChatMessage) => {
		if (m.parent_message_id != null) {
			await openThreadFor(m.parent_message_id);
			return;
		}
		const target = listEl?.querySelector(
			`[data-message-id="${m.message_id}"]`
		) as HTMLElement | null;
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
			highlightMessageId = m.message_id;
			// Clear the highlight after a moment so it doesn't stick if the
			// user scrolls elsewhere.
			setTimeout(() => {
				if (highlightMessageId === m.message_id) highlightMessageId = null;
			}, 1600);
		} else {
			// The row isn't currently paged in — nudge the operator to
			// scroll back. Cheap and honest; no jarring silent no-op.
			toast({
				title: 'Message not loaded',
				description: 'Scroll back with "Load earlier messages" to find it.',
				variant: 'warning'
			});
		}
	};

	// Trace-log row metadata. Pinned regular messages (`kind='message'`,
	// `is_pinned=true`) are surfaced in the same sidebar as decisions
	// and system pins — the backend widens the query, we just need to
	// paint them with the pin icon since their kind is still 'message'.
	const traceRowMeta = (t: ChatMessage) => {
		if (t.kind === 'decision')
			return { Icon: Gavel, color: 'text-indigo-600 dark:text-indigo-400', label: 'Decision' };
		if (t.kind === 'pin')
			return { Icon: Pin, color: 'text-violet-600 dark:text-violet-400', label: 'Pin' };
		if (t.is_pinned)
			return { Icon: Pin, color: 'text-primary', label: 'Pinned' };
		return { Icon: Pin, color: 'text-violet-500 dark:text-violet-300', label: 'Note' };
	};

	const stripMarkdown = (s: string) =>
		s
			// Drop `[label](href)` down to `label` so the preview reads
			// clean; keeps the human-authored text but hides the link
			// noise a `/decision` mentioning an attachment would carry.
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/\s+/g, ' ')
			.trim();

	// Cheap lookup so the per-message Reply chip can show "N replies"
	// without scanning the threads list each render.
	const replyCountByRoot = $derived(
		new Map(threads.map((t) => [t.message_id, t.reply_count]))
	);

	// --- Attachments picker --------------------------------------------------
	// One picker covers four resource types pulled from the attached
	// cases. We pre-load per case on first open to avoid a flash of
	// loading state when the user switches the inner tab.

	type ResourceKind = 'event' | 'ioc' | 'asset' | 'task';

	let attachOpen = $state(false);
	let attachKind = $state<ResourceKind>('event');
	let attachCaseId = $state<number | null>(null);
	let attachSearch = $state('');
	let attachLoading = $state(false);

	type Picker = { id: number; label: string; sub?: string; caseId: number };
	let pickerRows = $state<Picker[]>([]);

	$effect(() => {
		if (attachOpen && attachCaseId == null && attachedCases.length > 0) {
			attachCaseId = attachedCases[0].case_id;
		}
	});

	$effect(() => {
		if (!attachOpen || attachCaseId == null) return;
		// Re-run when kind or selected case change. The fetch is cheap
		// because it pages the v2 endpoint at 25 rows max for the picker.
		void loadPickerRows();
	});

	const loadPickerRows = async () => {
		if (attachCaseId == null) return;
		attachLoading = true;
		pickerRows = [];
		const caseId = attachCaseId;
		try {
			if (attachKind === 'event') {
				const res = await CaseTimelineService.listEvents(caseId, {}, {}, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as { timeline?: Array<Record<string, unknown>> };
					pickerRows = (payload.timeline ?? []).map((e) => ({
						id: Number((e as { event_id: number }).event_id),
						label:
							String((e as { event_title?: string }).event_title ?? '') ||
							`Event #${(e as { event_id: number }).event_id}`,
						sub:
							typeof (e as { event_date?: string }).event_date === 'string'
								? new Date((e as { event_date: string }).event_date).toLocaleString()
								: undefined,
						caseId
					}));
				}
			} else if (attachKind === 'ioc') {
				const res = await CaseIocsService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((i) => ({
						id: Number((i as { ioc_id: number }).ioc_id),
						label: String((i as { ioc_value?: string }).ioc_value ?? '') || `IOC #${(i as { ioc_id: number }).ioc_id}`,
						sub: String((i as { ioc_type?: string }).ioc_type ?? ''),
						caseId
					}));
				}
			} else if (attachKind === 'asset') {
				const res = await CaseAssetsService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((a) => ({
						id: Number((a as { asset_id: number }).asset_id),
						label:
							String((a as { asset_name?: string }).asset_name ?? '') ||
							`Asset #${(a as { asset_id: number }).asset_id}`,
						sub: String((a as { asset_type_name?: string }).asset_type_name ?? ''),
						caseId
					}));
				}
			} else if (attachKind === 'task') {
				const res = await CaseTasksService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((t) => ({
						id: Number((t as { id: number }).id ?? (t as { task_id?: number }).task_id ?? 0),
						label:
							String((t as { task_title?: string }).task_title ?? '') ||
							`Task #${(t as { id: number }).id}`,
						caseId
					}));
				}
			}
		} finally {
			attachLoading = false;
		}
	};

	const filteredPickerRows = $derived.by(() => {
		const needle = attachSearch.trim().toLowerCase();
		if (!needle) return pickerRows;
		return pickerRows.filter(
			(r) =>
				r.label.toLowerCase().includes(needle) ||
				(r.sub ?? '').toLowerCase().includes(needle)
		);
	});

	const insertAttachment = (row: Picker) => {
		// Append a markdown reference into the composer. The chat
		// itself doesn't try to live-render these (the rest of the
		// stream is plain text), but the link is clickable and the
		// human-readable label makes the intent obvious.
		const link =
			attachKind === 'event'
				? `[Event "${row.label}"](/case/${row.caseId}/timeline)`
				: attachKind === 'ioc'
					? `[IOC "${row.label}"](/case/${row.caseId}/iocs)`
					: attachKind === 'asset'
						? `[Asset "${row.label}"](/case/${row.caseId}/assets)`
						: `[Task "${row.label}"](/case/${row.caseId}/tasks)`;
		body = body ? `${body} ${link}` : link;
		attachOpen = false;
		attachSearch = '';
		composerEl?.focus();
	};

	// --- Rendering helpers ---------------------------------------------------

	const fmtTime = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString(undefined, {
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	};

	const systemIcon = (k: ChatMessageKind) => {
		switch (k) {
			case 'task_assigned':
			case 'task_completed':
				return ListChecks;
			case 'case_attached':
			case 'case_detached':
			case 'case_activity':
				return WaypointsIcon;
			case 'sitrep_published':
				return FileText;
			case 'note':
			case 'pin':
				return Pin;
			case 'decision':
				return Gavel;
			case 'priority':
				return AlertOctagon;
			case 'system':
				return AlertCircle;
			default:
				return null;
		}
	};

	const systemColor = (k: ChatMessageKind) => {
		switch (k) {
			case 'task_assigned':
			case 'task_completed':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'case_attached':
			case 'case_detached':
			case 'case_activity':
				return 'text-sky-600 dark:text-sky-400';
			case 'sitrep_published':
				return 'text-amber-600 dark:text-amber-400';
			case 'note':
			case 'pin':
				return 'text-violet-600 dark:text-violet-400';
			case 'decision':
				return 'text-indigo-600 dark:text-indigo-400';
			case 'priority':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-muted-foreground';
		}
	};

	// Determine whether to render an avatar / header for this message
	// vs. an inline continuation of the previous bubble. Groups
	// consecutive messages from the same author within a 5min window
	// for a less noisy timeline.
	const groups = $derived.by(() => {
		type Group = { key: string; date: string; rows: ChatMessage[] };
		const out: Group[] = [];
		let lastAuthor: number | null = null;
		let lastTs = 0;
		let lastDate = '';
		for (const m of visibleMessages) {
			const ts = m.created_at ? new Date(m.created_at).getTime() : 0;
			const date = m.created_at
				? new Date(m.created_at).toLocaleDateString()
				: 'Unknown';
			if (date !== lastDate) {
				out.push({ key: `date-${date}-${m.message_id}`, date, rows: [] });
				lastDate = date;
				lastAuthor = null;
			}
			const tail = out[out.length - 1];
			tail.rows.push(m);
			lastAuthor = m.author_id;
			lastTs = ts;
		}
		return out;
	});

	const isContinuation = (
		m: ChatMessage,
		prev: ChatMessage | undefined
	): boolean => {
		if (!prev) return false;
		if (prev.kind !== 'message' || m.kind !== 'message') return false;
		if (prev.author_id !== m.author_id) return false;
		if (!prev.created_at || !m.created_at) return false;
		const dt =
			new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
		return dt < 5 * 60 * 1000;
	};

	const totalGlobalFilters = GLOBAL_FILTERS.length;
	const activeGlobalFilters = $derived(globalFilters.size);
	const anyExclusion = $derived(
		excludedCases.size > 0 ||
			Object.values(excludedCaseActivities).some((s) => s.size > 0) ||
			activeGlobalFilters < totalGlobalFilters
	);
</script>

<!--
	Stream layout.

	Left pane (lg+): the firehose filter. Two stacked sections — global
	kind toggles on top, then a per-case sub-tree where each attached
	case can be muted entirely or trimmed down to specific activity
	types (note created, IOC updated, asset deleted, …).

	Right pane: the rendered stream with composer at the bottom.

	A new case attached to the war room appears in the left pane
	automatically — the filter list is keyed off the live
	`attachedCases` state, not a snapshot — so its activity starts
	showing up the moment it's attached.
-->
<!--
	Outer split: the filters sidebar on the left is now user-resizable —
	defaults to ~22 % of the chat surface, drag the handle to widen for a
	long case list or narrow when threads are the focus. Pane sizes are
	persisted in localStorage by `paneforge` keyed on `autoSaveId` so the
	choice survives reloads.
-->
<Resizable.PaneGroup
	direction="horizontal"
	autoSaveId="war-room-chat-sidebar"
	class="h-full min-h-0 w-full overflow-hidden"
>
	<Resizable.Pane
		defaultSize={22}
		minSize={14}
		maxSize={45}
		class="flex min-h-0 flex-col border-r bg-card/40"
	>
		<!-- Header row with quick select-all / select-none. shrink-0 keeps
		     it pinned while the inner list scrolls. -->
		<div class="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
			<p class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Filter class="h-3 w-3" />
				Filters
			</p>
			{#if anyExclusion}
				<button
					type="button"
					class="text-2xs text-primary transition-colors hover:underline"
					onclick={selectAll}
				>
					Reset
				</button>
			{:else}
				<button
					type="button"
					class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={selectNone}
				>
					Clear all
				</button>
			{/if}
		</div>

		<!-- The scroll viewport. `min-h-0` on this AND on the parent
		     `<aside>` is what lets `overflow-y-auto` actually clip — without
		     both, the flex container stretches to its content height and
		     the scrollbar never appears. `stream-thin-scroll` matches the
		     hover-to-reveal style used in notes / tasks so the sidebar
		     bar isn't a fat default UA bar. -->
		<div class="stream-thin-scroll min-h-0 flex-1 overflow-y-auto">
			<!-- Threads at the top of the sidebar so the operator's active
			     conversations are the first thing they see when the pane
			     opens. Decisions & Pins follow below, then the Stream
			     lanes filters, per-case tree, and slash-command reference. -->
			<section class="border-b px-2 py-2">
				<p class="px-2 pb-1 pt-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					<MessageSquare class="h-3 w-3" />
					Threads ({threads.length})
				</p>
				{#if threads.length === 0}
					<p class="px-2 py-2 text-2xs text-muted-foreground">
						Reply to any message or use <code class="rounded bg-muted px-1 py-0.5 font-mono">/thread</code> to start one.
					</p>
				{:else}
					<ul class="stream-thin-scroll flex max-h-72 flex-col overflow-y-auto">
						{#each threads as t (t.message_id)}
							{@const active = openThread?.message_id === t.message_id}
							<li>
								<button
									type="button"
									class={[
										'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
										active ? 'bg-muted' : 'hover:bg-muted/60'
									]}
									onclick={() => openThreadFor(t.message_id)}
								>
									<div class="flex items-center gap-1">
										{#if t.is_followed}
											<Bell class="h-3 w-3 shrink-0 text-primary" />
										{/if}
										<span class="min-w-0 flex-1 truncate text-xs font-medium">
											{t.thread_title ?? (t.preview ?? '(thread)').slice(0, 60)}
										</span>
									</div>
									<div class="flex items-center gap-2 text-2xs text-muted-foreground">
										<span>
											{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}
										</span>
										{#if t.author_name || t.author_login}
											<span class="truncate">· {t.author_name ?? t.author_login}</span>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!--
			  Decisions & Pins — the trace log of everything the room
			  officially decided or pinned, top-level or inside a
			  thread. Newest first so the last thing decided is at the
			  top. Click a row to jump: replies open their thread pane,
			  top-level entries scroll the main stream and briefly ring
			  the row.
			-->
			<section class="border-t px-2 py-2">
				<p class="flex items-center gap-1.5 px-2 pb-1 pt-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					<Gavel class="h-3 w-3" />
					Decisions & Pins ({traceLog.length})
				</p>
				{#if traceLog.length === 0}
					<p class="px-2 py-2 text-2xs text-muted-foreground">
						Use <code class="rounded bg-muted px-1 py-0.5 font-mono">/decision</code>
						or <code class="rounded bg-muted px-1 py-0.5 font-mono">/pin</code> to record
						something the room should remember.
					</p>
				{:else}
					<!--
					  Search box narrows the trace list by body / kind /
					  author. Kept inline (no debounce) — the list is small
					  enough that a client-side filter on each keystroke is
					  cheap, and the operator sees results immediately.
					-->
					<div class="relative px-1 pb-1">
						<Search class="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={traceFilter}
							oninput={(e) => (traceFilter = (e.target as HTMLInputElement).value)}
							placeholder="Search decisions & pins"
							class="h-7 pl-7 text-2xs"
							aria-label="Search decisions & pins"
						/>
					</div>

					{#if filteredTraceLog.length === 0}
						<p class="px-2 py-2 text-2xs text-muted-foreground">
							No matches for “{traceFilter}”.
						</p>
					{:else}
						<!--
						  Scroll cap: taller than the Threads list because
						  decisions/pins are the audit trail an operator
						  actively reads back through, not a summary
						  glance. `stream-thin-scroll` matches the rest of
						  the sidebar's scrollbar style.
						-->
						<ul class="stream-thin-scroll flex max-h-96 flex-col overflow-y-auto">
							{#each filteredTraceLog as t (t.message_id)}
								{@const meta = traceRowMeta(t)}
								{@const bodyText = stripMarkdown(t.body ?? '')}
								{@const canDelete = currentUserId != null && t.author_id === currentUserId}
								<li class="group/trace flex items-start gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/60">
									<button
										type="button"
										class="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-1 text-left"
										onclick={() => jumpToTrace(t)}
										title="Jump to this entry"
									>
										<meta.Icon class={`mt-0.5 h-3 w-3 shrink-0 ${meta.color}`} />
										<div class="min-w-0 flex-1">
											<p class="line-clamp-2 text-xs">
												{bodyText || '—'}
											</p>
											<div class="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
												<span class="uppercase tracking-wider">{meta.label}</span>
												<span class="opacity-40">·</span>
												<span class="truncate">
													{t.author_name ?? t.author_login ?? 'Unknown'}
												</span>
												{#if t.created_at}
													<span class="opacity-40">·</span>
													<span class="shrink-0">{fmtTime(t.created_at)}</span>
												{/if}
												{#if t.parent_message_id != null}
													<span class="opacity-40">·</span>
													<span class="shrink-0 italic">in thread</span>
												{/if}
											</div>
										</div>
									</button>
									{#if canDelete}
										<button
											type="button"
											class="invisible mt-1 shrink-0 rounded p-1 text-destructive transition-colors hover:bg-destructive/10 group-hover/trace:visible focus:visible"
											onclick={() => removeTraceEntry(t)}
											aria-label={`Delete this ${meta.label.toLowerCase()}`}
											title="Delete"
										>
											<Trash2 class="h-3 w-3" />
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			<!-- Stream lanes toggles: sit below the trace views (Threads,
			     Decisions & Pins) because in normal operation an IC
			     spends more time reading those than tweaking which
			     activity kinds are visible. -->
			<section class="border-t px-2 py-2">
				<p class="px-2 pb-1 pt-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Stream lanes
				</p>
				<ul class="flex flex-col">
					{#each GLOBAL_FILTERS as f (f.key)}
						{@const on = globalFilters.has(f.key)}
						<li>
							<label
								class={[
									'flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
									on
										? 'text-foreground hover:bg-muted/60'
										: 'text-muted-foreground hover:bg-muted/40'
								]}
							>
								<span>{f.label}</span>
								<Checkbox
									checked={on}
									onCheckedChange={() => toggleGlobal(f.key)}
									aria-label={`Toggle ${f.label}`}
								/>
							</label>
						</li>
					{/each}
				</ul>
			</section>

			<!-- Per-case sub-tree with grouped activity types. The list
			     itself is capped at a comfortable max-height and scrolls
			     internally — otherwise a war room with many attached
			     cases would push the slash-command reference off the
			     bottom of the sidebar. -->
			<section class="border-t px-2 py-2">
				<div class="flex items-center justify-between px-2 pb-1 pt-1">
					<p class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						<Waypoints class="h-3 w-3" />
						Cases ({attachedCases.length})
					</p>
				</div>

				{#if attachedCases.length === 0}
					<p class="px-2 py-2 text-2xs text-muted-foreground">
						No cases attached. Anything attached later will appear here automatically.
					</p>
				{:else}
					<ul class="stream-thin-scroll flex max-h-72 flex-col overflow-y-auto">
						{#each attachedCases as att (att.case_id)}
							{@const caseOn = isCaseOn(att.case_id)}
							{@const caseExpanded = caseSectionsOpen[att.case_id] ?? false}
							<li>
								<div
									class={[
										'flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
										caseOn ? 'hover:bg-muted/60' : 'opacity-60 hover:bg-muted/40'
									]}
								>
									<button
										type="button"
										class="flex flex-1 items-center gap-1.5 text-left"
										onclick={() => toggleCaseSection(att.case_id)}
										aria-expanded={caseExpanded}
									>
										{#if caseExpanded}
											<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" />
										{:else}
											<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" />
										{/if}
										<span class="min-w-0 flex-1 truncate text-xs" title={att.case_name}>
											{att.case_name}
										</span>
									</button>
									<Checkbox
										checked={caseOn}
										onCheckedChange={() => toggleCase(att.case_id)}
										aria-label={`Toggle case #${att.case_id} in stream`}
									/>
								</div>

								{#if caseExpanded}
									<ul class="ml-4 flex flex-col border-l border-border/40 pl-1">
										{#each ACTIVITY_GROUPS as g (g.key)}
											{@const gOpen =
												groupSectionsOpen[groupKey(att.case_id, g.key)] ?? false}
											{@const gState = groupState(att.case_id, g)}
											<li>
												<div
													class={[
														'flex items-center gap-1 rounded-md px-2 py-1 transition-colors',
														caseOn
															? 'hover:bg-muted/50'
															: 'opacity-60 hover:bg-muted/30'
													]}
												>
													<button
														type="button"
														class="flex flex-1 items-center gap-1.5 text-left"
														onclick={() => toggleGroupSection(att.case_id, g.key)}
														aria-expanded={gOpen}
													>
														{#if gOpen}
															<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" />
														{:else}
															<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" />
														{/if}
														<span class="text-2xs">{g.label}</span>
													</button>
													<Checkbox
														checked={gState === 'all'}
														indeterminate={gState === 'some'}
														onCheckedChange={() => toggleGroup(att.case_id, g)}
														disabled={!caseOn}
														aria-label={`Toggle ${g.label} for case #${att.case_id}`}
													/>
												</div>

												{#if gOpen}
													<ul class="ml-4 flex flex-col border-l border-border/30 pl-1">
														{#each g.slugs as s (s.slug)}
															{@const typeOn = isCaseActivityOn(
																att.case_id,
																s.slug
															)}
															<li>
																<label
																	class={[
																		'flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-0.5 text-2xs transition-colors',
																		caseOn && typeOn
																			? 'text-foreground hover:bg-muted/50'
																			: 'text-muted-foreground hover:bg-muted/30',
																		!caseOn && 'cursor-not-allowed'
																	]}
																>
																	<span class="truncate">{s.label}</span>
																	<Checkbox
																		checked={caseOn && typeOn}
																		onCheckedChange={() =>
																			toggleCaseActivity(att.case_id, s.slug)}
																		disabled={!caseOn}
																		aria-label={s.label}
																	/>
																</label>
															</li>
														{/each}
													</ul>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Slash commands reference. Folded by default — once an
			     operator knows the vocabulary this just takes space; the
			     header expands it on click. -->
			<section class="border-t px-4 py-3">
				<button
					type="button"
					class="flex w-full items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => (slashOpen = !slashOpen)}
					aria-expanded={slashOpen}
				>
					{#if slashOpen}
						<ChevronDown class="h-3 w-3 shrink-0" />
					{:else}
						<ChevronRight class="h-3 w-3 shrink-0" />
					{/if}
					<Slash class="h-3 w-3" />
					Slash commands
				</button>
				{#if slashOpen}
					<ul class="mt-2 space-y-1.5">
						{#each SLASH_COMMANDS as c}
							<li class="text-2xs">
								<code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
									{c.cmd}
								</code>
								<p class="mt-0.5 pl-1 text-muted-foreground">{c.desc}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	</Resizable.Pane>

	<Resizable.Handle class="bg-transparent hover:bg-border" />

	<!-- Right side: stream column + optional thread side-pane. -->
	<Resizable.Pane class="flex h-full min-h-0 min-w-0 flex-row">
	<div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
		<!-- Compact summary visible only when sidebar is hidden. -->
		<div class="flex items-center gap-2 overflow-x-auto border-b px-4 py-2 lg:hidden">
			<Filter class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<span class="shrink-0 text-2xs text-muted-foreground">
				{activeGlobalFilters}/{totalGlobalFilters} lanes
				{#if excludedCases.size > 0}
					· {excludedCases.size} case{excludedCases.size === 1 ? '' : 's'} muted
				{/if}
			</span>
			{#if anyExclusion}
				<button
					type="button"
					class="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-2xs text-primary"
					onclick={selectAll}
				>
					Reset filters
				</button>
			{/if}
		</div>

		<!--
		  Top-of-stream quick filter. Hits the server (case-insensitive
		  ILIKE against the message body + case-activity description),
		  so a hit from six weeks ago surfaces without the operator
		  having to page all the way back. Enter clears the debounce so
		  the query runs immediately; Escape clears the field.
		-->
		<div class="flex shrink-0 items-center gap-2 border-b bg-background/60 px-4 py-2">
			<div class="relative flex-1">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={streamSearch}
					oninput={(e) => {
						streamSearch = (e.target as HTMLInputElement).value;
						scheduleStreamSearch();
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
							const next = streamSearch.trim();
							if (next !== appliedSearch) {
								appliedSearch = next;
								exhausted = false;
								messages = [];
								void load();
							}
						} else if (e.key === 'Escape') {
							e.preventDefault();
							clearStreamSearch();
						}
					}}
					placeholder="Filter the stream — messages, decisions, case activity…"
					class="h-8 pl-8 pr-8 text-xs"
					aria-label="Filter the stream"
				/>
				{#if streamSearch}
					<button
						type="button"
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={clearStreamSearch}
						aria-label="Clear filter"
						title="Clear (Esc)"
					>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</div>
			{#if appliedSearch && !loading}
				<span class="shrink-0 text-2xs text-muted-foreground">
					{visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
				</span>
			{/if}
		</div>

		<!-- Stream. min-w-0 above keeps long messages from forcing the
		     column wider than the grid track allows. -->
		<div bind:this={listEl} class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
			{#if loading}
				<div class="flex flex-col gap-3">
					{#each Array(4) as _}
						<div class="flex items-start gap-3">
							<Skeleton class="h-8 w-8 rounded-full" />
							<div class="flex-1 space-y-1.5">
								<Skeleton class="h-3 w-32" />
								<Skeleton class="h-3 w-3/4" />
							</div>
						</div>
					{/each}
				</div>
			{:else}
				{#if !exhausted}
					<div class="flex justify-center pb-3">
						<Button
							variant="ghost"
							size="sm"
							class="h-7 text-2xs"
							onclick={loadOlder}
							disabled={loadingMore}
						>
							{#if loadingMore}
								<Loader2 class="mr-1 h-3 w-3 animate-spin" />
							{/if}
							Load earlier messages
						</Button>
					</div>
				{/if}

				{#if visibleMessages.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
						<Send class="h-6 w-6 opacity-30" />
						<p class="text-sm">
							{#if appliedSearch && messages.length === 0}
								No stream entries match “{appliedSearch}”.
							{:else if messages.length === 0}
								No activity yet. Drop the first message or attach a case.
							{:else}
								No entries match the current filters.
							{/if}
						</p>
						{#if appliedSearch && messages.length === 0}
							<Button
								size="sm"
								variant="ghost"
								class="h-7 text-2xs"
								onclick={clearStreamSearch}
							>
								Clear search
							</Button>
						{:else if anyExclusion}
							<Button
								size="sm"
								variant="ghost"
								class="h-7 text-2xs"
								onclick={selectAll}
							>
								Reset filters
							</Button>
						{/if}
					</div>
				{:else}
					<div class="space-y-5">
						{#each groups as g (g.key)}
							<!-- Date separator -->
							<div class="flex items-center gap-3" aria-hidden="true">
								<div class="h-px flex-1 bg-border"></div>
								<span class="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
									{g.date}
								</span>
								<div class="h-px flex-1 bg-border"></div>
							</div>

							<ul class="flex flex-col gap-1">
								{#each g.rows as m, i (m.message_id)}
									{@const prev = g.rows[i - 1]}
									{@const cont = isContinuation(m, prev)}
									{@const Icon = systemIcon(m.kind)}

									{#if m.kind === 'poll' && m.poll}
										<!--
										  Poll message. Full-width card with the author's
										  avatar + name header, then the interactive poll
										  card. Uses the same start-of-group layout as
										  regular messages so voter attribution reads
										  naturally in the stream.
										-->
										{@const pollCanClose =
											currentUserId != null &&
											m.poll.author_id === currentUserId &&
											!m.poll.is_closed}
										<li
											data-message-id={m.message_id}
											class={[
												'group/msg flex gap-3 pt-2 transition-colors',
												highlightMessageId === m.message_id && 'rounded-md ring-2 ring-primary/60'
											]}
										>
											<UserAvatar
												userId={m.author_id ?? undefined}
												name={m.author_name ?? m.author_login ?? 'Unknown'}
												size="size-8"
											/>
											<div class="min-w-0 flex-1">
												<div class="flex items-baseline gap-2">
													<span class="text-sm font-semibold text-foreground">
														{m.author_name ?? m.author_login ?? 'Unknown'}
													</span>
													<span class="text-2xs text-muted-foreground">
														{fmtTime(m.created_at)}
													</span>
													<span class="text-2xs italic text-muted-foreground">
														posted a poll
													</span>
													{#if m.is_pinned}
														<span
															class="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-2xs text-primary"
															title="Pinned"
														>
															<Pin class="h-2.5 w-2.5" />
															Pinned
														</span>
													{/if}
												</div>
												<div class="mt-1">
													<PollCard
														poll={m.poll}
														{currentUserId}
														canClose={pollCanClose}
														onVote={(optionIds) => voteOnPoll(m.message_id, optionIds)}
														onClose={() => closePoll(m.message_id)}
													/>
												</div>
												<div class="flex items-center gap-2">
													<button
														type="button"
														class="mt-1 inline-flex items-center gap-0.5 text-2xs {m.is_pinned
															? 'text-primary'
															: 'text-muted-foreground/60 hover:text-foreground'} transition-colors"
														onclick={() => void togglePin(m)}
														aria-label={m.is_pinned ? 'Unpin message' : 'Pin message'}
														title={m.is_pinned ? 'Unpin' : 'Pin'}
													>
														{#if m.is_pinned}
															<PinOff class="h-3 w-3" />
															Unpin
														{:else}
															<Pin class="h-3 w-3" />
															Pin
														{/if}
													</button>
												</div>
											</div>
										</li>
									{:else if m.kind !== 'message'}
										{@const actor = m.author_name ?? m.author_login}
										<li
											data-message-id={m.message_id}
											class={[
												'flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-1.5 text-xs transition-colors',
												highlightMessageId === m.message_id && 'ring-2 ring-primary/60'
											]}
										>
											{#if Icon}
												<Icon class={`h-3.5 w-3.5 shrink-0 ${systemColor(m.kind)}`} />
											{/if}
											<span class="min-w-0 flex-1 break-words text-muted-foreground">
												{#if actor}
													<!-- Actor first so the operator can see at a glance
													     who triggered the system event before reading
													     the body. The avatar isn't here on purpose: the
													     dashed row is intentionally compact and a tiny
													     name pill reads better at this height. -->
													<span class="mr-1 font-medium text-foreground">
														{actor}
													</span>
												{/if}
												<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
											</span>
											<!--
											  Reference card: a clickable chip pointing at the
											  ref_type / ref_id the backend stamped on this row.
											  Falls back to a non-link badge for self-referential
											  rows (war_room, war_room_chat).
											-->
											<StreamRefCard
												{warRoomId}
												refType={m.ref_type}
												refId={m.ref_id}
												refCaseId={m.ref_case_id}
												{attachedCases}
											/>
											<span class="shrink-0 text-2xs text-muted-foreground">
												{fmtTime(m.created_at)}
											</span>
										</li>
									{:else if cont}
										{@const replyCount = replyCountByRoot.get(m.message_id) ?? 0}
										<li
											data-message-id={m.message_id}
											class={[
												'group/msg flex gap-3 pl-11 transition-colors',
												highlightMessageId === m.message_id && 'rounded-md ring-2 ring-primary/60'
											]}
										>
											<div class="min-w-0 flex-1">
												<p class="break-words text-sm">
													<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
													{#if m.is_pinned}
														<!--
														  Pin badge next to body content. On continuation
														  rows there's no timestamp header to anchor to, so
														  we inline the badge at the end of the body.
														-->
														<span
															class="ml-1 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 align-middle text-2xs text-primary"
															title="Pinned"
														>
															<Pin class="h-2.5 w-2.5" />
															Pinned
														</span>
													{/if}
												</p>
												{#if (m.reactions ?? []).length > 0}
													<MessageReactions
														reactions={m.reactions}
														{currentUserId}
														onToggle={(emoji) => void toggleReaction(m.message_id, emoji)}
													/>
												{/if}
												<div class="flex items-center gap-2">
													{#if replyCount > 0 || m.thread_title}
														<button
															type="button"
															class="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs text-primary hover:bg-primary/15"
															onclick={() => openThreadFor(m.message_id)}
														>
															<MessageSquare class="h-3 w-3" />
															{#if m.thread_title}
																{m.thread_title}
															{:else}
																{replyCount} {replyCount === 1 ? 'reply' : 'replies'}
															{/if}
														</button>
													{/if}
													<button
														type="button"
														class="mt-1 text-2xs text-muted-foreground/60 transition-colors hover:text-foreground"
														onclick={() => openThreadFor(m.message_id)}
													>
														Reply in thread
													</button>
													<button
														type="button"
														class="mt-1 inline-flex items-center gap-0.5 text-2xs text-muted-foreground/60 transition-colors hover:text-foreground"
														onclick={() => void toggleReaction(m.message_id, '👍')}
														aria-label="React with thumbs up"
														title="Quick react 👍 (open picker via the pill row's + button)"
													>
														<SmilePlus class="h-3 w-3" />
														React
													</button>
													<button
														type="button"
														class="mt-1 inline-flex items-center gap-0.5 text-2xs {m.is_pinned
															? 'text-primary'
															: 'text-muted-foreground/60 hover:text-foreground'} transition-colors"
														onclick={() => void togglePin(m)}
														aria-label={m.is_pinned ? 'Unpin message' : 'Pin message'}
														title={m.is_pinned ? 'Unpin' : 'Pin'}
													>
														{#if m.is_pinned}
															<PinOff class="h-3 w-3" />
															Unpin
														{:else}
															<Pin class="h-3 w-3" />
															Pin
														{/if}
													</button>
													{#if currentUserId != null && m.author_id === currentUserId}
														<button
															type="button"
															class="mt-1 inline-flex items-center gap-0.5 text-2xs text-destructive/60 transition-colors hover:text-destructive"
															onclick={() => removeMessage(m)}
															aria-label="Delete message"
														>
															<Trash2 class="h-3 w-3" />
															Delete
														</button>
													{/if}
												</div>
											</div>
										</li>
									{:else}
										{@const replyCount = replyCountByRoot.get(m.message_id) ?? 0}
										<li
											data-message-id={m.message_id}
											class={[
												'group/msg flex gap-3 pt-2 transition-colors',
												highlightMessageId === m.message_id && 'rounded-md ring-2 ring-primary/60'
											]}
										>
											<UserAvatar
												userId={m.author_id ?? undefined}
												name={m.author_name ?? m.author_login ?? 'Unknown'}
												size="size-8"
											/>
											<div class="min-w-0 flex-1">
												<div class="flex items-baseline gap-2">
													<span class="text-sm font-semibold text-foreground">
														{m.author_name ?? m.author_login ?? 'Unknown'}
													</span>
													<span class="text-2xs text-muted-foreground">
														{fmtTime(m.created_at)}
													</span>
													{#if m.edited_at}
														<span class="text-2xs italic text-muted-foreground">
															(edited)
														</span>
													{/if}
													{#if m.is_pinned}
														<span
															class="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-2xs text-primary"
															title="Pinned"
														>
															<Pin class="h-2.5 w-2.5" />
															Pinned
														</span>
													{/if}
												</div>
												<p class="mt-0.5 break-words text-sm">
													<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
												</p>
												{#if (m.reactions ?? []).length > 0}
													<MessageReactions
														reactions={m.reactions}
														{currentUserId}
														onToggle={(emoji) => void toggleReaction(m.message_id, emoji)}
													/>
												{/if}
												<div class="flex items-center gap-2">
													{#if replyCount > 0 || m.thread_title}
														<button
															type="button"
															class="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs text-primary hover:bg-primary/15"
															onclick={() => openThreadFor(m.message_id)}
														>
															<MessageSquare class="h-3 w-3" />
															{#if m.thread_title}
																{m.thread_title}
															{:else}
																{replyCount} {replyCount === 1 ? 'reply' : 'replies'}
															{/if}
														</button>
													{/if}
													<button
														type="button"
														class="mt-1 text-2xs text-muted-foreground/60 transition-colors hover:text-foreground"
														onclick={() => openThreadFor(m.message_id)}
													>
														Reply in thread
													</button>
													<button
														type="button"
														class="mt-1 inline-flex items-center gap-0.5 text-2xs text-muted-foreground/60 transition-colors hover:text-foreground"
														onclick={() => void toggleReaction(m.message_id, '👍')}
														aria-label="React with thumbs up"
														title="Quick react 👍 (open picker via the pill row's + button)"
													>
														<SmilePlus class="h-3 w-3" />
														React
													</button>
													<button
														type="button"
														class="mt-1 inline-flex items-center gap-0.5 text-2xs {m.is_pinned
															? 'text-primary'
															: 'text-muted-foreground/60 hover:text-foreground'} transition-colors"
														onclick={() => void togglePin(m)}
														aria-label={m.is_pinned ? 'Unpin message' : 'Pin message'}
														title={m.is_pinned ? 'Unpin' : 'Pin'}
													>
														{#if m.is_pinned}
															<PinOff class="h-3 w-3" />
															Unpin
														{:else}
															<Pin class="h-3 w-3" />
															Pin
														{/if}
													</button>
													{#if currentUserId != null && m.author_id === currentUserId}
														<button
															type="button"
															class="mt-1 inline-flex items-center gap-0.5 text-2xs text-destructive/60 transition-colors hover:text-destructive"
															onclick={() => removeMessage(m)}
															aria-label="Delete message"
														>
															<Trash2 class="h-3 w-3" />
															Delete
														</button>
													{/if}
												</div>
											</div>
										</li>
									{/if}
								{/each}
							</ul>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Composer -->
		<form
			class="border-t bg-background/80 px-4 py-3"
			onsubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<div class="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={() => (pollComposerOpen = true)}
					aria-label="Create a poll"
					title="Create a poll"
				>
					<BarChart3 size={15} />
				</button>
				<Popover.Root bind:open={attachOpen}>
					<Popover.Trigger
						class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Attach a case element"
					>
						<Paperclip size={15} />
					</Popover.Trigger>
					<Popover.Content side="top" align="start" class="w-96 p-0">
						{#if attachedCases.length === 0}
							<div class="p-4 text-center text-xs text-muted-foreground">
								No cases attached to this war room yet — attach one in the Cases tab.
							</div>
						{:else}
							<!-- Kind chips -->
							<div class="flex items-center gap-1 border-b p-2">
								{#each [{ k: 'event', l: 'Events' }, { k: 'ioc', l: 'IOCs' }, { k: 'asset', l: 'Assets' }, { k: 'task', l: 'Tasks' }] as t}
									{@const on = attachKind === (t.k as ResourceKind)}
									<button
										type="button"
										class={[
											'flex-1 rounded-md px-2 py-1 text-2xs transition-colors',
											on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
										]}
										onclick={() => (attachKind = t.k as ResourceKind)}
									>
										{t.l}
									</button>
								{/each}
							</div>

							<!-- Case selector -->
							<div class="border-b p-2">
								<label class="block text-2xs uppercase tracking-wider text-muted-foreground" for="attach-case">
									Case
								</label>
								<select
									id="attach-case"
									bind:value={attachCaseId}
									class="mt-1 h-7 w-full rounded border bg-background px-2 text-xs"
								>
									{#each attachedCases as c (c.case_id)}
										<option value={c.case_id}>#{c.case_id} — {c.case_name}</option>
									{/each}
								</select>
							</div>

							<!-- Search -->
							<div class="border-b p-2">
								<div class="relative">
									<Search class="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={attachSearch}
										oninput={(e) => (attachSearch = (e.target as HTMLInputElement).value)}
										placeholder="Search…"
										class="h-7 pl-7 text-xs"
									/>
								</div>
							</div>

							<!-- Results -->
							<div class="max-h-72 overflow-y-auto">
								{#if attachLoading}
									<div class="p-3 text-center text-xs text-muted-foreground">
										Loading…
									</div>
								{:else if filteredPickerRows.length === 0}
									<div class="p-3 text-center text-xs text-muted-foreground">
										Nothing here.
									</div>
								{:else}
									<ul>
										{#each filteredPickerRows as r (r.id)}
											<li>
												<button
													type="button"
													class="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60"
													onclick={() => insertAttachment(r)}
												>
													<span class="min-w-0 flex-1">
														<span class="block truncate font-medium">{r.label}</span>
														{#if r.sub}
															<span class="block truncate text-2xs text-muted-foreground">
																{r.sub}
															</span>
														{/if}
													</span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</Popover.Content>
				</Popover.Root>

				<textarea
					bind:this={composerEl}
					value={body}
					oninput={onInput}
					onkeydown={onKey}
					placeholder="Type a message, /command, @user or #resource…"
					rows="1"
					class="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
				></textarea>

				<ChatComposerMentions
					bind:this={mentions}
					textarea={composerEl}
					{body}
					{attachedCases}
					onChangeBody={(v) => (body = v)}
				/>

				<Button
					type="submit"
					size="sm"
					class="h-8 gap-1.5"
					disabled={sending || !body.trim()}
				>
					{#if sending}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<Send class="h-3.5 w-3.5" />
					{/if}
					Send
				</Button>
			</div>

			<p class="mt-1.5 px-1 text-2xs text-muted-foreground">
				<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
				to send · <kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>
				for newline · <kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">/</kbd>
				for commands
			</p>
		</form>
	</div>

	{#if openThread}
		<WarRoomThreadPane
			warRoomId={warRoomId}
			root={openThread}
			{attachedCases}
			onAttachmentClick={openPreview}
			onClose={closeThread}
			onChanged={loadThreads}
		/>
	{/if}
	</Resizable.Pane>
</Resizable.PaneGroup>

<AttachmentPreviewDialog
	bind:open={previewOpen}
	target={previewTarget}
	onOpenChange={(v) => (previewOpen = v)}
/>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText={confirmActionText}
	confirmButtonVariant="destructive"
	onConfirm={runConfirmed}
/>

<PollComposer
	open={pollComposerOpen}
	onOpenChange={(v) => (pollComposerOpen = v)}
	onSubmit={submitPoll}
/>

<style>
	/*
	  Thin, hover-to-reveal scrollbar used inside the stream filters
	  sidebar — same pattern as `.notes-tree-scroll` in the case notes
	  layout so the look is consistent across the app. The default UA
	  scrollbar inside the narrow filter pane looked chunky and dated.
	*/
	.stream-thin-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.2s ease;
	}

	.stream-thin-scroll:hover {
		scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
	}

	.stream-thin-scroll::-webkit-scrollbar {
		width: 6px;
	}

	.stream-thin-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.stream-thin-scroll::-webkit-scrollbar-thumb {
		background-color: transparent;
		border-radius: 999px;
		transition: background-color 0.2s ease;
	}

	.stream-thin-scroll:hover::-webkit-scrollbar-thumb {
		background-color: hsl(var(--muted-foreground) / 0.35);
	}

	.stream-thin-scroll::-webkit-scrollbar-thumb:hover {
		background-color: hsl(var(--muted-foreground) / 0.55);
	}
</style>
