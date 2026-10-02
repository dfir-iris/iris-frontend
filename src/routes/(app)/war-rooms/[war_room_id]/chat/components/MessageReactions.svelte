<!--
  Reactions strip under a chat message. Renders one pill per unique
  emoji with its running total; pills the current user reacted with
  get a highlighted ring. Clicking a pill toggles the user's own
  reaction on that emoji (via the shared backend toggle endpoint).

  A trailing "+" button opens the emoji picker in a popover so the
  operator can pick any emoji, not just the ones already used.

  Hovering a pill lists who reacted, "You" first.
-->
<script lang="ts">
	import { SmilePlusIcon } from 'lucide-svelte';
	import type { ChatReaction } from '$lib/services/war-room-chat.service';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import EmojiPickerPopover from './EmojiPickerPopover.svelte';

	type Props = {
		reactions: ChatReaction[];
		currentUserId: number | null;
		onToggle: (emoji: string) => void;
	};

	let { reactions, currentUserId, onToggle }: Props = $props();

	let pickerOpen = $state(false);
	let pickerAnchor = $state<HTMLButtonElement | null>(null);

	const isReactedByMe = (r: ChatReaction): boolean =>
		currentUserId != null && r.user_ids.includes(currentUserId);

	// Past this many names the tooltip stops being readable at a glance.
	const MAX_NAMED_REACTORS = 10;
	const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

	// Walks `user_ids` rather than `users`: after the caller's own toggle
	// the page patches `user_ids` locally and `users` lags until the next
	// refresh. The caller is always "You", so that gap never shows.
	const reactorsLabel = (r: ChatReaction): string => {
		const namesById = new Map((r.users ?? []).map((u) => [u.user_id, u.user_name || u.user_login]));
		const others = r.user_ids
			.filter((id) => id !== currentUserId)
			.map((id) => namesById.get(id) || 'Unknown user');
		const names = isReactedByMe(r) ? ['You', ...others] : others;
		const shown = names.slice(0, MAX_NAMED_REACTORS);
		const hidden = names.length - shown.length;
		if (hidden > 0) shown.push(`${hidden} ${hidden === 1 ? 'other' : 'others'}`);
		return listFormat.format(shown);
	};
</script>

<div class="mt-1 flex flex-wrap items-center gap-1">
	<TooltipProvider delayDuration={200}>
		{#each reactions as r (r.emoji)}
			{@const mine = isReactedByMe(r)}
			{@const reactors = reactorsLabel(r)}
			<Tooltip>
				<TooltipTrigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors {mine
								? 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/20'
								: 'border-border/60 bg-muted/40 text-foreground hover:bg-muted'}"
							onclick={() => onToggle(r.emoji)}
							aria-label={`${r.emoji} ${reactors}`}
						>
							<span class="text-sm leading-none">{r.emoji}</span>
							<span class="tabular-nums">{r.count}</span>
						</button>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent side="top" class="max-w-xs">
					<p class="text-xs">{reactors}</p>
				</TooltipContent>
			</Tooltip>
		{/each}
	</TooltipProvider>

	<div class="relative">
		<button
			type="button"
			bind:this={pickerAnchor}
			class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border/50 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
			onclick={() => (pickerOpen = !pickerOpen)}
			aria-label="Add reaction"
			title="Add reaction"
		>
			<SmilePlusIcon class="h-3.5 w-3.5" />
		</button>

		<EmojiPickerPopover
			open={pickerOpen}
			onOpenChange={(v) => (pickerOpen = v)}
			onPick={onToggle}
			anchor={pickerAnchor}
			align="left"
		/>
	</div>
</div>
