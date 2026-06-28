<!--
  Floating mention dropdown for the chat composer.

  Watches the bound textarea: when the operator types `@` or `#` at a
  word boundary, we pop a list aligned under the caret with matching
  items. `@` resolves to users (workspace-wide); `#` resolves to
  resources (events / IOCs / assets / tasks / notes) across every case
  attached to this war room.

  On select we splice the trigger + query out of the textarea and
  insert a markdown link — `@username` becomes a plain `@User Name`
  string (no link), `#Asset name` becomes the same attachment markdown
  the paperclip picker emits, which `ChatMessageBody` already renders
  as an inline card.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MentionList, {
		type MentionItem
	} from '$lib/components/common/MarkDown/MentionList.svelte';
	import { UsersService, type User } from '$lib/services/users.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';
	import type { WarRoomCaseAttachment } from '$lib/services/war-rooms.service';

	type Props = {
		textarea: HTMLTextAreaElement | null;
		body: string;
		attachedCases: WarRoomCaseAttachment[];
		onChangeBody: (next: string) => void;
	};
	let { textarea, body, attachedCases, onChangeBody }: Props = $props();

	type Trigger = 'user' | 'resource' | 'slash';

	// Static catalogue of slash commands that get autocompleted in the
	// composer. The labels are short on purpose — the MentionList row
	// shows the command in the main slot, the sub-label is a hint about
	// the expected argument.
	const SLASH_COMMANDS_LIST: {
		cmd: string;
		usage: string;
		desc: string;
	}[] = [
		{ cmd: '/note', usage: '/note <text>', desc: 'Pin a quick note in the stream' },
		{ cmd: '/pin', usage: '/pin <text>', desc: 'Highlight a message' },
		{
			cmd: '/decision',
			usage: '/decision <what we decided>',
			desc: 'Log a command decision (lifted into SitReps)'
		},
		{
			cmd: '/attach',
			usage: '/attach <case_id> [reason]',
			desc: 'Attach a case to the war room'
		},
		{
			cmd: '/detach',
			usage: '/detach <case_id>',
			desc: 'Detach a case from the war room'
		},
		{ cmd: '/task', usage: '/task [@user] <title>', desc: 'Create a war-room task' },
		{
			cmd: '/assign',
			usage: '/assign @user <title>',
			desc: 'Create a task and assign it to a user'
		},
		{ cmd: '/sitrep', usage: '/sitrep <title>', desc: 'Start a SitRep draft' },
		{
			cmd: '/summary',
			usage: '/summary [headline]',
			desc: 'Auto-fill a SitRep from the current war-room snapshot'
		},
		{
			cmd: '/state',
			usage: '/state <open|active|standby|closed>',
			desc: 'Flip the war-room lifecycle state'
		},
		{
			cmd: '/priority',
			usage: '/priority <low|medium|high|critical>',
			desc: 'Stamp a priority banner (high/critical also flips state to active)'
		},
		{
			cmd: '/thread',
			usage: '/thread <title>',
			desc: 'Open a named topic that operators can follow + reply to'
		},
		{ cmd: '/help', usage: '/help', desc: 'List all available slash commands' }
	];

	let open = $state(false);
	let trigger = $state<Trigger>('user');
	let query = $state('');
	let triggerStart = $state(0); // index of the `@` or `#`
	let items = $state<MentionItem[]>([]);
	let selectedIndex = $state(0);
	let popupTop = $state(0);
	let popupLeft = $state(0);

	// --- Resource cache. We pre-cache once the attached cases land so the
	// popup doesn't show empty / loading state when the user hits `#`.
	let userCache: User[] | null = null;
	let userCachePromise: Promise<User[]> | null = null;

	const loadUsers = async (): Promise<User[]> => {
		if (userCache) return userCache;
		if (!userCachePromise) {
			userCachePromise = (async () => {
				const res = await UsersService.list();
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: User[] } | User[];
					const arr = Array.isArray(payload)
						? payload
						: Array.isArray((payload as { data?: User[] }).data)
							? ((payload as { data: User[] }).data)
							: [];
					userCache = arr;
					return arr;
				}
				userCache = [];
				return [];
			})();
		}
		return userCachePromise;
	};

	type ResourceItem = MentionItem & {
		resourceKind: 'event' | 'ioc' | 'asset' | 'task' | 'note';
		caseId: number;
	};
	let resourceCache: ResourceItem[] | null = null;
	let resourcePromise: Promise<ResourceItem[]> | null = null;

	const loadResources = async (): Promise<ResourceItem[]> => {
		if (resourceCache) return resourceCache;
		if (!resourcePromise) {
			resourcePromise = (async () => {
				const out: ResourceItem[] = [];
				// Fan-out, modest per-kind cap so a huge case doesn't crowd
				// out the others in the dropdown.
				const PER_KIND = 12;
				for (const att of attachedCases) {
					const caseId = att.case_id;
					try {
						const [evRes, iocRes, assetRes, taskRes] = await Promise.all([
							CaseTimelineService.listEvents(
								caseId,
								{},
								{},
								{ per_page: PER_KIND }
							),
							CaseIocsService.list(caseId, { per_page: PER_KIND }),
							CaseAssetsService.list(caseId, { per_page: PER_KIND }),
							CaseTasksService.list(caseId, { per_page: PER_KIND })
						]);

						if (evRes.ok && evRes.data && typeof evRes.data !== 'string') {
							const payload = evRes.data as {
								timeline?: Array<Record<string, unknown>>;
							};
							for (const e of payload.timeline ?? []) {
								const id = Number((e as { event_id: number }).event_id);
								const label =
									String((e as { event_title?: string }).event_title ?? '') ||
									`Event #${id}`;
								out.push({
									id: `${caseId}-event-${id}`,
									label,
									sublabel: `Case #${caseId}`,
									kind: 'note',
									resourceKind: 'event',
									caseId
								} satisfies ResourceItem);
							}
						}

						if (iocRes.ok && iocRes.data && typeof iocRes.data !== 'string') {
							const payload = iocRes.data as unknown as {
								data?: Array<Record<string, unknown>>;
							};
							for (const i of payload.data ?? []) {
								const id = Number((i as { ioc_id: number }).ioc_id);
								const label =
									String((i as { ioc_value?: string }).ioc_value ?? '') ||
									`IOC #${id}`;
								out.push({
									id: `${caseId}-ioc-${id}`,
									label,
									sublabel: `Case #${caseId}`,
									kind: 'ioc',
									resourceKind: 'ioc',
									caseId
								} satisfies ResourceItem);
							}
						}

						if (assetRes.ok && assetRes.data && typeof assetRes.data !== 'string') {
							const payload = assetRes.data as unknown as {
								data?: Array<Record<string, unknown>>;
							};
							for (const a of payload.data ?? []) {
								const id = Number((a as { asset_id: number }).asset_id);
								const label =
									String((a as { asset_name?: string }).asset_name ?? '') ||
									`Asset #${id}`;
								out.push({
									id: `${caseId}-asset-${id}`,
									label,
									sublabel: `Case #${caseId}`,
									kind: 'asset',
									resourceKind: 'asset',
									caseId
								} satisfies ResourceItem);
							}
						}

						if (taskRes.ok && taskRes.data && typeof taskRes.data !== 'string') {
							const payload = taskRes.data as unknown as {
								data?: Array<Record<string, unknown>>;
							};
							for (const t of payload.data ?? []) {
								const id = Number(
									(t as { id?: number; task_id?: number }).id ??
										(t as { task_id?: number }).task_id ??
										0
								);
								const label =
									String((t as { task_title?: string }).task_title ?? '') ||
									`Task #${id}`;
								out.push({
									id: `${caseId}-task-${id}`,
									label,
									sublabel: `Case #${caseId}`,
									kind: 'task',
									resourceKind: 'task',
									caseId
								} satisfies ResourceItem);
							}
						}
					} catch {
						// One case failing shouldn't block the rest.
					}
				}
				resourceCache = out;
				return out;
			})();
		}
		return resourcePromise;
	};

	// Invalidate resource cache when the attached-case set changes — so a
	// freshly-attached case shows up in #-search without a page reload.
	$effect(() => {
		void attachedCases;
		resourceCache = null;
		resourcePromise = null;
	});

	// --- Caret / trigger detection -------------------------------------------

	const detectTrigger = () => {
		if (!textarea) return null;
		const caret = textarea.selectionStart;
		const text = textarea.value.slice(0, caret);

		// Slash commands only autocomplete when they're the leading
		// token of the message — that's the same rule the backend uses
		// to dispatch them. A `/` mid-message is just a literal slash.
		if (
			text.length > 0 &&
			text[0] === '/' &&
			!/\s/.test(text) &&
			caret === text.length
		) {
			return {
				start: 0,
				end: caret,
				trigger: 'slash' as Trigger,
				query: text.slice(1)
			};
		}

		// Search backward for the nearest `@` or `#` at a word boundary,
		// stopping at whitespace / newline. Bail if we hit one.
		for (let i = caret - 1; i >= 0; i--) {
			const ch = text[i];
			if (ch === '@' || ch === '#') {
				const prev = i > 0 ? text[i - 1] : '';
				const atWordBoundary = i === 0 || /\s/.test(prev);
				if (!atWordBoundary) return null;
				return {
					start: i,
					end: caret,
					trigger: (ch === '@' ? 'user' : 'resource') as Trigger,
					query: text.slice(i + 1)
				};
			}
			if (/\s/.test(ch)) return null;
		}
		return null;
	};

	const fuzzy = (h: string, n: string) =>
		h.toLowerCase().includes(n.toLowerCase());

	const refresh = async () => {
		if (!textarea) {
			open = false;
			return;
		}
		const t = detectTrigger();
		if (!t) {
			open = false;
			return;
		}
		trigger = t.trigger;
		query = t.query;
		triggerStart = t.start;

		if (t.trigger === 'slash') {
			const q = t.query.trim().toLowerCase();
			const matching = q
				? SLASH_COMMANDS_LIST.filter(
						(c) =>
							c.cmd.slice(1).toLowerCase().startsWith(q) ||
							c.desc.toLowerCase().includes(q)
					)
				: SLASH_COMMANDS_LIST;
			items = matching.map((c) => ({
				id: c.cmd,
				label: c.usage,
				sublabel: c.desc,
				// Reuse the 'task' icon — it visually reads as
				// "actionable command" and matches the existing
				// MentionList icon vocabulary so we don't have to
				// extend the kind enum just for this.
				kind: 'task'
			}));
		} else if (t.trigger === 'user') {
			const users = await loadUsers();
			const q = t.query.trim();
			const filtered = q
				? users.filter(
						(u) => fuzzy(u.user_name, q) || fuzzy(u.user_login, q)
					)
				: users;
			items = filtered.slice(0, 8).map((u) => ({
				id: u.user_id,
				label: u.user_name,
				sublabel: `@${u.user_login}`,
				kind: 'user'
			}));
		} else {
			const all = await loadResources();
			const q = t.query.trim();
			const filtered = q
				? all.filter(
						(r) => fuzzy(r.label, q) || fuzzy(r.sublabel ?? '', q)
					)
				: all;
			items = filtered.slice(0, 10);
		}

		selectedIndex = 0;
		open = items.length > 0;

		// Position the popup under the caret. We approximate via the
		// textarea's bounding rect + line height — accurate enough for a
		// composer that lives at the bottom of the chat.
		if (open) {
			const rect = textarea.getBoundingClientRect();
			popupLeft = rect.left + window.scrollX + 8;
			popupTop = rect.top + window.scrollY - 8; // sit just above the textarea
		}
	};

	const acceptSelected = () => {
		if (!open || items.length === 0 || !textarea) return;
		const item = items[selectedIndex];
		const caret = textarea.selectionStart;
		const before = body.slice(0, triggerStart);
		const after = body.slice(caret);

		let insertion = '';
		if (trigger === 'slash') {
			// Pull the command name out of `item.id` (which is the raw
			// slash command, e.g. `/task`). The trailing space puts the
			// caret right where the argument starts.
			insertion = `${item.id} `;
		} else if (trigger === 'user') {
			insertion = `@${item.sublabel?.replace(/^@/, '') ?? item.label}`;
		} else {
			const r = item as ResourceItem;
			const typeWord =
				r.resourceKind === 'event'
					? 'Event'
					: r.resourceKind === 'ioc'
						? 'IOC'
						: r.resourceKind === 'asset'
							? 'Asset'
							: 'Task';
			const subRoute =
				r.resourceKind === 'event'
					? 'timeline'
					: r.resourceKind === 'ioc'
						? 'iocs'
						: r.resourceKind === 'asset'
							? 'assets'
							: 'tasks';
			insertion = `[${typeWord} "${item.label}"](/case/${r.caseId}/${subRoute})`;
		}

		// Slash completions REPLACE the leading `/` token entirely; @ and
		// # mentions append a trailing space. Either way, the caret lands
		// at the end of the inserted text.
		const tail = trigger === 'slash' ? '' : ' ';
		const next = `${before}${insertion}${trigger === 'slash' ? '' : tail}${after}`;
		onChangeBody(next);
		open = false;

		queueMicrotask(() => {
			if (!textarea) return;
			const newCaret = (before + insertion).length + tail.length;
			textarea.focus();
			textarea.setSelectionRange(newCaret, newCaret);
		});
	};

	export const handleKeydown = (e: KeyboardEvent): boolean => {
		if (!open) return false;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % items.length;
			return true;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex + items.length - 1) % items.length;
			return true;
		}
		if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			acceptSelected();
			return true;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			return true;
		}
		return false;
	};

	export const handleInput = () => {
		void refresh();
	};
</script>

{#if open}
	<div
		class="fixed z-[60] -translate-y-full"
		style:top={`${popupTop}px`}
		style:left={`${popupLeft}px`}
	>
		<MentionList
			{items}
			{selectedIndex}
			onSelect={(item) => {
				const idx = items.findIndex((i) => i === item);
				if (idx >= 0) selectedIndex = idx;
				acceptSelected();
			}}
		/>
	</div>
{/if}
