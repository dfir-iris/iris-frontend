<script lang="ts">
	import {
		CheckCircle2Icon,
		CheckSquareIcon,
		ChevronDownIcon,
		CircleArrowRightIcon,
		EllipsisVerticalIcon,
		FileSymlinkIcon,
		FlameIcon,
		ForwardIcon,
		HandIcon,
		HistoryIcon,
		MessagesSquareIcon,
		PencilIcon,
		RotateCcwIcon,
		TrashIcon
	} from 'lucide-svelte';
	import { Collapsible } from 'bits-ui';
	import { getContext, onMount } from 'svelte';
	import { page } from '$app/state';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { alertHooks } from '$lib/stores/alert-hooks.store.svelte';
	import { callAlertHook, hookOptionKey } from '$lib/utils/hooks';
	import type { HookOption } from '$lib/services/hooks.service';
	import type { Alert } from '$lib/types/resources/alert';
	import { toast } from '$lib/stores/toast.store';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger,
		Separator
	} from '$lib/components/ui/dropdown-menu';
	import AlertCardFooter from './AlertCardFooter.svelte';
	import AlertCardDetails from './AlertCardDetails.svelte';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import { ALERT_CARD_ACCENT, alertCardTone } from './alert-card-status';

	let {
		alert,
		alertStatuses,
		expanded = $bindable(),
		alwaysExpanded = false,
		onExpandedChange,
		onAssign,
		onAssignToCurrentUser,
		onSetStatus,
		onShowEdit,
		onShowHistory,
		onShowComments,
		onShowMerge,
		onShowClose,
		onUnlinkCase,
		onDelete,
		onShowInvestigationFlow
	}: {
		alert: Alert;
		alertStatuses: AlertStatus[];
		expanded?: boolean;
		alwaysExpanded?: boolean;
		onExpandedChange?: (v: boolean) => void;
		onAssign: () => void;
		onAssignToCurrentUser: () => void;
		onSetStatus: (status_id: number) => void;
		onShowEdit: () => void;
		onShowHistory: () => void;
		onShowComments: () => void;
		onShowMerge: () => void;
		onShowClose: (withNote: boolean) => void;
		onUnlinkCase: (case_id: number) => void;
		onDelete: () => void;
		// Optional — only surfaced when the parent supplies a handler AND
		// the alert has a flow attached. Kept optional so the countless
		// other AlertCard call sites (which don't know about flows) don't
		// need to be touched.
		onShowInvestigationFlow?: () => void;
	} = $props();

	const getBackgroundBySeverity = (severity: string): string => {
		switch (severity.toLowerCase()) {
			case 'informational':
				return 'bg-blue-600';
			case 'medium':
				return 'bg-orange-500';
			case 'high':
				return 'bg-red-500';
			default:
				return 'bg-muted-foreground';
		}
	};

	let isAssignMenuOpen = $state(false);
	let isSetStatusMenuOpen = $state(false);
	let isMenuOpen = $state(false);
	// eslint-disable-next-line svelte/valid-compile
	let detailsLoaded = $state(alwaysExpanded || expanded);

	$effect(() => {
		if (alwaysExpanded || expanded) {
			detailsLoaded = true;
		}
	});

	const showHeaderActions = $derived(
		isAssignMenuOpen || isSetStatusMenuOpen || isMenuOpen || alwaysExpanded
	);

	const tone = $derived(alertCardTone(alert.status?.status_name));
	const isSpent = $derived(tone === 'spent');

	const isFocused = $derived(alwaysExpanded || expanded);

	const inProgressStatusId = $derived(
		alertStatuses.find((s) => s.status_name.toLowerCase().trim() === 'in progress')?.status_id ??
			alertStatuses.length
	);

	// Built from the route, not the current path: the card also renders on
	// `/alerts/<id>` itself, where appending gave `/alerts/<id>/<id>`.
	const getAlertUrl = () => `${page.url.origin}/alerts/${alert.alert_id}`;

	// Buttons contributed by modules that registered
	// `on_manual_trigger_alert`. Shared across every card on the page —
	// see the store for why it isn't fetched per card. Triggering one
	// writes to the alert, so the items are hidden without alerts_write
	// rather than left to fail with a 403 on click.
	const userCtx = getContext<UserCtx>(USER_CTX);
	const canTriggerHooks = $derived(
		alertHooks.options.length > 0 && userCtx?.can('alerts_write') === true
	);

	onMount(() => void alertHooks.load());

	const triggerHook = async (hookOption: HookOption) => {
		const result = await callAlertHook([alert.alert_id], hookOption);
		toast({
			title: result.message,
			variant: result.status === 'error' ? 'destructive' : 'success'
		});
	};
</script>

<Card.Root
	class={`group flex min-w-0 grow overflow-hidden border-l-[3px] transition-[box-shadow,background-color,border-color] duration-300 ${ALERT_CARD_ACCENT[tone]} ${isFocused ? 'shadow-glow-blue ring-1 ring-iris-blue/30' : ''} ${isSpent && !isFocused ? 'bg-muted/40 shadow-none' : ''}`}
>
	<Collapsible.Root
		open={alwaysExpanded ? true : expanded}
		onOpenChange={alwaysExpanded ? undefined : onExpandedChange}
		disabled={alwaysExpanded}
	>
		<Card.Header
			class="!flex !flex-col !gap-3 !space-y-0 !p-4 !pb-2 sm:!flex-row sm:!items-center sm:!justify-between"
		>
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<div class="relative flex h-10 w-12 shrink-0">
					<!--
					  Collapsible.Trigger is itself a <button> — it carries the
					  class rather than wrapping one, since a nested <button> gets
					  flattened into a sibling by the parser and the trigger ends
					  up with nothing clickable inside it.
					-->
					<Collapsible.Trigger
						class={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-white ${alwaysExpanded ? 'cursor-default' : 'hover:z-50 hover:brightness-110'} ${getBackgroundBySeverity(alert.severity.severity_name)}`}
					>
						<FlameIcon size="20" />
					</Collapsible.Trigger>

					<button
						class={`absolute left-5 top-3 z-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${alert.owner ? 'bg-blue-400' : 'bg-orange-700'}`}
						title={alert.owner
							? `Owner: ${alert.owner.user_name ?? alert.owner.user_login ?? ''} — click to reassign`
							: 'Unassigned — click to assign'}
						onclick={onAssign}
					>
						{#if alert.owner}
							<UserAvatar
								userId={alert.alert_owner_id ?? null}
								name={alert.owner.user_name ?? ''}
								size="size-8"
							/>
						{:else}
							<HandIcon size="20" />
						{/if}
					</button>
				</div>

				<!--
				  Title block is a flex row of (trigger, copy icon). The
				  trigger stays a native <button> so keyboard/toggle
				  behaviour is unchanged; the ClipboardCopy sits beside
				  it as a sibling (nested <button>s would be invalid HTML
				  and would also make the copy click toggle the card).
				  Reveal-on-hover for the copy icon rides on the outer
				  <Card.Root class="group ..."> ancestor (line 116).
				-->
				<div class="flex min-w-0 flex-1 items-start gap-1">
					<Collapsible.Trigger
						class={`min-w-0 flex-1 text-left transition-colors ${alwaysExpanded ? '' : 'cursor-pointer hover:text-primary'}`}
					>
						<h3
							class={`text-sm font-semibold sm:truncate ${isSpent ? 'text-muted-foreground' : ''}`}
						>
							{alert.alert_title}
						</h3>
						<p class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
							{#if isSpent}
								<!--
								  Finished alerts say so where the eye lands, with the
								  resolution when there is one — rather than being
								  faded and left for the reader to work out why.
								-->
								<span
									class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
								>
									<CheckCircle2Icon size="12" />
									{alert.resolution_status
										? `${alert.status.status_name} · ${alert.resolution_status.resolution_status_name}`
										: alert.status.status_name}
								</span>
							{/if}
							<span class="truncate">#{alert.alert_id} - {alert.alert_uuid}</span>
						</p>
					</Collapsible.Trigger>
					<ClipboardCopy
						value={alert.alert_title}
						tooltipText="Copy title"
						size={12}
						className="mt-0.5"
					/>
				</div>
			</div>

			<div class="flex min-w-0 flex-wrap items-center gap-3 sm:gap-6">
				<!--
				  Investigation-flow trigger — always visible when a flow
				  is attached (unlike the neighbouring actions row it does
				  NOT hide behind :hover, because the button doubles as an
				  indicator that this alert has a checklist ready).
				  Rendered outside Collapsible.Trigger so clicking it does
				  not toggle the card. Handler is optional — call sites
				  that don't wire it up simply won't see the button.
				-->
				{#if alert.investigation_flow && onShowInvestigationFlow}
					<Button
						variant="outline"
						size="xs"
						class="border-primary/40 text-primary hover:bg-primary/10"
						onclick={(e) => {
							e.stopPropagation();
							onShowInvestigationFlow?.();
						}}
					>
						<CheckSquareIcon class="mr-1 h-3.5 w-3.5" />
						Investigation flow
					</Button>
				{/if}
				<div
					class={`hidden flex-wrap items-center gap-2 transition-opacity sm:flex ${showHeaderActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
				>
					<Button variant="outline" size="xs" onclick={onShowMerge}>Merge</Button>

					<DropdownMenu bind:open={isAssignMenuOpen}>
						<DropdownMenuTrigger>
							<Button variant="outline" size="xs">
								Assign

								<ChevronDownIcon size="14" />
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onclick={() => {
									onAssignToCurrentUser();
								}}>Assign to me</DropdownMenuItem
							>

							<DropdownMenuItem onclick={() => onAssign()}>Assign</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu bind:open={isSetStatusMenuOpen}>
						<DropdownMenuTrigger>
							<Button variant="outline" size="xs">
								Set status

								<ChevronDownIcon size="14" />
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							{#each alertStatuses as alertStatus}
								<DropdownMenuItem onclick={() => onSetStatus(alertStatus.status_id)}>
									{alertStatus.status_name}</DropdownMenuItem
								>
							{/each}
						</DropdownMenuContent>
					</DropdownMenu>

					{#if isSpent}
						<!-- Doubles as the undo for an accidental close. -->
						<Button variant="outline" size="xs" onclick={() => onSetStatus(inProgressStatusId)}>
							<RotateCcwIcon size="14" />
							Reopen
						</Button>
					{:else if alert.status.status_name.toLowerCase() === 'in progress'}
						<Button variant="destructive" size="xs" onclick={() => onShowClose(true)}
							>Close with note</Button
						>
						<Button variant="destructive" size="xs" onclick={() => onShowClose(false)}>Close</Button
						>
					{:else}
						<Button variant="default" size="xs" onclick={() => onSetStatus(inProgressStatusId)}
							>Set In Progress</Button
						>
					{/if}
				</div>

				<div class="relative flex items-center gap-3">
					<button
						title="comments"
						onclick={onShowComments}
						class="relative flex text-muted-foreground transition-colors hover:text-foreground"
					>
						<MessagesSquareIcon class="absolute -bottom-2 right-0" size="16" />

						{#if alert.comments?.length}
							<div
								class="absolute -right-2 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-2xs text-white"
							>
								{alert.comments.length}
							</div>
						{/if}
					</button>

					<button
						title="edit"
						onclick={onShowEdit}
						class="text-muted-foreground transition-colors hover:text-foreground"
					>
						<PencilIcon size="16" />
					</button>

					<DropdownMenu bind:open={isMenuOpen}>
						<DropdownMenuTrigger
							title="menu"
							class="text-muted-foreground transition-colors hover:text-foreground"
						>
							<EllipsisVerticalIcon size="16" />
						</DropdownMenuTrigger>

						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onclick={() => {
									navigator.clipboard
										.writeText(getAlertUrl())
										.then(() => {
											toast({
												title: 'Link copied',
												variant: 'success'
											});
										})
										.catch((e) => {
											console.error('Clipboard copy error:', e);

											toast({
												title: 'Could not copy link',
												variant: 'destructive'
											});
										});
								}}><ForwardIcon /> Share</DropdownMenuItem
							>

							<DropdownMenuItem
								onclick={() => {
									navigator.clipboard
										.writeText(`[<i class="fa-solid fa-bell"></i> #25](${getAlertUrl()})`)
										.then(() => {
											toast({
												title: 'Link copied',
												variant: 'success'
											});
										})
										.catch((e) => {
											console.error('Clipboard copy error:', e);

											toast({
												title: 'Could not copy link',
												variant: 'destructive'
											});
										});
								}}><FileSymlinkIcon /> Markdown Link</DropdownMenuItem
							>

							<Separator />

							<DropdownMenuItem onclick={onShowHistory}><HistoryIcon /> History</DropdownMenuItem>

							{#if canTriggerHooks}
								<Separator />

								{#each alertHooks.options as hookOption (hookOptionKey(hookOption))}
									<DropdownMenuItem onclick={() => triggerHook(hookOption)}>
										<CircleArrowRightIcon />
										{hookOption.manual_hook_ui_name}
									</DropdownMenuItem>
								{/each}
							{/if}

							<Separator />

							<DropdownMenuItem onclick={onDelete} class="text-red-500 hover:!text-red-600"
								><TrashIcon /> Delete alert</DropdownMenuItem
							>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</Card.Header>

		<!-- No padding while a finished card is collapsed: its description is
		     hidden, and the empty band would split header from footer. -->
		<Card.Content class={`min-w-0 !px-4 ${isSpent && !isFocused ? '!py-0' : '!py-3'}`}>
			<!--
			  Description is rendered as sanitized markdown so operators
			  who paste findings from a report (headings, lists, links,
			  code) get formatting. MarkDownPreview runs Showdown output
			  through DOMPurify, so untrusted alert content is safe.
			  Plain text still renders as plain text.
			-->
			<!--
			  A finished alert keeps to its header and footer until it is
			  opened: its description is the part nobody needs to re-read,
			  and dropping it is what lets a closed card step back from the
			  ones still waiting on someone.
			-->
			{#if !isSpent || isFocused}
				<div class="text-sm text-muted-foreground">
					<MarkDownPreview markdown={alert.alert_description ?? ''} />
				</div>
			{/if}

			<Collapsible.Content
				class="overflow-hidden pt-4 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
			>
				{#if detailsLoaded}
					<AlertCardDetails {alert} />
				{/if}
			</Collapsible.Content>
		</Card.Content>

		<AlertCardFooter {alert} {tone} {onUnlinkCase} />
	</Collapsible.Root>
</Card.Root>
