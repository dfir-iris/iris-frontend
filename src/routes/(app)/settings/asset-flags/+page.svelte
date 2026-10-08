<!--
  Asset flags admin page.

  Org-wide set of status facts an asset can carry (Isolated, Credentials
  reset, Patched, Can't be patched…). An asset holds any combination of
  them, in no order; the order here is only the display order of the
  chips and menus. The list is short and fully loaded, so this page
  keeps the case-objects master/detail chrome without its search and
  infinite scroll: ordered list on the left (drag or up/down to
  reorder), details and a live preview on the right, one dialog for
  add/edit.

  Admin only: the nav entry is gated on `server_administrator` and every
  mutation is re-checked by the backend.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ChevronDownIcon,
		ChevronUpIcon,
		FlagIcon,
		GavelIcon,
		GripVerticalIcon,
		LayersIcon,
		MessageSquareTextIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import {
		ASSET_FLAG_ICONS,
		getAssetFlagIcon,
		type AssetFlagIconName
	} from '$lib/components/common/assets/asset-flag-icon';
	import {
		ASSET_FLAG_COLORS,
		ASSET_FLAG_KINDS,
		ASSET_STATUS_TIMELINE_NAME,
		AssetFlagsService,
		assetFlagChipClass,
		assetFlagDotClass,
		sortAssetFlags,
		type AssetFlag,
		type AssetFlagInput,
		type AssetFlagKind,
		type AssetFlagPreset
	} from '$lib/services/asset-flags.service';
	import { setAssetFlags } from '$lib/stores/asset-flags.store.svelte';

	const NAME_MAX = 64;

	const KIND_META: Record<AssetFlagKind, { label: string; help: string; badge: string }> = {
		status: {
			label: 'Status',
			help: 'A fact about the asset (isolated, credentials reset…).',
			badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
		},
		done: {
			label: 'Done',
			help: 'Nothing left to do on the asset. Counted as done on the Board.',
			badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
		},
		exception: {
			label: 'Exception',
			help: 'An accepted gap. Highlighted on the war-room Board.',
			badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
		}
	};

	const PRESETS: { id: AssetFlagPreset; label: string; summary: string }[] = [
		{
			id: 'incident',
			label: 'Incident response (default)',
			summary:
				"Isolated, Credentials reset, Patched, Reimaged, Monitored, Restored, Can't be patched, Blocked"
		},
		{
			id: 'vulnerability',
			label: 'Vulnerability',
			summary: "Mitigated, Patched, Not affected, Can't be patched, Accepted risk"
		}
	];

	const ICON_NAMES = Object.keys(ASSET_FLAG_ICONS) as AssetFlagIconName[];

	let flags = $state<AssetFlag[]>([]);
	let loading = $state(false);
	let reordering = $state(false);
	let selectedId = $state<number | null>(null);
	const selected = $derived(flags.find((f) => f.id === selectedId) ?? null);

	// Add / edit dialog -------------------------------------------------
	type EditorForm = {
		name: string;
		description: string;
		color: string;
		icon: string;
		kind: AssetFlagKind;
		requires_reason: boolean;
		requires_decision: boolean;
	};

	const blankForm = (): EditorForm => ({
		name: '',
		description: '',
		color: 'slate',
		icon: 'flag',
		kind: 'status',
		requires_reason: false,
		requires_decision: false
	});

	let editorOpen = $state(false);
	let editorBusy = $state(false);
	let editorError = $state<string | null>(null);
	let editorId = $state<number | null>(null);
	let form = $state<EditorForm>(blankForm());

	// Confirmation dialog -----------------------------------------------
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmText = $state('Confirm');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const showError = (msg: string | null | undefined, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const errorOf = (res: { data?: unknown; error?: { message?: string } }): string | undefined => {
		const data = res.data as { message?: string } | null | undefined;
		return (data && typeof data === 'object' ? data.message : undefined) ?? res.error?.message;
	};

	const plural = (n: number) => `${n} asset${n === 1 ? '' : 's'}`;

	const applyList = (items: AssetFlag[]) => {
		flags = sortAssetFlags(items);
		setAssetFlags(flags);
		if (selectedId === null || !flags.some((f) => f.id === selectedId)) {
			selectedId = flags[0]?.id ?? null;
		}
	};

	const loadList = async () => {
		loading = true;
		try {
			const res = await AssetFlagsService.list();
			if (res.ok && Array.isArray(res.data)) {
				applyList(res.data);
			} else {
				showError(errorOf(res), 'Failed to load asset flags');
			}
		} catch (e) {
			showError((e as Error).message);
		} finally {
			loading = false;
		}
	};

	onMount(loadList);

	// Reorder -------------------------------------------------------------
	const persistOrder = async (next: AssetFlag[]) => {
		const previous = flags;
		flags = next;
		reordering = true;
		try {
			const res = await AssetFlagsService.reorder(next.map((f) => f.id));
			if (res.ok && Array.isArray(res.data)) {
				applyList(res.data);
			} else {
				flags = previous;
				showError(errorOf(res), 'Unable to reorder flags');
			}
		} catch (e) {
			flags = previous;
			showError((e as Error).message);
		} finally {
			reordering = false;
		}
	};

	const move = (from: number, to: number) => {
		if (reordering || from === to || to < 0 || to >= flags.length) return;
		const next = [...flags];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		void persistOrder(next);
	};

	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);

	const onDragStart = (e: DragEvent, index: number) => {
		dragIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(flags[index]?.id ?? ''));
		}
	};

	const onDragOver = (e: DragEvent, index: number) => {
		if (dragIndex === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropIndex = index;
	};

	const onDrop = (e: DragEvent, index: number) => {
		e.preventDefault();
		const from = dragIndex;
		dragIndex = null;
		dropIndex = null;
		if (from !== null) move(from, index);
	};

	const onDragEnd = () => {
		dragIndex = null;
		dropIndex = null;
	};

	// Editor --------------------------------------------------------------
	const openAdd = () => {
		editorId = null;
		form = blankForm();
		editorError = null;
		editorOpen = true;
	};

	const openEdit = (flag: AssetFlag) => {
		editorId = flag.id;
		form = {
			name: flag.name,
			description: flag.description ?? '',
			color: flag.color,
			icon: flag.icon ?? 'flag',
			kind: flag.kind,
			requires_reason: flag.requires_reason,
			requires_decision: flag.requires_decision
		};
		editorError = null;
		editorOpen = true;
	};

	const submitEditor = async () => {
		const name = form.name.trim();
		if (!name) {
			editorError = 'Name is required';
			return;
		}
		if (name.length > NAME_MAX) {
			editorError = `Name must be at most ${NAME_MAX} characters`;
			return;
		}
		const body: AssetFlagInput = {
			name,
			description: form.description.trim(),
			color: form.color,
			icon: form.icon,
			kind: form.kind,
			requires_reason: form.requires_reason,
			requires_decision: form.requires_decision
		};
		editorBusy = true;
		editorError = null;
		try {
			const res =
				editorId === null
					? await AssetFlagsService.create(body)
					: await AssetFlagsService.update(editorId, body);
			if (!(res.ok && res.data && typeof res.data === 'object')) {
				editorError = errorOf(res) ?? 'Unable to save';
				return;
			}
			const saved = res.data;
			showSuccess(editorId === null ? `Flag "${saved.name}" created` : 'Flag saved');
			editorOpen = false;
			await loadList();
			selectedId = saved.id;
		} catch (e) {
			editorError = (e as Error).message;
		} finally {
			editorBusy = false;
		}
	};

	// Delete / presets ----------------------------------------------------
	const askRemove = (flag: AssetFlag) => {
		const used = flag.in_use_count ?? 0;
		confirmTitle = `Delete flag "${flag.name}"?`;
		confirmMessage =
			used > 0
				? `${plural(used)} currently carry this flag. Remove it from them first — the server refuses to delete a flag in use.`
				: `The flag history of assets and the "${ASSET_STATUS_TIMELINE_NAME}" timeline events keep the flag name. This cannot be undone.`;
		confirmText = 'Delete';
		confirmAction = async () => {
			const res = await AssetFlagsService.remove(flag.id);
			if (res.ok) {
				showSuccess('Flag deleted');
				if (selectedId === flag.id) selectedId = null;
				await loadList();
			} else {
				// DELETE responses come back without a parsed body, so
				// fall back to the reason we can infer.
				showError(
					errorOf(res),
					used > 0 ? `Flag is set on ${plural(used)}` : 'Unable to delete flag'
				);
				await loadList();
			}
		};
		confirmOpen = true;
	};

	const askPreset = (preset: (typeof PRESETS)[number]) => {
		confirmTitle = `Replace all flags with "${preset.label}"?`;
		confirmMessage = `The current list is replaced by: ${preset.summary}. Only possible while no asset carries a flag.`;
		confirmText = 'Replace';
		confirmAction = async () => {
			const res = await AssetFlagsService.applyPreset(preset.id);
			if (res.ok && Array.isArray(res.data)) {
				selectedId = null;
				applyList(res.data);
				showSuccess(`Preset "${preset.label}" loaded`);
			} else {
				showError(errorOf(res), 'Unable to load preset');
			}
		};
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};
</script>

<svelte:head>
	<title>Asset flags</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<FlagIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Asset flags</h1>
				<p class="text-2xs text-muted-foreground">
					Status facts set on case assets and in war rooms. Each change is recorded on the case "{ASSET_STATUS_TIMELINE_NAME}"
					timeline.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={loadList} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="h-7">
							<LayersIcon size={12} class="mr-1" />
							Load preset
							<ChevronDownIcon size={12} />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-72">
					<DropdownMenu.Label>Replace with preset</DropdownMenu.Label>
					<DropdownMenu.Separator />
					{#each PRESETS as preset (preset.id)}
						<DropdownMenu.Item onclick={() => askPreset(preset)}>
							<div class="flex min-w-0 flex-col">
								<span class="text-xs font-medium">{preset.label}</span>
								<span class="truncate text-2xs text-muted-foreground">{preset.summary}</span>
							</div>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<Button size="sm" class="h-7" onclick={openAdd}>
				<PlusIcon size={12} class="mr-1" />
				Add flag
			</Button>
		</div>
	</header>

	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<!-- Ordered list -->
		<section class="flex min-h-0 flex-1 basis-1/2 flex-col overflow-hidden rounded-md border">
			<div class="flex items-baseline gap-2 border-b bg-muted/30 px-3 py-2">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags</h2>
				<span class="text-2xs tabular-nums text-muted-foreground">{flags.length}</span>
				<span class="ml-auto text-2xs text-muted-foreground">Drag to reorder</span>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if loading && flags.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(6) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if flags.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						No asset flags yet. Add one or load a preset.
					</p>
				{:else}
					<ul aria-label="Asset flags" data-testid="asset-flags-list">
						{#each flags as flag, index (flag.id)}
							{@const Icon = getAssetFlagIcon(flag.icon)}
							{@const active = flag.id === selectedId}
							<li
								class="group flex items-center gap-2 border-b border-l-[3px] px-2.5 py-2 transition-colors
									{active ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-muted/40'}
									{dropIndex === index && dragIndex !== index ? 'border-t-2 border-t-primary' : ''}
									{dragIndex === index ? 'opacity-50' : ''}"
								draggable={!reordering}
								ondragstart={(e) => onDragStart(e, index)}
								ondragover={(e) => onDragOver(e, index)}
								ondrop={(e) => onDrop(e, index)}
								ondragend={onDragEnd}
								data-testid="asset-flag-row"
							>
								<GripVerticalIcon
									class="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50"
									aria-hidden="true"
								/>
								<button
									type="button"
									class="flex min-w-0 flex-1 items-center gap-2 text-left"
									onclick={() => (selectedId = flag.id)}
									aria-pressed={active}
								>
									<span
										class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border {assetFlagChipClass(
											flag.color
										)}"
									>
										<Icon class="h-3.5 w-3.5" aria-hidden="true" />
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-xs font-medium">{flag.name}</span>
										<span class="block truncate text-2xs text-muted-foreground">
											{flag.description || '—'}
										</span>
									</span>
								</button>
								<span
									class="shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium {KIND_META[flag.kind]
										?.badge ?? ''}"
								>
									{KIND_META[flag.kind]?.label ?? flag.kind}
								</span>
								{#if flag.requires_reason}
									<span title="Requires a reason" class="shrink-0">
										<MessageSquareTextIcon class="h-3.5 w-3.5 text-muted-foreground" />
										<span class="sr-only">Requires a reason</span>
									</span>
								{/if}
								{#if flag.requires_decision}
									<span title="Requires a decision" class="shrink-0">
										<GavelIcon class="h-3.5 w-3.5 text-amber-600" />
										<span class="sr-only">Requires a decision</span>
									</span>
								{/if}
								<span class="w-16 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
									{plural(flag.in_use_count ?? 0)}
								</span>
								<span
									class="flex shrink-0 flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
								>
									<button
										type="button"
										class="text-muted-foreground hover:text-foreground disabled:opacity-30"
										aria-label={`Move ${flag.name} up`}
										disabled={index === 0 || reordering}
										onclick={() => move(index, index - 1)}
									>
										<ChevronUpIcon size={12} />
									</button>
									<button
										type="button"
										class="text-muted-foreground hover:text-foreground disabled:opacity-30"
										aria-label={`Move ${flag.name} down`}
										disabled={index === flags.length - 1 || reordering}
										onclick={() => move(index, index + 1)}
									>
										<ChevronDownIcon size={12} />
									</button>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Details + preview -->
		<section class="flex min-h-0 flex-1 basis-1/2 flex-col overflow-hidden rounded-md border">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Details
					</h2>
					{#if selected}
						<span class="text-2xs text-muted-foreground">{selected.name}</span>
					{/if}
				</div>

				{#if selected}
					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={() => selected && openEdit(selected)}
						>
							<PencilIcon size={12} class="mr-1" />
							Edit
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={() => selected && askRemove(selected)}
						>
							<Trash2Icon size={12} class="mr-1" />
							Delete
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if !selected}
					<p class="px-3 py-10 text-center text-xs text-muted-foreground">
						Select a flag on the left to see its details.
					</p>
				{:else}
					<dl class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Flag</dt>
							<dd class="mt-0.5"><AssetFlagChip flag={selected} size="sm" /></dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Kind</dt>
							<dd>{KIND_META[selected.kind]?.label ?? selected.kind}</dd>
						</div>
						<div class="sm:col-span-2">
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Description</dt>
							<dd class="whitespace-pre-wrap">{selected.description || '—'}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Colour</dt>
							<dd class="flex items-center gap-1.5">
								<span class="h-2.5 w-2.5 rounded-full {assetFlagDotClass(selected.color)}"></span>
								{selected.color}
							</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Icon</dt>
							<dd class="font-mono text-2xs">{selected.icon ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								Requires a reason
							</dt>
							<dd>{selected.requires_reason ? 'Yes' : 'No'}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">
								Requires a decision
							</dt>
							<dd>{selected.requires_decision ? 'Yes' : 'No'}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">In use</dt>
							<dd class="tabular-nums">{plural(selected.in_use_count ?? 0)}</dd>
						</div>
						<div>
							<dt class="text-2xs uppercase tracking-wide text-muted-foreground">Flag ID</dt>
							<dd class="font-mono text-2xs">{selected.id}</dd>
						</div>
					</dl>
				{/if}

				{#if flags.length > 0}
					<div class="mx-4 mb-4 rounded-md border p-3">
						<p class="mb-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
							Preview
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each flags as flag (flag.id)}
								<AssetFlagChip {flag} />
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Add / Edit dialog -->
<Dialog.Root bind:open={editorOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editorId === null ? 'Add flag' : 'Edit flag'}</Dialog.Title>
			<Dialog.Description>
				{editorId === null
					? 'Create a new asset flag. It is appended to the end of the list.'
					: 'Update this asset flag. Assets keep it.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pt-2">
			<div class="flex flex-col gap-1">
				<label for="flag-name" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Name *
				</label>
				<Input
					id="flag-name"
					bind:value={form.name}
					maxlength={NAME_MAX}
					placeholder="Isolated"
					disabled={editorBusy}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label
					for="flag-description"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Description
				</label>
				<Textarea
					id="flag-description"
					rows={2}
					bind:value={form.description}
					placeholder="Shown in the flag menus"
					disabled={editorBusy}
				/>
			</div>

			<div class="flex flex-col gap-1">
				<span id="flag-color-label" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Colour
				</span>
				<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="flag-color-label">
					{#each ASSET_FLAG_COLORS as color (color)}
						<button
							type="button"
							role="radio"
							aria-checked={form.color === color}
							aria-label={color}
							title={color}
							disabled={editorBusy}
							onclick={() => (form.color = color)}
							class="h-6 w-6 rounded-full {assetFlagDotClass(color)} {form.color === color
								? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
								: ''}"
						></button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<span id="flag-icon-label" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Icon
				</span>
				<div class="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="flag-icon-label">
					{#each ICON_NAMES as name (name)}
						{@const Icon = ASSET_FLAG_ICONS[name]}
						<button
							type="button"
							role="radio"
							aria-checked={form.icon === name}
							aria-label={name}
							title={name}
							disabled={editorBusy}
							onclick={() => (form.icon = name)}
							class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors {form.icon ===
							name
								? assetFlagChipClass(form.color)
								: 'text-muted-foreground hover:bg-muted'}"
						>
							<Icon class="h-4 w-4" aria-hidden="true" />
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<span id="flag-kind-label" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Kind
				</span>
				<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="flag-kind-label">
					{#each ASSET_FLAG_KINDS as kind (kind)}
						<button
							type="button"
							role="radio"
							aria-checked={form.kind === kind}
							disabled={editorBusy}
							onclick={() => (form.kind = kind)}
							class="rounded-md border px-3 py-2 text-left transition-colors {form.kind === kind
								? 'border-primary bg-primary/5'
								: 'hover:bg-muted/40'}"
						>
							<span class="block text-xs font-medium">{KIND_META[kind].label}</span>
							<span class="block text-2xs text-muted-foreground">{KIND_META[kind].help}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
				<label for="flag-requires-reason" class="min-w-0">
					<span class="block text-xs font-medium">Requires a reason</span>
					<span class="block text-2xs text-muted-foreground">
						Setting this flag on an asset asks for a written reason.
					</span>
				</label>
				<Switch
					id="flag-requires-reason"
					bind:checked={form.requires_reason}
					disabled={editorBusy}
				/>
			</div>

			<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
				<label for="flag-requires-decision" class="min-w-0">
					<span class="block text-xs font-medium">Requires a decision</span>
					<span class="block text-2xs text-muted-foreground">
						Setting this flag must reference a war-room decision (e.g. risk acceptance).
					</span>
				</label>
				<Switch
					id="flag-requires-decision"
					bind:checked={form.requires_decision}
					disabled={editorBusy}
				/>
			</div>

			<div class="flex items-center gap-2 text-2xs text-muted-foreground">
				Preview
				<AssetFlagChip
					flag={{ name: form.name.trim() || 'Flag', color: form.color, icon: form.icon }}
					size="sm"
				/>
			</div>

			{#if editorError}
				<p class="text-2xs text-destructive" role="alert">{editorError}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (editorOpen = false)} disabled={editorBusy}>
				Cancel
			</Button>
			<Button onclick={submitEditor} disabled={editorBusy}>
				{editorBusy ? 'Saving…' : editorId === null ? 'Create' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	{confirmText}
	onConfirm={runConfirm}
/>
