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
		ChevronDown,
		ChevronRight,
		ClockIcon,
		FileText,
		Filter,
		Gavel,
		Loader2,
		Paperclip,
		Pin,
		ListChecks,
		Search,
		Send,
		Slash,
		Waypoints,
		WaypointsIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Popover from '$lib/components/ui/popover';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import ChatMessageBody from './components/ChatMessageBody.svelte';
	import ChatComposerMentions from './components/ChatComposerMentions.svelte';
	import AttachmentPreviewDialog, {
		type AttachmentTarget
	} from './components/AttachmentPreviewDialog.svelte';
	import StreamRefCard from './components/StreamRefCard.svelte';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatMessageKind
	} from '$lib/services/war-room-chat.service';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
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

	const load = async () => {
		loading = true;
		const res = await WarRoomChatService.list(warRoomId, { limit: 80 });
		if (res.ok && Array.isArray(res.data)) {
			messages = [...res.data].reverse();
			if (res.data.length < 80) exhausted = true;
		}
		loading = false;
		scrollToBottom();
	};

	const loadOlder = async () => {
		if (loadingMore || exhausted || messages.length === 0) return;
		loadingMore = true;
		const before = messages[0].message_id;
		const res = await WarRoomChatService.list(warRoomId, { before, limit: 80 });
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
		const res = await WarRoomChatService.list(warRoomId, { limit: 50 });
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

	onMount(() => {
		void load();
		void loadAttachedCases();
		pollTimer = setInterval(() => void pollNewer(), 4000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	const send = async () => {
		const text = body.trim();
		if (!text) return;
		sending = true;
		const res = await WarRoomChatService.post(warRoomId, text);
		sending = false;
		if (res.ok) {
			body = '';
			await pollNewer();
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
		{ cmd: '/whoami', desc: 'Check current user' }
	];

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
<div
	class="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]"
>
	<aside
		class="hidden min-h-0 flex-col border-r bg-card/40 lg:flex"
		aria-label="Stream filters"
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
		     the scrollbar never appears. -->
		<div class="min-h-0 flex-1 overflow-y-auto">
			<!-- Global kind toggles -->
			<section class="border-b px-2 py-2">
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

			<!-- Per-case sub-tree with grouped activity types -->
			<section class="px-2 py-2">
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
					<ul class="flex flex-col">
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
										<span class="min-w-0 flex-1 truncate text-xs">
											<span class="font-mono text-2xs text-muted-foreground">
												#{att.case_id}
											</span>
											<span class="ml-1">{att.case_name}</span>
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

			<!-- Slash commands reference -->
			<section class="border-t px-4 py-3">
				<p class="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					<Slash class="h-3 w-3" />
					Slash commands
				</p>
				<ul class="space-y-1.5">
					{#each SLASH_COMMANDS as c}
						<li class="text-2xs">
							<code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
								{c.cmd}
							</code>
							<p class="mt-0.5 pl-1 text-muted-foreground">{c.desc}</p>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	</aside>

	<div class="flex h-full min-h-0 min-w-0 flex-col">
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
							{messages.length === 0
								? 'No activity yet. Drop the first message or attach a case.'
								: 'No entries match the current filters.'}
						</p>
						{#if anyExclusion}
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

									{#if m.kind !== 'message'}
										{@const actor = m.author_name ?? m.author_login}
										<li
											class="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-1.5 text-xs"
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
											/>
											<span class="shrink-0 text-2xs text-muted-foreground">
												{fmtTime(m.created_at)}
											</span>
										</li>
									{:else if cont}
										<li class="flex gap-3 pl-11">
											<p class="min-w-0 flex-1 break-words text-sm">
												<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
											</p>
										</li>
									{:else}
										<li class="flex gap-3 pt-2">
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
												</div>
												<p class="mt-0.5 break-words text-sm">
													<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
												</p>
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
</div>

<AttachmentPreviewDialog
	bind:open={previewOpen}
	target={previewTarget}
	onOpenChange={(v) => (previewOpen = v)}
/>
