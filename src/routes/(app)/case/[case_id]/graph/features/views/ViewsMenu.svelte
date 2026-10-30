<!--
  Saved views of the graph: toolbar button showing the loaded view (with a
  "modified" dot), and a popover to load, save, save as, rename, share,
  set as the report picture and delete.
-->
<script lang="ts">
	import {
		BookmarkIcon,
		ChevronDownIcon,
		EllipsisIcon,
		FileImageIcon,
		LoaderCircleIcon,
		PencilIcon,
		SaveIcon,
		Share2Icon,
		Trash2Icon,
		UsersIcon,
		XIcon
	} from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { GraphViewSummary } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { truncate } from '../../lib/model';
	import { copyName } from '../../lib/saved-views';
	import { getGraphFeatures } from '../context';
	import SaveViewDialog, { type SaveViewValues } from './SaveViewDialog.svelte';

	let { graph: _graph }: { graph: CaseGraphState } = $props();

	const { views, canEdit } = getGraphFeatures();

	let open = $state(false);
	let dialogOpen = $state(false);
	let dialogMode = $state<'create' | 'rename'>('create');
	let dialogTarget = $state<GraphViewSummary | null>(null);
	let confirmOpen = $state(false);
	let toDelete = $state<GraphViewSummary | null>(null);

	const current = $derived(views.current);
	const currentPerms = $derived(current ? views.permissions(current) : null);

	const fail = (e: unknown) =>
		toast({
			title: 'Saved views',
			description: e instanceof Error ? e.message : String(e),
			variant: 'destructive'
		});

	const run = async (fn: () => Promise<unknown>, success?: string) => {
		try {
			await fn();
			if (success) toast({ title: success, variant: 'success' });
		} catch (e) {
			fail(e);
		}
	};

	const onOpenChange = (v: boolean) => {
		open = v;
		if (v) void views.refreshList();
	};

	const load = (v: GraphViewSummary) => {
		open = false;
		void run(() => views.load(v), `View “${truncate(v.name, 40)}” loaded`);
	};

	const openSaveAs = () => {
		dialogMode = 'create';
		dialogTarget = null;
		open = false;
		dialogOpen = true;
	};

	const openRename = (v: GraphViewSummary) => {
		dialogMode = 'rename';
		dialogTarget = v;
		open = false;
		dialogOpen = true;
	};

	const onDialogSubmit = async (values: SaveViewValues) => {
		if (dialogMode === 'create') {
			const v = await views.saveAs(values);
			toast({ title: `View “${truncate(v.name, 40)}” saved`, variant: 'success' });
		} else if (dialogTarget) {
			await views.rename(dialogTarget, values.name, values.description);
			toast({ title: 'View renamed', variant: 'success' });
		}
	};

	const askDelete = (v: GraphViewSummary) => {
		toDelete = v;
		open = false;
		confirmOpen = true;
	};
</script>

<Popover.Root {open} {onOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={current ? 'secondary' : 'outline'}
				size="xs"
				title={current
					? `Saved view: ${current.name}${views.dirty ? ' (modified)' : ''}`
					: 'Saved views'}
			>
				<BookmarkIcon class="mr-1 h-3.5 w-3.5" />
				<span class="max-w-36 truncate">{current ? current.name : 'Views'}</span>
				{#if views.dirty}
					<span
						class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
						aria-label="Modified since saved"
					></span>
				{/if}
				<ChevronDownIcon class="ml-0.5 h-3 w-3" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-80 p-0">
		<div class="space-y-1.5 border-b p-2">
			{#if current}
				<div class="flex items-center gap-1.5 text-xs">
					<span class="min-w-0 flex-1 truncate font-medium">{current.name}</span>
					{#if views.dirty}
						<span
							class="rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-300"
						>
							Modified
						</span>
					{/if}
					<button
						type="button"
						class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
						title="Stop tracking this view (the canvas stays as is)"
						aria-label="Detach from the view"
						onclick={() => views.detach()}
					>
						<XIcon class="h-3 w-3" />
					</button>
				</div>
			{/if}
			<div class="flex gap-1.5">
				{#if current && currentPerms?.modify}
					<Button
						size="xs"
						class="flex-1"
						disabled={views.busy || !views.dirty}
						onclick={() => run(() => views.save(), 'View saved')}
					>
						<SaveIcon class="mr-1 h-3.5 w-3.5" />Save
					</Button>
				{/if}
				{#if canEdit()}
					<Button
						size="xs"
						variant="outline"
						class="flex-1"
						disabled={views.busy}
						onclick={openSaveAs}
					>
						<BookmarkIcon class="mr-1 h-3.5 w-3.5" />{current ? 'Save as…' : 'Save the view…'}
					</Button>
				{/if}
			</div>
		</div>

		<div class="max-h-80 overflow-y-auto p-1" role="list" aria-label="Saved views">
			{#if views.loading && !views.views.length}
				<div class="flex items-center gap-2 p-2 text-xs text-muted-foreground">
					<LoaderCircleIcon class="h-3.5 w-3.5 animate-spin" />Loading…
				</div>
			{:else if views.error}
				<p class="p-2 text-xs text-destructive">{views.error}</p>
			{:else if !views.views.length}
				<p class="p-2 text-xs text-muted-foreground">
					No saved view yet. A view keeps the positions, filters and time range of the canvas.
				</p>
			{/if}
			{#each [{ label: 'My views', list: views.grouped.own }, { label: 'Shared with me', list: views.grouped.shared }] as group (group.label)}
				{#if group.list.length}
					<div class="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
						{group.label}
					</div>
					{#each group.list as v (v.view_id)}
						{@const perms = views.permissions(v)}
						<div
							role="listitem"
							class="group flex items-center gap-1 rounded {current?.view_id === v.view_id
								? 'bg-accent'
								: 'hover:bg-accent/60'}"
						>
							<button
								type="button"
								class="flex min-w-0 flex-1 flex-col items-start px-2 py-1 text-left"
								title={v.description ?? undefined}
								disabled={views.busy}
								onclick={() => load(v)}
							>
								<span class="flex w-full items-center gap-1 text-xs">
									<span class="truncate">{v.name}</span>
									{#if v.is_shared}
										<UsersIcon class="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Shared" />
									{/if}
									{#if v.is_report_default}
										<FileImageIcon
											class="h-3 w-3 shrink-0 text-primary"
											aria-label="Report picture"
										/>
									{/if}
								</span>
								{#if v.updated_at}
									<span class="text-[10px] text-muted-foreground">
										{formatDateTime(v.updated_at)}
									</span>
								{/if}
							</button>
							{#if perms.modify}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												type="button"
												class="mr-1 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
												aria-label={`Actions on ${v.name}`}
											>
												<EllipsisIcon class="h-3.5 w-3.5" />
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="w-60">
										<DropdownMenu.Item onclick={() => openRename(v)}>
											<PencilIcon class="mr-2 h-3.5 w-3.5" />Rename…
										</DropdownMenu.Item>
										{#if perms.share}
											<DropdownMenu.Item
												onclick={() =>
													run(
														() => views.toggleShare(v),
														v.is_shared ? 'View made private' : 'View shared'
													)}
											>
												<Share2Icon class="mr-2 h-3.5 w-3.5" />{v.is_shared
													? 'Make private'
													: 'Share with the case team'}
											</DropdownMenu.Item>
										{/if}
										{#if v.is_report_default}
											<DropdownMenu.Item
												onclick={() =>
													run(
														() => views.setReportDefault(v, false),
														'No longer the report picture'
													)}
											>
												<FileImageIcon class="mr-2 h-3.5 w-3.5" />Unset as report picture
											</DropdownMenu.Item>
										{:else if v.is_shared || perms.share}
											<DropdownMenu.Item
												onclick={() => {
													open = false;
													void run(
														() => views.setReportDefault(v, true),
														'Set as the report picture'
													);
												}}
											>
												<FileImageIcon class="mr-2 h-3.5 w-3.5" />Set as report picture
												{#if !v.is_shared}
													<span class="ml-auto text-[10px] text-muted-foreground">shares it</span>
												{/if}
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Separator />
										<DropdownMenu.Item class="text-destructive" onclick={() => askDelete(v)}>
											<Trash2Icon class="mr-2 h-3.5 w-3.5" />Delete…
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						</div>
					{/each}
				{/if}
			{/each}
		</div>
		{#if views.reportDefault}
			<p class="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
				Report picture: <span class="text-foreground">{views.reportDefault.name}</span>
			</p>
		{/if}
	</Popover.Content>
</Popover.Root>

<SaveViewDialog
	bind:open={dialogOpen}
	mode={dialogMode}
	initial={dialogMode === 'rename' && dialogTarget
		? { name: dialogTarget.name, description: dialogTarget.description }
		: current
			? {
					name: copyName(
						current.name,
						views.views.map((v) => v.name)
					),
					description: current.description
				}
			: {}}
	onSubmit={onDialogSubmit}
/>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete the view"
	message={toDelete
		? `Delete the saved view “${toDelete.name}”?${toDelete.is_shared ? ' It is shared: it disappears for the whole team.' : ''}`
		: ''}
	confirmText="Delete"
	onConfirm={() => {
		confirmOpen = false;
		const v = toDelete;
		if (v) void run(() => views.remove(v), 'View deleted');
	}}
/>
