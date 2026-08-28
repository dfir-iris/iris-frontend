<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		Plus,
		Trash2,
		Check,
		CircleDot,
		Pencil,
		Search,
		X,
		ChevronRight,
		ChevronDown,
		CornerDownRight,
		Tag as TagIcon,
		GripVertical,
		Calendar as CalendarIcon,
		ArrowUpFromLine,
		Columns3,
		Rows3,
		CornerUpRight
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { WarRoomTasksService, type WarRoomTask } from '$lib/services/war-room-tasks.service';
	import { UsersService, type User } from '$lib/services/users.service';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import type { TaskStatus } from '$lib/types/resources/task';
	import TaskKanbanBoard from '$lib/components/common/tasks/TaskKanbanBoard.svelte';
	import type { KanbanColumn } from '$lib/components/common/tasks/kanban-types';

	const warRoomId = $derived(Number(page.params.war_room_id));

	// Top-level tasks (parent_task_id IS NULL), paginated server-side.
	let parents = $state<WarRoomTask[]>([]);
	// Children indexed by parent_task_id — loaded lazily on first expand,
	// then reused. Also refreshed when a subtask is created/edited so
	// the count on the parent stays truthful.
	let childrenByParent = $state<Record<number, WarRoomTask[]>>({});
	let loading = $state(true);
	let loadingMore = $state(false);
	let users = $state<User[]>([]);
	let statuses = $state<TaskStatus[]>([]);
	let usedTags = $state<string[]>([]);

	// Pagination cursor.
	const PER_PAGE = 25;
	let _currentPage = $state(1);
	let nextPage = $state<number | null>(null);
	let totalParents = $state(0);

	// Filters (applied server-side).
	let search = $state('');
	// Debounced copy so we don't fire a request per keystroke.
	let searchDebounced = $state('');
	let selectedStatusIds = $state<number[]>([]);
	let selectedTags = $state<string[]>([]);
	// `null` in selectedAssignees means "Unassigned"; numbers are user ids.
	let selectedAssignees = $state<(number | null)[]>([]);
	let dueFrom = $state('');
	let dueTo = $state('');
	let includeNoDue = $state(true);
	let filtersOpen = $state(false);

	// UI state.
	let expanded = $state<Set<number>>(new Set());
	let draggedTaskId = $state<number | null>(null);
	let dropTargetKey = $state<string | null>(null);
	let _reparenting = $state(false);

	// The board is a flat, status-first view of the same filtered set, so
	// it needs subtasks too — the list only fetches top-level rows and
	// lazily expands. Keeping a separate array avoids bending the list's
	// parent/child caches into a shape they were not built for.
	let viewMode = $state<'list' | 'board'>('list');
	let boardTasks = $state<WarRoomTask[]>([]);
	let boardLoading = $state(false);

	type FormState = {
		title: string;
		description: string;
		due: string;
		assigneeId: number | null;
		statusId: number | null;
		tags: string[];
		parentTaskId: number | null;
	};

	const emptyForm = (): FormState => ({
		title: '',
		description: '',
		due: '',
		assigneeId: null,
		statusId: null,
		tags: [],
		parentTaskId: null
	});

	let dialogOpen = $state(false);
	let dialogMode = $state<'create' | 'edit'>('create');
	let editing = $state<WarRoomTask | null>(null);
	let form = $state<FormState>(emptyForm());
	let saving = $state(false);

	let assigneeOpen = $state(false);
	let assigneeSearch = $state('');
	let statusOpen = $state(false);
	let tagInput = $state('');

	/**
	 * `scope: 'all'` drops the top-level restriction so subtasks come back
	 * as rows of their own — what the board wants, since on a status board
	 * a subtask is a work item like any other.
	 */
	function buildFilterParams(scope: 'top' | 'all' = 'top') {
		// Assignees: `null` means unassigned; the service accepts either
		// numeric user ids or the string 'unassigned'.
		const assignee_id = selectedAssignees.map((a) => (a === null ? ('unassigned' as const) : a));
		return {
			q: searchDebounced.trim() || undefined,
			status_id: selectedStatusIds.length ? selectedStatusIds : undefined,
			tag: selectedTags.length ? selectedTags : undefined,
			assignee_id: assignee_id.length ? assignee_id : undefined,
			...(scope === 'top' ? { parent_task_id: 'top' as const } : {}),
			due_from: dueFrom || undefined,
			due_to: dueTo || undefined,
			include_no_due: includeNoDue,
			per_page: PER_PAGE
		};
	}

	const loadFirstPage = async () => {
		loading = true;
		_currentPage = 1;
		const res = await WarRoomTasksService.listPaginated(warRoomId, {
			...buildFilterParams(),
			page: 1
		});
		if (res.ok && res.data && typeof res.data !== 'string') {
			const env = res.data;
			parents = env.data;
			totalParents = env.total;
			nextPage = env.next_page;
			// Wipe cached subtasks — filters may have changed which
			// subtasks are relevant. They'll re-fetch on demand.
			childrenByParent = {};
			expanded = new Set();
		}
		loading = false;
	};

	const loadNextPage = async () => {
		if (nextPage == null || loadingMore) return;
		loadingMore = true;
		const res = await WarRoomTasksService.listPaginated(warRoomId, {
			...buildFilterParams(),
			page: nextPage
		});
		if (res.ok && res.data && typeof res.data !== 'string') {
			const env = res.data;
			parents = [...parents, ...env.data];
			totalParents = env.total;
			nextPage = env.next_page;
			_currentPage = env.current_page;
		}
		loadingMore = false;
	};

	async function loadChildren(parentId: number, force = false) {
		if (!force && childrenByParent[parentId]) return;
		// Children are unfiltered (parent-scoped, no `q`) so an expanded
		// subtree stays complete even when a filter narrows the parent
		// list. Users expect "expand" to show the whole thing.
		const res = await WarRoomTasksService.list(warRoomId, {
			parent_task_id: parentId
		});
		if (res.ok && Array.isArray(res.data)) {
			childrenByParent = { ...childrenByParent, [parentId]: res.data };
		}
	}

	// The board shows the whole filtered set in one shot — a kanban that
	// silently holds back page 2 reads as "this is everything".
	const loadBoard = async () => {
		boardLoading = true;
		const res = await WarRoomTasksService.list(warRoomId, buildFilterParams('all'));
		if (res.ok && Array.isArray(res.data)) boardTasks = res.data;
		boardLoading = false;
	};

	const loadUsers = async () => {
		const res = await UsersService.list();
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as { data?: User[] };
			users = Array.isArray(payload.data) ? payload.data : [];
		}
	};

	const loadStatuses = async () => {
		const res = await TaskStatusService.list();
		if (res.ok && Array.isArray(res.data)) statuses = res.data;
	};

	const loadUsedTags = async () => {
		const res = await WarRoomTasksService.listUsedTags(warRoomId);
		if (res.ok && Array.isArray(res.data)) usedTags = res.data;
	};

	onMount(() => {
		loadFirstPage();
		loadUsers();
		loadStatuses();
		loadUsedTags();
	});

	// Debounce free-text search: keystrokes update `search` immediately
	// (so the input stays snappy), but only settle into `searchDebounced`
	// after 300ms of quiet, which is what actually fires a request.
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const s = search;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchDebounced = s;
		}, 300);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	// Any settled filter change → re-query from page 1. `untrack` on the
	// call itself so it doesn't self-loop through the state it writes to.
	// Only the visible view is refetched; switching views loads the one
	// being switched to.
	$effect(() => {
		// Track dependencies:
		void searchDebounced;
		void selectedStatusIds;
		void selectedTags;
		void selectedAssignees;
		void dueFrom;
		void dueTo;
		void includeNoDue;
		void warRoomId;
		void viewMode;
		untrack(() => {
			if (viewMode === 'board') void loadBoard();
			else void loadFirstPage();
		});
	});

	// -------- CRUD --------
	const openCreate = (parentId: number | null = null) => {
		dialogMode = 'create';
		editing = null;
		form = emptyForm();
		form.parentTaskId = parentId;
		dialogOpen = true;
	};

	const openEdit = (t: WarRoomTask) => {
		dialogMode = 'edit';
		editing = t;
		form = {
			title: t.title,
			description: t.description ?? '',
			due: t.due_at ? t.due_at.slice(0, 10) : '',
			assigneeId: t.assignee_id,
			statusId: t.status_id ?? null,
			tags: parseTags(t.tags),
			parentTaskId: t.parent_task_id ?? null
		};
		dialogOpen = true;
	};

	function upsertTask(next: WarRoomTask) {
		// The board holds a flat copy of the same rows; keep it level with
		// the list so a create/edit/close made from either view shows up in
		// both without a refetch.
		const boardIdx = boardTasks.findIndex((x) => x.task_id === next.task_id);
		boardTasks =
			boardIdx >= 0
				? boardTasks.map((x) => (x.task_id === next.task_id ? next : x))
				: [next, ...boardTasks];

		// Replace-or-insert the row wherever it lives in local state.
		if (next.parent_task_id == null) {
			const idx = parents.findIndex((x) => x.task_id === next.task_id);
			if (idx >= 0) parents = parents.map((x) => (x.task_id === next.task_id ? next : x));
			else parents = [next, ...parents];
		} else {
			const pid = next.parent_task_id;
			const bucket = childrenByParent[pid] ?? [];
			const idx = bucket.findIndex((x) => x.task_id === next.task_id);
			const nextBucket =
				idx >= 0 ? bucket.map((x) => (x.task_id === next.task_id ? next : x)) : [next, ...bucket];
			childrenByParent = { ...childrenByParent, [pid]: nextBucket };
		}
	}

	function removeTaskLocally(taskId: number) {
		// Deleting a parent cascades to its subtasks server-side, and the
		// board lists those as cards of their own — drop them too.
		boardTasks = boardTasks.filter((x) => x.task_id !== taskId && x.parent_task_id !== taskId);

		// Remove from parents (and cascade-drop its children bucket) or
		// from whichever child bucket it lives in.
		const asParent = parents.some((x) => x.task_id === taskId);
		if (asParent) {
			parents = parents.filter((x) => x.task_id !== taskId);
			const next = { ...childrenByParent };
			delete next[taskId];
			childrenByParent = next;
			totalParents = Math.max(0, totalParents - 1);
			return;
		}
		const nextChildren: Record<number, WarRoomTask[]> = {};
		for (const [pid, arr] of Object.entries(childrenByParent)) {
			nextChildren[Number(pid)] = arr.filter((x) => x.task_id !== taskId);
		}
		childrenByParent = nextChildren;
	}

	const submit = async () => {
		const title = form.title.trim();
		if (!title) return;
		saving = true;
		const body = {
			title,
			description: form.description.trim() || null,
			due_at: form.due || null,
			assignee_id: form.assigneeId,
			status_id: form.statusId,
			tags: form.tags.length ? form.tags.join(',') : null,
			parent_task_id: form.parentTaskId
		};
		const res =
			dialogMode === 'create'
				? await WarRoomTasksService.create(warRoomId, body)
				: await WarRoomTasksService.update(warRoomId, editing!.task_id, body);
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTask;
			const wasNew = dialogMode === 'create';
			// If we edited a task and its parent changed, the row moved
			// buckets — drop the old placement before inserting.
			if (!wasNew && editing && editing.parent_task_id !== next.parent_task_id) {
				removeTaskLocally(next.task_id);
			}
			upsertTask(next);
			if (wasNew && next.parent_task_id == null) totalParents += 1;
			if (next.parent_task_id != null) {
				expanded.add(next.parent_task_id);
				expanded = new Set(expanded);
			}
			toast({ title: wasNew ? 'Task created' : 'Task updated' });
			dialogOpen = false;
			loadUsedTags();
		} else {
			const msg =
				typeof res.error === 'string'
					? res.error
					: dialogMode === 'create'
						? 'Could not create task'
						: 'Could not update task';
			toast({ title: msg, variant: 'destructive' });
		}
	};

	const toggle = async (t: WarRoomTask) => {
		const action = t.closed_at ? 'reopen' : 'close';
		const res = await (action === 'close'
			? WarRoomTasksService.close(warRoomId, t.task_id)
			: WarRoomTasksService.reopen(warRoomId, t.task_id));
		if (res.ok && res.data && typeof res.data !== 'string') {
			upsertTask(res.data as WarRoomTask);
		}
	};

	const remove = async (t: WarRoomTask) => {
		const childCount = (childrenByParent[t.task_id] ?? []).length;
		const msg = childCount
			? `Delete this task and its ${childCount} subtask${childCount === 1 ? '' : 's'}?`
			: 'Delete this task?';
		if (!confirm(msg)) return;
		const res = await WarRoomTasksService.remove(warRoomId, t.task_id);
		if (res.ok) removeTaskLocally(t.task_id);
	};

	// -------- Board --------
	// A leading "No status" column so an untriaged task is visible and can
	// be dragged out of limbo — and back into it.
	const boardColumns = $derived<KanbanColumn[]>([
		{ id: null, title: 'No status', bscolor: 'muted' },
		...statuses.map((s) => ({
			id: s.id,
			title: s.status_name,
			bscolor: s.status_bscolor
		}))
	]);

	const boardParentTitle = (parentId: number) =>
		boardTasks.find((x) => x.task_id === parentId)?.title ?? `#${parentId}`;

	/**
	 * Replace a row in every local collection that already holds it.
	 * Deliberately never inserts: seeding `childrenByParent[pid]` with a
	 * lone child would make `loadChildren` treat that bucket as fully
	 * loaded and hide the parent's other subtasks.
	 */
	function syncTaskInPlace(next: WarRoomTask) {
		boardTasks = boardTasks.map((x) => (x.task_id === next.task_id ? next : x));
		parents = parents.map((x) => (x.task_id === next.task_id ? next : x));
		const pid = next.parent_task_id;
		if (pid != null && childrenByParent[pid]) {
			childrenByParent = {
				...childrenByParent,
				[pid]: childrenByParent[pid].map((x) => (x.task_id === next.task_id ? next : x))
			};
		}
	}

	const moveBoardTask = async (task: WarRoomTask, statusId: number | null) => {
		const previous = task.status_id;
		// Optimistic: the card lands in the new column on drop, not after
		// the round-trip.
		boardTasks = boardTasks.map((x) =>
			x.task_id === task.task_id ? { ...x, status_id: statusId } : x
		);

		const res = await WarRoomTasksService.update(warRoomId, task.task_id, {
			status_id: statusId
		});

		if (res.ok && res.data && typeof res.data !== 'string') {
			syncTaskInPlace(res.data as WarRoomTask);
			return;
		}

		boardTasks = boardTasks.map((x) =>
			x.task_id === task.task_id ? { ...x, status_id: previous } : x
		);
		toast({
			title: typeof res.error === 'string' ? res.error : 'Could not move task',
			variant: 'destructive'
		});
	};

	// -------- Drag to reparent --------
	function onDragStart(e: DragEvent, t: WarRoomTask) {
		if (!e.dataTransfer) return;
		draggedTaskId = t.task_id;
		e.dataTransfer.effectAllowed = 'move';
		// Firefox needs data set on the transfer for drag to fire at all.
		e.dataTransfer.setData('text/plain', String(t.task_id));
	}

	function onDragEnd() {
		draggedTaskId = null;
		dropTargetKey = null;
	}

	function canDropOn(target: 'top' | { parentId: number }): boolean {
		if (draggedTaskId == null) return false;
		const dragged = findTask(draggedTaskId);
		if (!dragged) return false;
		if (target === 'top') {
			// Only meaningful when the dragged task is currently a subtask.
			return dragged.parent_task_id != null;
		}
		const { parentId } = target;
		if (dragged.task_id === parentId) return false;
		// Can't drop onto its current parent (no-op).
		if (dragged.parent_task_id === parentId) return false;
		// Can't demote a task that already has subtasks.
		if ((childrenByParent[dragged.task_id] ?? []).length > 0) return false;
		// The candidate parent must itself be a top-level row (single-level).
		const parent = findTask(parentId);
		if (!parent || parent.parent_task_id != null) return false;
		return true;
	}

	function findTask(taskId: number): WarRoomTask | null {
		const p = parents.find((x) => x.task_id === taskId);
		if (p) return p;
		for (const arr of Object.values(childrenByParent)) {
			const c = arr.find((x) => x.task_id === taskId);
			if (c) return c;
		}
		return null;
	}

	function onDragOver(e: DragEvent, target: 'top' | { parentId: number }, key: string) {
		if (!canDropOn(target)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTargetKey = key;
	}

	function onDragLeave(key: string) {
		if (dropTargetKey === key) dropTargetKey = null;
	}

	async function onDrop(e: DragEvent, target: 'top' | { parentId: number }) {
		e.preventDefault();
		const id = draggedTaskId;
		draggedTaskId = null;
		dropTargetKey = null;
		if (id == null) return;
		if (!canDropOn(target)) return;
		const dragged = findTask(id);
		if (!dragged) return;
		const newParent = target === 'top' ? null : target.parentId;

		_reparenting = true;
		const res = await WarRoomTasksService.update(warRoomId, id, {
			parent_task_id: newParent
		});
		_reparenting = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTask;
			removeTaskLocally(id);
			upsertTask(next);
			if (newParent == null) totalParents += 1;
			// Refresh the destination parent's subtask cache so counts on
			// the row match reality (we appended to the local bucket, but
			// the server view is the source of truth).
			if (newParent != null) {
				expanded.add(newParent);
				expanded = new Set(expanded);
				loadChildren(newParent, true);
			}
			toast({ title: newParent == null ? 'Promoted to top-level' : 'Moved under parent' });
		} else {
			const msg = typeof res.error === 'string' ? res.error : 'Could not reparent';
			toast({ title: msg, variant: 'destructive' });
		}
	}

	// -------- Tag helpers --------
	function parseTags(raw: string | null | undefined): string[] {
		if (!raw) return [];
		const seen = new Set<string>();
		const out: string[] = [];
		for (const t of raw.split(',')) {
			const s = t.trim();
			if (!s) continue;
			const k = s.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(s);
		}
		return out;
	}

	function addTag(raw: string) {
		const s = raw.trim().replace(/,+$/, '').trim();
		if (!s) return;
		const k = s.toLowerCase();
		if (form.tags.some((t) => t.toLowerCase() === k)) return;
		form.tags = [...form.tags, s];
	}

	function removeTag(t: string) {
		form.tags = form.tags.filter((x) => x !== t);
	}

	function onTagKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (tagInput.trim()) {
				addTag(tagInput);
				tagInput = '';
			}
		} else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
			form.tags = form.tags.slice(0, -1);
		}
	}

	const tagSuggestions = $derived.by(() => {
		const needle = tagInput.trim().toLowerCase();
		const already = new Set(form.tags.map((t) => t.toLowerCase()));
		return usedTags
			.filter((t) => !already.has(t.toLowerCase()))
			.filter((t) => (needle ? t.toLowerCase().includes(needle) : true))
			.slice(0, 8);
	});

	// -------- Grouping --------
	// Filtering happens server-side; the client just groups the current
	// page of parents with any lazily-loaded children.
	type Family = { parent: WarRoomTask; children: WarRoomTask[] };

	const families = $derived.by<Family[]>(() =>
		parents.map((p) => ({
			parent: p,
			children: childrenByParent[p.task_id] ?? []
		}))
	);

	const openFamilies = $derived(families.filter((f) => !f.parent.closed_at));
	const closedFamilies = $derived(families.filter((f) => !!f.parent.closed_at));

	const activeFilterCount = $derived(
		(searchDebounced.trim() ? 1 : 0) +
			selectedStatusIds.length +
			selectedTags.length +
			selectedAssignees.length +
			(dueFrom || dueTo ? 1 : 0)
	);

	function clearFilters() {
		search = '';
		searchDebounced = '';
		selectedStatusIds = [];
		selectedTags = [];
		selectedAssignees = [];
		dueFrom = '';
		dueTo = '';
		includeNoDue = true;
	}

	function toggleFilterInSet<T>(arr: T[], value: T): T[] {
		return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
	}

	async function toggleExpand(id: number) {
		if (expanded.has(id)) {
			expanded.delete(id);
			expanded = new Set(expanded);
			return;
		}
		expanded.add(id);
		expanded = new Set(expanded);
		await loadChildren(id);
	}

	// -------- Assignee dropdown --------
	const assigneeLabel = $derived.by(() => {
		if (form.assigneeId == null) return 'Unassigned';
		const u = users.find((x) => x.user_id === form.assigneeId);
		return u ? u.user_name || u.user_login : `User #${form.assigneeId}`;
	});

	const userMatches = $derived.by(() => {
		const needle = assigneeSearch.trim().toLowerCase();
		if (!needle) return users.slice(0, 50);
		return users
			.filter((u) => (u.user_login + ' ' + u.user_name).toLowerCase().includes(needle))
			.slice(0, 50);
	});

	const statusLabel = $derived.by(() => {
		if (form.statusId == null) return 'No status';
		return statuses.find((s) => s.id === form.statusId)?.status_name ?? '—';
	});

	function userDisplay(id: number | null): string {
		if (id == null) return 'Unassigned';
		const u = users.find((x) => x.user_id === id);
		return u ? u.user_name || u.user_login : `User #${id}`;
	}

	function statusBadgeVariant(bs: string | null | undefined) {
		switch ((bs ?? '').toLowerCase()) {
			case 'success':
			case 'green':
				return 'green' as const;
			case 'danger':
			case 'red':
				return 'destructive' as const;
			case 'warning':
			case 'yellow':
			case 'orange':
				return 'secondary' as const;
			default:
				return 'outline' as const;
		}
	}
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Tasks</h2>
			<p class="text-xs text-muted-foreground">
				War-room-level coordination tasks with subtasks, statuses, tags and search.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-0.5 rounded-md border p-0.5">
				<Button
					size="icon"
					variant={viewMode === 'list' ? 'secondary' : 'ghost'}
					class="h-7 w-7"
					onclick={() => (viewMode = 'list')}
					aria-label="List view"
					title="List view"
				>
					<Rows3 class="h-4 w-4" />
				</Button>
				<Button
					size="icon"
					variant={viewMode === 'board' ? 'secondary' : 'ghost'}
					class="h-7 w-7"
					onclick={() => (viewMode = 'board')}
					aria-label="Board view"
					title="Board view — drag cards to change status"
				>
					<Columns3 class="h-4 w-4" />
				</Button>
			</div>
			<Button onclick={() => openCreate(null)}>
				<Plus class="mr-1 h-4 w-4" /> New task
			</Button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<div class="relative min-w-[220px] flex-1">
			<Search class="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input
				value={search}
				oninput={(e) => (search = (e.target as HTMLInputElement).value)}
				placeholder="Search tasks…"
				class="pl-8 pr-8"
			/>
			{#if search}
				<button
					type="button"
					class="absolute right-2 top-2.5 rounded-full text-muted-foreground hover:text-foreground"
					onclick={() => (search = '')}
					aria-label="Clear search"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>

		<Popover bind:open={filtersOpen}>
			<PopoverTrigger>
				<Button variant="outline" size="sm" class="gap-1">
					Filters
					{#if activeFilterCount > 0}
						<span
							class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground"
						>
							{activeFilterCount}
						</span>
					{/if}
				</Button>
			</PopoverTrigger>
			<PopoverContent class="w-[300px] p-3">
				<div class="flex flex-col gap-3">
					<div>
						<p class="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Status
						</p>
						<div class="flex flex-wrap gap-1">
							{#each statuses as s (s.id)}
								{@const on = selectedStatusIds.includes(s.id)}
								<button
									type="button"
									class="rounded-md border px-2 py-0.5 text-xs {on
										? 'border-primary bg-primary text-primary-foreground'
										: 'hover:bg-muted'}"
									onclick={() => (selectedStatusIds = toggleFilterInSet(selectedStatusIds, s.id))}
								>
									{s.status_name}
								</button>
							{/each}
							{#if statuses.length === 0}
								<span class="text-2xs text-muted-foreground">No statuses configured.</span>
							{/if}
						</div>
					</div>

					<div>
						<p class="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Tags
						</p>
						<div class="flex flex-wrap gap-1">
							{#each usedTags as t}
								{@const on = selectedTags.some((x) => x.toLowerCase() === t.toLowerCase())}
								<button
									type="button"
									class="rounded-md border px-2 py-0.5 text-xs {on
										? 'border-primary bg-primary text-primary-foreground'
										: 'hover:bg-muted'}"
									onclick={() => (selectedTags = toggleFilterInSet(selectedTags, t))}
								>
									#{t}
								</button>
							{/each}
							{#if usedTags.length === 0}
								<span class="text-2xs text-muted-foreground">No tags in use yet.</span>
							{/if}
						</div>
					</div>

					<div>
						<p class="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							Assignee
						</p>
						<div class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
							<button
								type="button"
								class="flex items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
								onclick={() => (selectedAssignees = toggleFilterInSet(selectedAssignees, null))}
							>
								<span class="italic">Unassigned</span>
								{#if selectedAssignees.includes(null)}
									<Check class="h-3.5 w-3.5" />
								{/if}
							</button>
							{#each users as u (u.user_id)}
								{@const on = selectedAssignees.includes(u.user_id)}
								<button
									type="button"
									class="flex items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
									onclick={() =>
										(selectedAssignees = toggleFilterInSet(selectedAssignees, u.user_id))}
								>
									<span>{u.user_name || u.user_login}</span>
									{#if on}
										<Check class="h-3.5 w-3.5" />
									{/if}
								</button>
							{/each}
						</div>
					</div>

					<div>
						<p class="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							<CalendarIcon class="mr-0.5 inline h-3 w-3" /> Due date
						</p>
						<div class="flex items-center gap-2">
							<Input
								type="date"
								value={dueFrom}
								oninput={(e) => (dueFrom = (e.target as HTMLInputElement).value)}
								class="h-8 text-xs"
							/>
							<span class="text-2xs text-muted-foreground">→</span>
							<Input
								type="date"
								value={dueTo}
								oninput={(e) => (dueTo = (e.target as HTMLInputElement).value)}
								class="h-8 text-xs"
							/>
						</div>
						{#if dueFrom || dueTo}
							<label class="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
								<input
									type="checkbox"
									checked={includeNoDue}
									onchange={(e) => (includeNoDue = (e.target as HTMLInputElement).checked)}
								/>
								Include tasks with no due date
							</label>
						{/if}
					</div>

					{#if activeFilterCount > 0}
						<Button variant="ghost" size="sm" onclick={clearFilters}>Clear filters</Button>
					{/if}
				</div>
			</PopoverContent>
		</Popover>

		{#if activeFilterCount > 0}
			<Button variant="ghost" size="sm" onclick={clearFilters} class="text-muted-foreground">
				Clear
			</Button>
		{/if}
	</div>

	{#if activeFilterCount > 0}
		<div class="flex flex-wrap items-center gap-1 text-xs">
			{#each selectedStatusIds as sid}
				{@const s = statuses.find((x) => x.id === sid)}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 hover:bg-muted"
					onclick={() => (selectedStatusIds = selectedStatusIds.filter((x) => x !== sid))}
				>
					{s?.status_name ?? '—'}
					<X class="h-3 w-3" />
				</button>
			{/each}
			{#each selectedTags as t}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 hover:bg-muted"
					onclick={() => (selectedTags = selectedTags.filter((x) => x !== t))}
				>
					#{t}
					<X class="h-3 w-3" />
				</button>
			{/each}
			{#each selectedAssignees as a}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 hover:bg-muted"
					onclick={() => (selectedAssignees = selectedAssignees.filter((x) => x !== a))}
				>
					{userDisplay(a)}
					<X class="h-3 w-3" />
				</button>
			{/each}
			{#if dueFrom || dueTo}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 hover:bg-muted"
					onclick={() => {
						dueFrom = '';
						dueTo = '';
					}}
				>
					<CalendarIcon class="h-3 w-3" />
					{dueFrom || '…'} → {dueTo || '…'}
					<X class="h-3 w-3" />
				</button>
			{/if}
		</div>
	{/if}

	{#if viewMode === 'board'}
		{#if boardLoading}
			<div class="flex min-h-0 flex-1 gap-3">
				{#each Array(4) as _}
					<Skeleton class="h-full w-72 shrink-0 rounded-lg" />
				{/each}
			</div>
		{:else}
			<div class="min-h-0 flex-1">
				<TaskKanbanBoard
					columns={boardColumns}
					items={boardTasks}
					idOf={(t) => t.task_id}
					columnIdOf={(t) => t.status_id}
					onMove={moveBoardTask}
					onActivate={openEdit}
					card={boardCard}
				/>
			</div>
			<p class="shrink-0 text-2xs text-muted-foreground">
				{boardTasks.length} task{boardTasks.length === 1 ? '' : 's'}, subtasks included · Drag a
				card to another column to change its status, or focus one and press Ctrl/⌘ + ← →.
			</p>
		{/if}
	{:else if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-12 w-full" />
			{/each}
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#if draggedTaskId != null && findTask(draggedTaskId)?.parent_task_id != null}
				<button
					type="button"
					class="flex items-center justify-center gap-2 rounded-md border-2 border-dashed py-2 text-xs text-muted-foreground {dropTargetKey ===
					'top'
						? 'border-primary bg-primary/10 text-primary'
						: ''}"
					ondragover={(e) => onDragOver(e, 'top', 'top')}
					ondragleave={() => onDragLeave('top')}
					ondrop={(e) => onDrop(e, 'top')}
				>
					<ArrowUpFromLine class="h-3.5 w-3.5" />
					Drop here to promote to a top-level task
				</button>
			{/if}

			<section>
				<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Open ({openFamilies.length})
				</h3>
				{#if openFamilies.length === 0}
					<p class="text-sm text-muted-foreground">
						{activeFilterCount > 0 ? 'No tasks match filters.' : 'No open tasks.'}
					</p>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each openFamilies as fam (fam.parent.task_id)}
							{@const isExpanded = expanded.has(fam.parent.task_id)}
							{@render taskRow(fam.parent, fam.children, isExpanded)}
							{#if isExpanded && fam.children.length}
								{#each fam.children as child (child.task_id)}
									{@render subtaskRow(child)}
								{/each}
							{/if}
						{/each}
					</ul>
				{/if}
			</section>

			{#if closedFamilies.length > 0}
				<section>
					<h3 class="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Closed ({closedFamilies.length})
					</h3>
					<ul class="flex flex-col gap-1.5">
						{#each closedFamilies as fam (fam.parent.task_id)}
							{@const isExpanded = expanded.has(fam.parent.task_id)}
							{@render taskRow(fam.parent, fam.children, isExpanded, true)}
							{#if isExpanded && fam.children.length}
								{#each fam.children as child (child.task_id)}
									{@render subtaskRow(child)}
								{/each}
							{/if}
						{/each}
					</ul>
				</section>
			{/if}

			<div class="flex items-center justify-between border-t pt-2 text-2xs text-muted-foreground">
				<span>
					Showing {parents.length} of {totalParents} task{totalParents === 1 ? '' : 's'}
				</span>
				{#if nextPage != null}
					<Button variant="outline" size="sm" onclick={loadNextPage} disabled={loadingMore}>
						{loadingMore ? 'Loading…' : `Load more (${totalParents - parents.length} left)`}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

{#snippet taskRow(
	t: WarRoomTask,
	children: WarRoomTask[],
	isExpanded: boolean,
	dim: boolean = false
)}
	{@const dropKey = `parent:${t.task_id}`}
	{@const isDropTarget = dropTargetKey === dropKey}
	{@const isDragging = draggedTaskId === t.task_id}
	<li
		class="group flex items-center gap-2 rounded-md border px-3 py-2 transition-colors {dim
			? 'bg-card/20 text-muted-foreground'
			: 'bg-card/40'} {isDragging ? 'opacity-40' : ''} {isDropTarget
			? 'border-primary bg-primary/10'
			: ''}"
		ondragover={(e) => onDragOver(e, { parentId: t.task_id }, dropKey)}
		ondragleave={() => onDragLeave(dropKey)}
		ondrop={(e) => onDrop(e, { parentId: t.task_id })}
	>
		<span
			class="cursor-grab opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
			draggable="true"
			ondragstart={(e) => onDragStart(e, t)}
			ondragend={onDragEnd}
			aria-label="Drag task"
			role="button"
			tabindex="-1"
		>
			<GripVertical class="h-3.5 w-3.5 text-muted-foreground" />
		</span>

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={() => toggle(t)}
			aria-label={t.closed_at ? 'Reopen task' : 'Close task'}
		>
			{#if t.closed_at}
				<Check class="h-3.5 w-3.5 text-green-600" />
			{:else}
				<CircleDot class="h-3.5 w-3.5" />
			{/if}
		</Button>

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={() => toggleExpand(t.task_id)}
			aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
		>
			{#if isExpanded}
				<ChevronDown class="h-3.5 w-3.5" />
			{:else}
				<ChevronRight class="h-3.5 w-3.5" />
			{/if}
		</Button>

		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				<p class="truncate text-sm {dim ? 'line-through' : ''}">{t.title}</p>
				{#if t.status_name}
					<Badge variant={statusBadgeVariant(t.status_bscolor)} class="h-4 px-1.5 py-0 text-2xs">
						{t.status_name}
					</Badge>
				{/if}
				{#if children.length > 0}
					<span class="rounded-full bg-muted px-1.5 py-0 text-2xs text-muted-foreground">
						{children.filter((c) => !c.closed_at).length}/{children.length}
					</span>
				{/if}
				{#each parseTags(t.tags) as tag}
					<span class="rounded bg-muted px-1.5 py-0 text-2xs text-muted-foreground">
						#{tag}
					</span>
				{/each}
			</div>
			<p class="line-clamp-1 text-2xs text-muted-foreground">
				{#if t.assignee_name}
					<span class="font-medium text-foreground">{t.assignee_name}</span>
				{:else}
					<span class="italic">Unassigned</span>
				{/if}
				{#if t.created_by_name}
					<span class="opacity-60">·</span>
					created by {t.created_by_name}
				{/if}
				{#if dim && t.closed_by_name}
					<span class="opacity-60">·</span>
					closed by {t.closed_by_name}
				{/if}
				{#if t.description}
					<span class="opacity-60">·</span>
					{t.description}
				{/if}
			</p>
		</div>
		{#if t.due_at}
			<span class="shrink-0 text-2xs text-muted-foreground">
				Due {new Date(t.due_at).toLocaleDateString()}
			</span>
		{/if}
		{#if !t.closed_at}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={() => openCreate(t.task_id)}
				aria-label="Add subtask"
			>
				<CornerDownRight class="h-3.5 w-3.5" />
			</Button>
		{/if}
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={() => openEdit(t)}
			aria-label="Edit task"
		>
			<Pencil class="h-3.5 w-3.5" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 text-destructive hover:text-destructive"
			onclick={() => remove(t)}
			aria-label="Delete"
		>
			<Trash2 class="h-3.5 w-3.5" />
		</Button>
	</li>
{/snippet}

{#snippet subtaskRow(t: WarRoomTask)}
	{@const isDragging = draggedTaskId === t.task_id}
	<li
		class="group ml-8 flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 {t.closed_at
			? 'bg-card/10 text-muted-foreground'
			: 'bg-card/30'} {isDragging ? 'opacity-40' : ''}"
	>
		<span
			class="cursor-grab opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
			draggable="true"
			ondragstart={(e) => onDragStart(e, t)}
			ondragend={onDragEnd}
			aria-label="Drag subtask"
			role="button"
			tabindex="-1"
		>
			<GripVertical class="h-3 w-3 text-muted-foreground" />
		</span>

		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={() => toggle(t)}
			aria-label={t.closed_at ? 'Reopen subtask' : 'Close subtask'}
		>
			{#if t.closed_at}
				<Check class="h-3.5 w-3.5 text-green-600" />
			{:else}
				<CircleDot class="h-3.5 w-3.5" />
			{/if}
		</Button>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				<p class="truncate text-sm {t.closed_at ? 'line-through' : ''}">{t.title}</p>
				{#if t.status_name}
					<Badge variant={statusBadgeVariant(t.status_bscolor)} class="h-4 px-1.5 py-0 text-2xs">
						{t.status_name}
					</Badge>
				{/if}
				{#each parseTags(t.tags) as tag}
					<span class="rounded bg-muted px-1.5 py-0 text-2xs text-muted-foreground">
						#{tag}
					</span>
				{/each}
			</div>
			<p class="line-clamp-1 text-2xs text-muted-foreground">
				{#if t.assignee_name}
					<span class="font-medium text-foreground">{t.assignee_name}</span>
				{:else}
					<span class="italic">Unassigned</span>
				{/if}
				{#if t.description}
					<span class="opacity-60">·</span>
					{t.description}
				{/if}
			</p>
		</div>
		{#if t.due_at}
			<span class="shrink-0 text-2xs text-muted-foreground">
				Due {new Date(t.due_at).toLocaleDateString()}
			</span>
		{/if}
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			onclick={() => openEdit(t)}
			aria-label="Edit subtask"
		>
			<Pencil class="h-3.5 w-3.5" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 text-destructive hover:text-destructive"
			onclick={() => remove(t)}
			aria-label="Delete subtask"
		>
			<Trash2 class="h-3.5 w-3.5" />
		</Button>
	</li>
{/snippet}

<!--
  Board cards are flat: parents and subtasks sit in the same column,
  so a subtask spells out who its parent is rather than relying on the
  indentation the list view uses.
-->
{#snippet boardCard(t: WarRoomTask)}
	<div class="flex items-start gap-1.5">
		{#if t.closed_at}
			<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
		{/if}
		<p class="line-clamp-2 text-xs font-medium {t.closed_at ? 'line-through opacity-70' : ''}">
			{t.title}
		</p>
	</div>

	{#if t.parent_task_id != null}
		<p class="mt-1 flex items-center gap-1 truncate text-2xs text-muted-foreground">
			<CornerUpRight class="h-3 w-3 shrink-0" />
			<span class="truncate">subtask of {boardParentTitle(t.parent_task_id)}</span>
		</p>
	{/if}

	<div class="mt-1 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
		<span>#{t.task_id}</span>
		{#each parseTags(t.tags) as tag}
			<span class="rounded bg-muted px-1">#{tag}</span>
		{/each}
	</div>

	<div class="mt-1.5 flex items-center gap-2 text-2xs text-muted-foreground">
		{#if t.assignee_name}
			<span class="truncate font-medium text-foreground">{t.assignee_name}</span>
		{:else}
			<span class="italic">Unassigned</span>
		{/if}
		{#if t.due_at}
			<span class="ml-auto shrink-0">Due {new Date(t.due_at).toLocaleDateString()}</span>
		{/if}
	</div>
{/snippet}

<Dialog bind:open={dialogOpen}>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>
				{dialogMode === 'create'
					? form.parentTaskId != null
						? 'New subtask'
						: 'New task'
					: 'Edit task'}
			</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			{#if form.parentTaskId != null}
				{@const parent = findTask(form.parentTaskId)}
				<div class="rounded-md border bg-muted/40 px-3 py-2 text-xs">
					<span class="text-muted-foreground">Subtask of:</span>
					<span class="ml-1 font-medium">{parent?.title ?? '—'}</span>
				</div>
			{/if}
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-title">Title</label>
				<Input
					id="task-title"
					value={form.title}
					oninput={(e) => (form.title = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="task-description">
					Description
				</label>
				<Input
					id="task-description"
					value={form.description}
					oninput={(e) => (form.description = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<span class="text-xs font-medium text-muted-foreground">Status</span>
					<Popover bind:open={statusOpen}>
						<PopoverTrigger class="mt-1 w-full">
							<span
								class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-left text-sm font-normal hover:bg-accent hover:text-accent-foreground"
							>
								<span class="truncate">{statusLabel}</span>
							</span>
						</PopoverTrigger>
						<PopoverContent class="w-[--bits-popover-anchor-width] p-1">
							<button
								type="button"
								class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
								onclick={() => {
									form.statusId = null;
									statusOpen = false;
								}}
							>
								<span class="italic text-muted-foreground">No status</span>
							</button>
							{#each statuses as s (s.id)}
								<button
									type="button"
									class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
									onclick={() => {
										form.statusId = s.id;
										statusOpen = false;
									}}
								>
									{s.status_name}
								</button>
							{/each}
						</PopoverContent>
					</Popover>
				</div>

				<div>
					<label class="text-xs font-medium text-muted-foreground" for="task-due">
						Due (optional)
					</label>
					<Input
						id="task-due"
						type="date"
						value={form.due}
						oninput={(e) => (form.due = (e.target as HTMLInputElement).value)}
						class="mt-1"
					/>
				</div>
			</div>

			<div>
				<span class="text-xs font-medium text-muted-foreground">Assignee</span>
				<div class="mt-1 flex items-center gap-1">
					<Popover bind:open={assigneeOpen}>
						<PopoverTrigger class="flex-1">
							<span
								class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-left text-sm font-normal hover:bg-accent hover:text-accent-foreground"
							>
								<span class="truncate">{assigneeLabel}</span>
							</span>
						</PopoverTrigger>
						<PopoverContent class="w-[--bits-popover-anchor-width] p-0">
							<div class="flex items-center border-b px-2">
								<Search class="h-3.5 w-3.5 text-muted-foreground" />
								<Input
									value={assigneeSearch}
									oninput={(e) => (assigneeSearch = (e.target as HTMLInputElement).value)}
									placeholder="Search users…"
									class="h-9 border-0 shadow-none focus-visible:ring-0"
								/>
							</div>
							<div class="max-h-64 overflow-y-auto py-1">
								<button
									type="button"
									class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
									onclick={() => {
										form.assigneeId = null;
										assigneeOpen = false;
									}}
								>
									<span class="italic text-muted-foreground">Unassigned</span>
								</button>
								{#each userMatches as u (u.user_id)}
									<button
										type="button"
										class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
										onclick={() => {
											form.assigneeId = u.user_id;
											assigneeOpen = false;
										}}
									>
										<span class="font-medium">{u.user_name || u.user_login}</span>
										{#if u.user_name && u.user_login !== u.user_name}
											<span class="ml-1 text-xs text-muted-foreground">
												@{u.user_login}
											</span>
										{/if}
									</button>
								{:else}
									<p class="px-3 py-2 text-xs text-muted-foreground">No users match.</p>
								{/each}
							</div>
						</PopoverContent>
					</Popover>
					{#if form.assigneeId != null}
						<Button
							variant="ghost"
							size="icon"
							class="h-9 w-9 shrink-0"
							onclick={() => (form.assigneeId = null)}
							aria-label="Clear assignee"
						>
							<X class="h-4 w-4" />
						</Button>
					{/if}
				</div>
			</div>

			<div>
				<span class="text-xs font-medium text-muted-foreground">
					<TagIcon class="mr-1 inline h-3 w-3" /> Tags
				</span>
				<div
					class="mt-1 flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
				>
					{#each form.tags as tag}
						<span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
							#{tag}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground"
								onclick={() => removeTag(tag)}
								aria-label={`Remove tag ${tag}`}
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
					<input
						type="text"
						class="min-w-[100px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						placeholder={form.tags.length ? '' : 'Add a tag and press Enter…'}
						value={tagInput}
						oninput={(e) => (tagInput = (e.target as HTMLInputElement).value)}
						onkeydown={onTagKey}
						onblur={() => {
							if (tagInput.trim()) {
								addTag(tagInput);
								tagInput = '';
							}
						}}
					/>
				</div>
				{#if tagSuggestions.length > 0 && tagInput.trim()}
					<div class="mt-1 flex flex-wrap gap-1">
						{#each tagSuggestions as t}
							<button
								type="button"
								class="rounded border bg-background px-2 py-0.5 text-2xs hover:bg-muted"
								onclick={() => {
									addTag(t);
									tagInput = '';
								}}
							>
								+ #{t}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (dialogOpen = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submit} disabled={saving || !form.title.trim()}>
				{saving ? 'Saving…' : dialogMode === 'create' ? 'Create' : 'Save'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
