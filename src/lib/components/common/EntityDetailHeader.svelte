<!--
  Identity + action strip for an entity detail pane (asset, IOC, task,
  evidence).

  Lives above the tab bar so the entity's name and state stay on screen
  whatever tab is open, and so the Edit / Delete / module-hook actions have
  one home instead of being repeated at the top of every Details tab — which
  is where all four of them used to sit, each with its own copy of the
  clipboard and hook plumbing.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		EditIcon,
		EllipsisVerticalIcon,
		FileSymlinkIcon,
		ForwardIcon,
		SaveIcon,
		XIcon,
		type ServerIcon
	} from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { callHook } from '$lib/utils/hooks';
	import { toast } from '$lib/stores/toast.store';
	import { HooksService, type HookObjectType, type HookOption } from '$lib/services/hooks.service';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';

	type IconComponent = typeof ServerIcon;

	type Props = {
		Icon: IconComponent;
		title: string;
		/** Second line under the title — type, id, uuid. */
		subtitle?: string;
		/** Monospace title: IOC values, filenames, hashes. */
		mono?: boolean;
		/** Tints the icon tile red for a compromised or malicious entity. */
		accent?: 'none' | 'danger';
		/** Status badges rendered right of the title. */
		badges?: Snippet;

		isEditing?: boolean;
		isSaving?: boolean;
		canEdit?: boolean;
		/** Verb on the edit button — "Edit asset", "Edit IOC"… */
		editLabel?: string;
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDelete?: () => void;
		deleteUrl: string;
		deletePrompt: string;

		/** Absolute URL copied by both Share and Markdown Link. */
		shareUrl: string;
		/** Font Awesome glyph embedded in the copied markdown link. */
		markdownIcon?: string;

		/** Module-hook target. The menu lists this type's manual hooks. */
		hookType: HookObjectType;
		caseId: number;
		objectId: number;
	};

	let {
		Icon,
		title,
		subtitle,
		mono = false,
		accent = 'none',
		badges,
		isEditing = false,
		isSaving = false,
		canEdit = true,
		editLabel = 'Edit',
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDelete = () => {},
		deleteUrl,
		deletePrompt,
		shareUrl,
		markdownIcon = 'fa-bell',
		hookType,
		caseId,
		objectId
	}: Props = $props();

	let isMenuOpen = $state<boolean>(false);
	let hookOptions = $state<HookOption[]>([]);

	const copyToClipboard = (value: string) => {
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast({ title: 'Link copied', variant: 'success' });
			})
			.catch((e) => {
				console.error('Clipboard copy error:', e);

				toast({ title: 'Could not copy link', variant: 'destructive' });
			});
	};

	const callModule = async (hookOption: HookOption) => {
		const result = await callHook(caseId, hookType, [objectId], hookOption);

		toast({
			variant: result?.status === 'error' ? 'destructive' : 'success',
			title: result?.message
		});
	};

	const loadHooks = async () => {
		// v2 returns the bare array — `response.data` IS the list. Reading
		// a second `.data` off it (as this used to) always yielded
		// undefined, which is why no module ever contributed a button here.
		const response = await HooksService.list(hookType);
		hookOptions = Array.isArray(response.data) ? response.data : [];
	};

	$effect(() => {
		void hookType;
		loadHooks();
	});
</script>

<!--
  VISUAL TEST (lighter chrome): no `border-b` here. The tab row directly
  below keeps its own rule — that one is load-bearing (it is the baseline
  the active-tab underline sits on), so a second line 40px above it was
  pure noise.

  Asymmetric padding is deliberate: this strip is the first thing in the
  pane, so `pt-4` gives the title room to breathe below the case topbar,
  while the smaller `pb-2` keeps it visually attached to the tab row it
  labels rather than floating between the two.
-->
<div class="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-4">
	<div
		class={cn(
			'shrink-0 rounded-md p-1.5',
			accent === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
		)}
	>
		<Icon class="h-4 w-4" />
	</div>

	<div class="min-w-0">
		<h2
			class={cn('truncate font-semibold leading-tight', mono ? 'font-mono text-sm' : 'text-base')}
			{title}
		>
			{title}
		</h2>

		{#if subtitle}
			<p class="truncate text-2xs text-muted-foreground">{subtitle}</p>
		{/if}
	</div>

	{#if badges}
		<div class="flex shrink-0 items-center gap-1.5">
			{@render badges()}
		</div>
	{/if}

	<div class="ml-auto flex shrink-0 items-center gap-2">
		{#if canEdit}
			{#if isEditing}
				<Button variant="outline" size="sm" onclick={onCancelEditing} disabled={isSaving}>
					<XIcon class="h-4 w-4" />
					Cancel
				</Button>

				<Button size="sm" onclick={onSaveChanges} disabled={isSaving}>
					{#if isSaving}
						<span class="animate-spin">⟳</span>
						Saving...
					{:else}
						<SaveIcon class="h-4 w-4" />
						Save Changes
					{/if}
				</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={onStartEditing}>
					<EditIcon class="h-4 w-4" />
					{editLabel}
				</Button>

				<DeleteButton
					url={deleteUrl}
					onrefresh={onDelete}
					buttonText="Delete"
					deletion_prompt_message={deletePrompt}
				/>
			{/if}
		{/if}

		<DropdownMenu bind:open={isMenuOpen}>
			<DropdownMenuTrigger>
				<button title="menu" class="text-muted-foreground transition-colors hover:text-foreground">
					<EllipsisVerticalIcon size="16" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end">
				<DropdownMenuItem onclick={() => copyToClipboard(shareUrl)}>
					<ForwardIcon /> Share
				</DropdownMenuItem>

				<DropdownMenuItem
					onclick={() =>
						copyToClipboard(`[<i class="fa-solid ${markdownIcon}"></i> #${objectId}](${shareUrl})`)}
				>
					<FileSymlinkIcon /> Markdown Link
				</DropdownMenuItem>

				{#if canEdit && hookOptions.length}
					<Separator />

					{#each hookOptions as hookOption}
						<DropdownMenuItem onclick={() => callModule(hookOption)}>
							{hookOption.manual_hook_ui_name}
						</DropdownMenuItem>
					{/each}
				{/if}
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
</div>
