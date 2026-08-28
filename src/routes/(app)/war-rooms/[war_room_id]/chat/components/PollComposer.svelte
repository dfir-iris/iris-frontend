<!--
  Modal for creating a new chat poll. Owns:
    - Question (required)
    - Options (min 2, max 20, dynamic add/remove)
    - Multi-select toggle
    - Anonymous toggle
    - Optional close-at datetime

  Submits via the parent's `onSubmit`. The parent is responsible for
  the API round-trip so this component stays presentational and can
  be reused (e.g. in a future thread-level poll flow).

  Datetime input: uses the native `datetime-local` control. Values are
  in local time and are serialized to a Zulu ISO-8601 string in
  `submit()` so the backend receives an unambiguous instant.
-->
<script lang="ts">
	import { BarChart3, Loader2, Plus, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';

	type SubmitBody = {
		question: string;
		options: string[];
		is_multi_select: boolean;
		is_anonymous: boolean;
		closes_at: string | null;
	};

	type Props = {
		open: boolean;
		onOpenChange: (v: boolean) => void;
		onSubmit: (body: SubmitBody) => Promise<boolean>;
	};

	let { open, onOpenChange, onSubmit }: Props = $props();

	const MIN_OPTIONS = 2;
	const MAX_OPTIONS = 20;

	let question = $state('');
	// Start with two empty option rows — matches the minimum the
	// backend enforces and gives the operator a visible affordance
	// for "there needs to be at least two".
	let options = $state<string[]>(['', '']);
	let isMultiSelect = $state(false);
	let isAnonymous = $state(false);
	let hasDeadline = $state(false);
	let deadlineLocal = $state(''); // `datetime-local` string (local TZ)
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Reset on close so the next open starts fresh. Otherwise a
	// dismissed draft leaks state into the next poll.
	$effect(() => {
		if (!open) {
			question = '';
			options = ['', ''];
			isMultiSelect = false;
			isAnonymous = false;
			hasDeadline = false;
			deadlineLocal = '';
			error = null;
			submitting = false;
		}
	});

	const addOption = () => {
		if (options.length >= MAX_OPTIONS) return;
		options = [...options, ''];
	};

	const removeOption = (idx: number) => {
		if (options.length <= MIN_OPTIONS) return;
		options = options.filter((_, i) => i !== idx);
	};

	const setOption = (idx: number, value: string) => {
		options = options.map((v, i) => (i === idx ? value : v));
	};

	const canSubmit = $derived.by(() => {
		if (!question.trim()) return false;
		const nonEmpty = options.map((o) => o.trim()).filter(Boolean);
		if (nonEmpty.length < MIN_OPTIONS) return false;
		if (hasDeadline && !deadlineLocal) return false;
		return true;
	});

	const submit = async () => {
		if (!canSubmit || submitting) return;
		error = null;
		submitting = true;
		const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
		let closesAtIso: string | null = null;
		if (hasDeadline && deadlineLocal) {
			// The native input gives us a local wall-clock time. Convert
			// to a proper ISO instant so the backend can compare it
			// against server-side `now()` without TZ ambiguity.
			const asDate = new Date(deadlineLocal);
			if (isNaN(asDate.getTime())) {
				error = 'Invalid deadline';
				submitting = false;
				return;
			}
			closesAtIso = asDate.toISOString();
		}
		const ok = await onSubmit({
			question: question.trim(),
			options: trimmedOptions,
			is_multi_select: isMultiSelect,
			is_anonymous: isAnonymous,
			closes_at: closesAtIso
		});
		submitting = false;
		if (ok) onOpenChange(false);
	};
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<BarChart3 class="h-4 w-4 text-primary" />
				New poll
			</Dialog.Title>
			<Dialog.Description>
				Post a poll to the war-room stream. Everyone with room access can vote.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<div>
				<label class="text-2xs uppercase tracking-wider text-muted-foreground" for="poll-question">
					Question
				</label>
				<Input
					id="poll-question"
					bind:value={question}
					placeholder="What should we do next?"
					maxlength={500}
					class="mt-1"
				/>
			</div>

			<div>
				<label class="text-2xs uppercase tracking-wider text-muted-foreground" for="poll-opt-0">
					Options ({options.length}/{MAX_OPTIONS})
				</label>
				<ul class="mt-1 flex flex-col gap-1.5">
					{#each options as opt, i (i)}
						<li class="flex items-center gap-2">
							<Input
								id={i === 0 ? 'poll-opt-0' : undefined}
								value={opt}
								oninput={(e) => setOption(i, (e.target as HTMLInputElement).value)}
								placeholder={`Option ${i + 1}`}
								maxlength={200}
								class="flex-1"
							/>
							<button
								type="button"
								class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
								onclick={() => removeOption(i)}
								disabled={options.length <= MIN_OPTIONS}
								aria-label={`Remove option ${i + 1}`}
							>
								<X class="h-3.5 w-3.5" />
							</button>
						</li>
					{/each}
				</ul>
				<button
					type="button"
					class="mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
					onclick={addOption}
					disabled={options.length >= MAX_OPTIONS}
				>
					<Plus class="h-3 w-3" />
					Add option
				</button>
			</div>

			<div class="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-2">
				<label class="flex cursor-pointer items-center gap-2 text-xs">
					<Checkbox checked={isMultiSelect} onCheckedChange={(v) => (isMultiSelect = v === true)} />
					<span>Allow multiple selections</span>
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-xs">
					<Checkbox checked={isAnonymous} onCheckedChange={(v) => (isAnonymous = v === true)} />
					<span
						>Anonymous voting <span class="text-muted-foreground">(voter names hidden)</span></span
					>
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-xs">
					<Checkbox checked={hasDeadline} onCheckedChange={(v) => (hasDeadline = v === true)} />
					<span>Close automatically at…</span>
				</label>
				{#if hasDeadline}
					<Input type="datetime-local" bind:value={deadlineLocal} class="mt-1 text-xs" />
				{/if}
			</div>

			{#if error}
				<p class="text-xs text-destructive">{error}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)} disabled={submitting}>
				Cancel
			</Button>
			<Button onclick={() => void submit()} disabled={!canSubmit || submitting}>
				{#if submitting}
					<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
				{/if}
				Create poll
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
