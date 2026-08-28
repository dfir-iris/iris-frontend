<!--
  Inline poll card rendered when a chat message has `kind === 'poll'`.
  Displays question, options, tallies, and voting controls.

  Voting model:
  - Single-select polls (radio) commit on click.
  - Multi-select polls (checkbox) commit on the "Save votes" button.
  - `myVotes` is treated as the source of truth for what the current
    user has selected. It's replaced whenever the parent hands us a
    fresh poll after a successful vote broadcast / refetch.

  Anonymous polls: voter identity is stripped by the backend serializer
  (`voters` array is absent). We still show per-option counts + %
  tallies; we just don't render voter chips underneath.

  Closed-poll rules: the parent decides `isClosed` via the poll's
  `is_closed` flag (which already accounts for `closes_at` in the
  past). We disable inputs + hide the vote/close buttons.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { BarChart3, Check, Clock, EyeOff, Loader2, Lock, Users } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { ChatPoll } from '$lib/services/war-room-chat.service';

	type Props = {
		poll: ChatPoll;
		currentUserId: number | null;
		canClose: boolean;
		onVote: (optionIds: number[]) => Promise<void> | void;
		onClose: () => Promise<void> | void;
	};

	let { poll, currentUserId, canClose, onVote, onClose }: Props = $props();

	// Initialised in the $effect below so we don't capture `poll.my_votes`
	// at mount time — Svelte 5 warns about state derived from a prop
	// snapshot. `null` acts as "not yet synced".
	let selection = $state<Set<number>>(new Set());
	let submitting = $state(false);
	let closing = $state(false);

	// Re-sync selection when the poll prop swaps (parent refetched
	// after a broadcast). Guard on identity + a stable votes key so a
	// server round-trip that yields the same votes doesn't stomp any
	// in-flight local edits.
	let lastPollId = $state<number | null>(null);
	let lastVotesKey = $state<string | null>(null);
	$effect(() => {
		const votesKey = poll.my_votes
			.slice()
			.sort((a, b) => a - b)
			.join(',');
		if (poll.poll_id !== lastPollId || votesKey !== lastVotesKey) {
			selection = new Set(poll.my_votes);
			lastPollId = poll.poll_id;
			lastVotesKey = votesKey;
		}
	});

	const isSelected = (optionId: number): boolean => selection.has(optionId);

	const toggle = (optionId: number) => {
		if (poll.is_closed) return;
		if (poll.is_multi_select) {
			const next = new Set(selection);
			if (next.has(optionId)) next.delete(optionId);
			else next.add(optionId);
			selection = next;
			return;
		}
		// Single-select: commit immediately. Radio button + auto-submit
		// mirrors the "one click, done" feel of Slack polls.
		selection = new Set([optionId]);
		void submit();
	};

	const submit = async () => {
		submitting = true;
		try {
			await onVote([...selection]);
		} finally {
			submitting = false;
		}
	};

	const clearVote = async () => {
		selection = new Set();
		await submit();
	};

	const doClose = async () => {
		closing = true;
		try {
			await onClose();
		} finally {
			closing = false;
		}
	};

	// Total across all options — the denominator for the per-option
	// share. Multi-select polls count each user's selections
	// separately (a user picking 3 options contributes 3 to the total),
	// which is the standard convention.
	const totalVotes = $derived(poll.options.reduce((sum, o) => sum + o.vote_count, 0));

	const pct = (count: number): number => {
		if (totalVotes === 0) return 0;
		return Math.round((count / totalVotes) * 100);
	};

	// Deadline countdown. Refreshes every 30s while the card is
	// mounted so a "closes in 2m" chip doesn't sit stale. Not exact —
	// the backend closes on the first vote after `closes_at`, so
	// there's a small lag between "shows 0m" and "actually locked".
	let now = $state(Date.now());
	const tick = setInterval(() => (now = Date.now()), 30_000);
	onDestroy(() => clearInterval(tick));

	const deadlineChip = $derived.by(
		(): { label: string; tone: 'live' | 'warn' | 'closed' } | null => {
			if (poll.is_closed) return { label: 'Closed', tone: 'closed' };
			if (!poll.closes_at) return null;
			const closesAt = new Date(poll.closes_at).getTime();
			const diff = closesAt - now;
			if (diff <= 0) return { label: 'Closing…', tone: 'warn' };
			const mins = Math.floor(diff / 60_000);
			if (mins < 60)
				return { label: `Closes in ${Math.max(1, mins)}m`, tone: mins < 5 ? 'warn' : 'live' };
			const hours = Math.floor(mins / 60);
			if (hours < 24) return { label: `Closes in ${hours}h`, tone: 'live' };
			const days = Math.floor(hours / 24);
			return { label: `Closes in ${days}d`, tone: 'live' };
		}
	);
</script>

<div class="rounded-lg border border-border/60 bg-card/40 p-3">
	<div class="mb-2 flex items-start justify-between gap-2">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<BarChart3 class="h-4 w-4 shrink-0 text-primary" />
				<p class="min-w-0 break-words text-sm font-medium">
					{poll.question}
				</p>
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
				{#if poll.is_anonymous}
					<span
						class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
						title="Voter identities are hidden"
					>
						<EyeOff class="h-2.5 w-2.5" />
						Anonymous
					</span>
				{/if}
				{#if poll.is_multi_select}
					<span
						class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
					>
						<Users class="h-2.5 w-2.5" />
						Multi-select
					</span>
				{/if}
				{#if deadlineChip}
					<span
						class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 {deadlineChip.tone ===
						'closed'
							? 'bg-muted text-muted-foreground'
							: deadlineChip.tone === 'warn'
								? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
								: 'bg-primary/10 text-primary'}"
					>
						{#if deadlineChip.tone === 'closed'}
							<Lock class="h-2.5 w-2.5" />
						{:else}
							<Clock class="h-2.5 w-2.5" />
						{/if}
						{deadlineChip.label}
					</span>
				{/if}
				<span class="text-muted-foreground">
					{totalVotes}
					{totalVotes === 1 ? 'vote' : 'votes'}
				</span>
			</div>
		</div>
	</div>

	<ul class="flex flex-col gap-2">
		{#each poll.options as opt (opt.option_id)}
			{@const share = pct(opt.vote_count)}
			{@const mine = isSelected(opt.option_id)}
			<li>
				<button
					type="button"
					class={[
						'group/opt relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
						mine ? 'border-primary/60' : 'border-border/60',
						poll.is_closed ? 'cursor-not-allowed opacity-70' : 'hover:bg-muted/50'
					]}
					disabled={poll.is_closed}
					onclick={() => toggle(opt.option_id)}
				>
					<!-- Fill bar sits behind text to show share -->
					<span
						class={[
							'pointer-events-none absolute inset-y-0 left-0 -z-10',
							mine ? 'bg-primary/15' : 'bg-muted/60'
						]}
						style="width: {share}%"
						aria-hidden="true"
					></span>

					{#if poll.is_multi_select}
						<Checkbox
							checked={mine}
							onCheckedChange={() => toggle(opt.option_id)}
							disabled={poll.is_closed}
							aria-label={opt.label}
						/>
					{:else}
						<span
							class={[
								'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
								mine ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
							]}
							aria-hidden="true"
						>
							{#if mine}
								<Check class="h-2.5 w-2.5" />
							{/if}
						</span>
					{/if}

					<span class="min-w-0 flex-1 break-words">
						{opt.label}
					</span>
					<span class="shrink-0 tabular-nums text-muted-foreground">
						{opt.vote_count} · {share}%
					</span>
				</button>

				{#if !poll.is_anonymous && opt.voters && opt.voters.length > 0}
					<div class="mt-0.5 flex flex-wrap gap-1 pl-6 text-2xs text-muted-foreground">
						{#each opt.voters as v (v.user_id)}
							<span class="rounded bg-muted/60 px-1 py-0.5">
								{v.user_name ?? v.user_login ?? `user ${v.user_id}`}
							</span>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if !poll.is_closed}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if poll.is_multi_select}
				<Button
					size="sm"
					class="h-7 text-xs"
					disabled={submitting || currentUserId == null}
					onclick={() => void submit()}
				>
					{#if submitting}
						<Loader2 class="mr-1 h-3 w-3 animate-spin" />
					{/if}
					Save votes
				</Button>
			{/if}
			{#if selection.size > 0}
				<button
					type="button"
					class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
					disabled={submitting}
					onclick={() => void clearVote()}
				>
					Clear my vote{selection.size === 1 ? '' : 's'}
				</button>
			{/if}
			{#if canClose}
				<button
					type="button"
					class="ml-auto text-2xs text-muted-foreground transition-colors hover:text-destructive"
					disabled={closing}
					onclick={() => void doClose()}
					title="End voting"
				>
					{#if closing}
						<Loader2 class="mr-1 inline h-3 w-3 animate-spin" />
					{/if}
					Close poll
				</button>
			{/if}
		</div>
	{/if}
</div>
