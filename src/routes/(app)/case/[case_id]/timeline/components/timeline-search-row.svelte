<!--
  One event of the search view, as a log line: the time, the title and a
  `field=value` line. Expanding it shows the description, every field
  with buttons to narrow or exclude the search on it, the raw data and
  the event's actions.

  Rows are drag sources: dropped on a timeline of the sidebar, the
  event — or the whole selection, when the row is part of it — moves
  there.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		CopyIcon,
		EditIcon,
		FileSymlinkIcon,
		FlagIcon,
		ForwardIcon,
		GitBranchIcon,
		GitBranchPlusIcon,
		MessageSquareIcon,
		MinusIcon,
		MoreHorizontalIcon,
		PlusIcon,
		SplineIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type {
		CaseTimelineEvent,
		CaseTimelineSearchEvent
	} from '$lib/services/case-timeline.service';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import type { HookOption } from '$lib/services/hooks.service';
	import { hookOptionKey } from '$lib/utils/hooks';
	import { formatDate, formatDateTime, formatTime } from '$lib/utils/time-formatter';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { eventAccentColor } from '../event-color';
	import { getGraphUrlForEvents, getSharedEventUrl } from '../helpers';
	import { eventTags } from '../search-helpers';

	type Props = {
		event: CaseTimelineSearchEvent;
		timelinesById: Map<number, CaseTimeline>;
		expanded: boolean;
		selected: boolean;
		canEdit?: boolean;
		hookOptions?: HookOption[];
		onToggleExpand: () => void;
		onToggleSelect: (shiftKey: boolean) => void;
		onDragStart: (e: DragEvent) => void;
		onClause: (alias: string, value: string, exclude: boolean) => void;
		onLoadFull: (eventId: number) => Promise<CaseTimelineEvent | null>;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventId: number, flagged: boolean) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventId: number) => void;
		onRunHook: (eventId: number, hookOption: HookOption) => void;
	};

	let {
		event,
		timelinesById,
		expanded,
		selected,
		canEdit = true,
		hookOptions = [],
		onToggleExpand,
		onToggleSelect,
		onDragStart,
		onClause,
		onLoadFull,
		onEdit,
		onAddChild,
		onFlag,
		onComments,
		onDuplicate,
		onDelete,
		onRunHook
	}: Props = $props();

	const accent = $derived(eventAccentColor(event));
	const tags = $derived(eventTags(event));
	const timelineNames = $derived(
		(event.timeline_ids ?? [])
			.map((id) => timelinesById.get(id)?.name)
			.filter((name): name is string => !!name)
	);

	// The search page cuts long descriptions and raw data; the whole text
	// is fetched once, when the analyst asks for it.
	let full = $state<{ content: string; raw: string } | null>(null);
	let loadingFull = $state(false);
	const content = $derived(full?.content ?? event.event_content ?? '');
	const raw = $derived(full?.raw ?? event.event_raw ?? '');
	const truncated = $derived(!full && (event.event_content_truncated || event.event_raw_truncated));

	const loadFull = async () => {
		loadingFull = true;
		try {
			const whole = await onLoadFull(event.event_id);
			if (whole) full = { content: whole.event_content ?? '', raw: whole.event_raw ?? '' };
		} finally {
			loadingFull = false;
		}
	};

	type FieldRow = { label: string; value: string; alias?: string; clauseValue?: string };

	const fieldRows = $derived.by<FieldRow[]>(() => {
		const rows: FieldRow[] = [
			{ label: 'date', value: formatDateTime(event.event_date) },
			{
				label: 'original date',
				value: `${event.event_date_wtz ?? ''} ${event.event_tz ?? ''}`.trim()
			}
		];
		if (event.category_name) {
			rows.push({ label: 'category', value: event.category_name, alias: 'category' });
		}
		if (event.event_source) {
			rows.push({ label: 'source', value: event.event_source, alias: 'source' });
		}
		for (const tag of tags) rows.push({ label: 'tag', value: tag, alias: 'tag' });
		for (const asset of event.assets ?? []) {
			rows.push({
				label: 'asset',
				value: asset.name,
				alias: 'asset',
				clauseValue: asset.asset_name ?? asset.name
			});
		}
		for (const ioc of event.iocs ?? []) {
			rows.push({
				label: 'ioc',
				value: ioc.ioc_value ?? ioc.name,
				alias: 'ioc'
			});
		}
		for (const name of timelineNames)
			rows.push({ label: 'timeline', value: name, alias: 'timeline' });
		if (event.user) rows.push({ label: 'author', value: event.user, alias: 'author' });
		if (event.event_added) rows.push({ label: 'added', value: formatDateTime(event.event_added) });
		rows.push({ label: 'id', value: String(event.event_id), alias: 'id' });
		if (event.parent_event_id) {
			rows.push({ label: 'parent', value: String(event.parent_event_id), alias: 'parent' });
		}
		if (event.event_uuid) rows.push({ label: 'uuid', value: event.event_uuid, alias: 'uuid' });
		return rows.filter((row) => row.value !== '');
	});

	// The collapsed row's `field=value` line. Long lists are cut so a row
	// stays one line; the expanded view has them all.
	const summaryPairs = $derived.by(() => {
		const pairs: { key: string; value: string }[] = [];
		const list = (values: string[]) =>
			values.length > 3
				? `${values.slice(0, 3).join(', ')} +${values.length - 3}`
				: values.join(', ');
		if (event.category_name) pairs.push({ key: 'category', value: event.category_name });
		if (event.event_source) pairs.push({ key: 'source', value: event.event_source });
		if (event.assets?.length)
			pairs.push({ key: 'asset', value: list(event.assets.map((a) => a.asset_name ?? a.name)) });
		if (event.iocs?.length)
			pairs.push({ key: 'ioc', value: list(event.iocs.map((i) => i.ioc_value ?? i.name)) });
		if (tags.length) pairs.push({ key: 'tag', value: list(tags) });
		if (timelineNames.length) pairs.push({ key: 'timeline', value: list(timelineNames) });
		return pairs;
	});

	const hoverAction =
		'inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground';

	const copy = (text: string, title: string) => {
		navigator.clipboard
			.writeText(text)
			.then(() => toast({ title, variant: 'success' }))
			.catch(() => toast({ title: 'Could not copy link', variant: 'destructive' }));
	};
</script>

<div
	data-event-id={event.event_id}
	class={[
		'group relative border-b border-border/60 text-xs',
		selected ? 'bg-amber-500/10' : expanded ? 'bg-muted/30' : 'hover:bg-muted/40'
	]}
	style={expanded ? undefined : 'content-visibility: auto; contain-intrinsic-size: auto 46px'}
>
	<span
		aria-hidden="true"
		class="absolute inset-y-0 left-0 w-0.5"
		style="background-color: {accent}"
	></span>

	<div
		class="group/row relative grid cursor-default grid-cols-[1.75rem_1.25rem_8.5rem_minmax(0,1fr)] items-start gap-x-1 py-1.5 pl-2 pr-3"
		draggable={canEdit}
		ondragstart={onDragStart}
		role="row"
		tabindex="-1"
	>
		<div class="pt-0.5" role="gridcell">
			<!-- The click is taken over to read Shift; Space still goes through onCheckedChange. -->
			<Checkbox
				checked={selected}
				onclick={(e: MouseEvent) => {
					e.preventDefault();
					onToggleSelect(e.shiftKey);
				}}
				aria-label={`Select event ${event.event_id}`}
			/>
		</div>

		<button
			type="button"
			class="mt-0.5 inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
			aria-label={expanded ? 'Collapse' : 'Expand'}
			aria-expanded={expanded}
			onclick={onToggleExpand}
		>
			{#if expanded}
				<ChevronDownIcon class="size-3.5" />
			{:else}
				<ChevronRightIcon class="size-3.5" />
			{/if}
		</button>

		<div
			class="font-mono tabular-nums leading-tight"
			role="gridcell"
			title={formatDateTime(event.event_date)}
		>
			<div class="text-2xs text-muted-foreground">{formatDate(event.event_date)}</div>
			<div>
				{formatTime(event.event_date, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
			</div>
		</div>

		<div class="min-w-0" role="gridcell">
			<div class="flex min-w-0 items-center gap-1.5">
				<button
					type="button"
					class="min-w-0 truncate text-left font-medium text-foreground hover:underline"
					onclick={onToggleExpand}
				>
					{event.event_title}
				</button>
				{#if event.event_is_flagged}
					<FlagIcon class="size-3 shrink-0 fill-red-500 text-red-500" aria-label="Flagged" />
				{/if}
				{#if event.comments_count}
					<button
						type="button"
						class="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 text-2xs text-blue-600 hover:bg-blue-500/25 dark:text-blue-300"
						aria-label={`${event.comments_count} comments`}
						onclick={() => onComments(event.event_id)}
					>
						<MessageSquareIcon class="size-3" />
						{event.comments_count}
					</button>
				{/if}
				{#if event.children_count}
					<span
						class="inline-flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground"
						title={`${event.children_count} child events`}
					>
						<GitBranchIcon class="size-3" />
						{event.children_count}
					</span>
				{/if}
				<span class="shrink-0 text-2xs text-muted-foreground/70">#{event.event_id}</span>
			</div>
			{#if summaryPairs.length}
				<div class="mt-0.5 truncate font-mono text-2xs">
					{#each summaryPairs as pair (pair.key)}
						<span class="mr-3"
							><span class="text-muted-foreground">{pair.key}=</span><span
								class="text-sky-700 dark:text-sky-300">{pair.value}</span
							></span
						>
					{/each}
				</div>
			{/if}
		</div>

		<!-- The everyday actions, over the right end of the hovered row. -->
		<div
			class="invisible absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-sm group-focus-within/row:visible group-hover/row:visible"
		>
			{#if canEdit}
				<button
					type="button"
					class={hoverAction}
					title="Edit"
					aria-label={`Edit event ${event.event_id}`}
					onclick={() => onEdit(event.event_id)}
				>
					<EditIcon class="size-3.5" />
				</button>
				<button
					type="button"
					class={hoverAction}
					title={event.event_is_flagged ? 'Unflag' : 'Flag'}
					aria-label={`${event.event_is_flagged ? 'Unflag' : 'Flag'} event ${event.event_id}`}
					onclick={() => onFlag(event.event_id, !event.event_is_flagged)}
				>
					<FlagIcon
						class={`size-3.5 ${event.event_is_flagged ? 'fill-red-500 text-red-500' : ''}`}
					/>
				</button>
			{/if}
			<button
				type="button"
				class={hoverAction}
				title="Comments"
				aria-label={`Comments of event ${event.event_id}`}
				onclick={() => onComments(event.event_id)}
			>
				<MessageSquareIcon class="size-3.5" />
			</button>
		</div>
	</div>

	{#if expanded}
		<div class="space-y-3 pb-3 pl-[3.25rem] pr-3">
			{#if content}
				<div
					class="max-w-none text-xs text-foreground/90 [&_*]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
				>
					<MarkDownPreview markdown={content} />
				</div>
			{/if}

			<table class="w-full max-w-3xl border-collapse font-mono text-2xs">
				<tbody>
					{#each fieldRows as row, i (`${row.label}-${i}`)}
						<tr class="group/field border-b border-border/40 last:border-0">
							<td class="w-28 py-0.5 pr-3 align-top text-muted-foreground">{row.label}</td>
							<td class="break-all py-0.5 align-top">{row.value}</td>
							<td class="w-12 py-0.5 text-right align-top">
								{#if row.alias}
									<span class="invisible inline-flex gap-0.5 group-hover/field:visible">
										<button
											type="button"
											class="inline-flex size-4 items-center justify-center rounded hover:bg-muted"
											title="Narrow the search to this value"
											aria-label={`Search ${row.label} ${row.value}`}
											onclick={() => onClause(row.alias ?? '', row.clauseValue ?? row.value, false)}
										>
											<PlusIcon class="size-3" />
										</button>
										<button
											type="button"
											class="inline-flex size-4 items-center justify-center rounded hover:bg-muted"
											title="Exclude this value"
											aria-label={`Exclude ${row.label} ${row.value}`}
											onclick={() => onClause(row.alias ?? '', row.clauseValue ?? row.value, true)}
										>
											<MinusIcon class="size-3" />
										</button>
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if raw}
				<div>
					<div class="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						Raw data
					</div>
					<pre
						class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-2 font-mono text-2xs">{raw}</pre>
				</div>
			{/if}

			{#if truncated}
				<Button
					variant="link"
					size="sm"
					class="h-auto p-0 text-2xs"
					disabled={loadingFull}
					onclick={loadFull}
				>
					{loadingFull ? 'Loading…' : 'This event was cut for the list — show it whole'}
				</Button>
			{/if}

			<div class="flex flex-wrap items-center gap-1">
				{#if canEdit}
					<Button
						variant="outline"
						size="sm"
						class="h-7 text-xs"
						onclick={() => onEdit(event.event_id)}
					>
						<EditIcon class="mr-1 size-3.5" /> Edit
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-7 text-xs"
						onclick={() => onFlag(event.event_id, !event.event_is_flagged)}
					>
						<FlagIcon
							class={`mr-1 size-3.5 ${event.event_is_flagged ? 'fill-red-500 text-red-500' : ''}`}
						/>
						{event.event_is_flagged ? 'Unflag' : 'Flag'}
					</Button>
				{/if}
				<Button
					variant="outline"
					size="sm"
					class="h-7 text-xs"
					onclick={() => onComments(event.event_id)}
				>
					<MessageSquareIcon class="mr-1 size-3.5" /> Comments
				</Button>
				{#if canEdit}
					<Button
						variant="outline"
						size="sm"
						class="h-7 text-xs"
						onclick={() => onAddChild(event.event_id)}
					>
						<GitBranchPlusIcon class="mr-1 size-3.5" /> Add child
					</Button>
				{/if}

				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="ghost" size="sm" class="h-7 text-xs" aria-label="More actions">
							<MoreHorizontalIcon class="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem
							onclick={() => copy(getSharedEventUrl(event.event_id), 'Link copied')}
						>
							<ForwardIcon class="mr-2 size-3.5" /> Share
						</DropdownMenuItem>
						<DropdownMenuItem
							onclick={() =>
								copy(
									`[#${event.event_id} ${event.event_title}](${getSharedEventUrl(event.event_id)})`,
									'Markdown link copied'
								)}
						>
							<FileSymlinkIcon class="mr-2 size-3.5" /> Markdown link
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => goto(getGraphUrlForEvents([event.event_id]))}>
							<SplineIcon class="mr-2 size-3.5" /> Show in graph
						</DropdownMenuItem>
						{#if canEdit}
							<DropdownMenuItem onclick={() => onDuplicate(event.event_id)}>
								<CopyIcon class="mr-2 size-3.5" /> Duplicate
							</DropdownMenuItem>
							<Separator />
							<DropdownMenuItem class="text-red-500" onclick={() => onDelete(event.event_id)}>
								<Trash2Icon class="mr-2 size-3.5" /> Delete
							</DropdownMenuItem>
							{#if hookOptions.length}
								<Separator />
								{#each hookOptions as hookOption (hookOptionKey(hookOption))}
									<DropdownMenuItem onclick={() => onRunHook(event.event_id, hookOption)}>
										{hookOption.manual_hook_ui_name}
									</DropdownMenuItem>
								{/each}
							{/if}
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	{/if}
</div>
