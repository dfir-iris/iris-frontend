<!--
  A Lucene-syntax search bar.

  The backend is the authority on what an expression *means* — this
  component never compiles the text into request parameters, it submits
  the string verbatim and lets `GET /api/v2/alerts?query=…` decide. The
  local parser (`$lib/search/lucene`) exists only to make typing bearable:
  split the committed expression into chips, colour what is being typed,
  underline a mistake before the round trip, and know what word the caret
  is on so the right values can be offered.

  Because the parser is advisory, a local diagnostic **warns but does not
  block**. If the mirror ever drifts from the Python lexer, a query the
  server would happily run must still be runnable.

  Two pieces of text live here, and keeping them apart is the whole design:

  - `value` — what has been committed, and therefore what the queue is
    filtered by. It is shown as one chip per top-level AND conjunct, each
    removable on its own.
  - `text` — the clause being typed, which is not filtering anything yet.
    Enter appends it to `value` and empties the input.

  The typed fragment is highlighted with the usual transparent-input-over
  -coloured-overlay trick: one `<input>` the browser owns (selection, IME,
  undo all keep working) with an `aria-hidden` copy painted behind it. The
  input therefore has **no background of its own** — an opaque one would
  paint straight over the copy and leave nothing but the selection
  rectangle visible. The border, background and focus ring belong to the
  shell around both. The two must also share font metrics and padding
  exactly, or the caret drifts off the glyphs, which is why those classes
  are duplicated rather than factored out.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SearchIcon, XIcon } from 'lucide-svelte';
	import {
		tokenize,
		parseLucene,
		splitConjuncts,
		removeNode,
		appendExpression,
		hasLooseAlternation,
		tightenAlternation,
		caretContext,
		applySuggestion,
		quoteIfNeeded
	} from '$lib/search/lucene';
	import type { Conjunct, Diagnostic } from '$lib/search/lucene';
	import type { AlertSearchField } from '$lib/services/alerts.service';
	import { cn } from '$lib/utils';

	type Props = {
		/** The committed expression — what the chips show, and what filters. */
		value: string;
		onSubmit: (query: string) => void;
		/** The vocabulary, from `GET /api/v2/alerts/search-schema`. */
		fields?: AlertSearchField[];
		/**
		 * Values to offer after `field:`, for the fields whose values are
		 * rows rather than a fixed set. The page already holds the statuses,
		 * severities, customers and owners the caller may see, so asking it
		 * costs nothing and never names a tenant they cannot read.
		 */
		valuesFor?: (alias: string) => string[];
		/**
		 * What the backend said when it refused the last expression, with
		 * the offset it gave up at.
		 *
		 * The local parser knows the grammar but not the vocabulary — an
		 * unknown alias or an unresolvable value is only detectable server
		 * -side — so this is how those are pinned to the chip that caused
		 * them rather than surfacing only as a toast.
		 */
		serverError?: { message: string; position: number | null } | null;
		/** Key used to remember recent queries. Unset disables the history. */
		historyKey?: string | null;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
	};

	let {
		value,
		onSubmit,
		fields = [],
		valuesFor,
		serverError = null,
		historyKey = null,
		placeholder = 'Search alerts — try  is:open owner:me severity:>=High',
		disabled = false,
		class: className
	}: Props = $props();

	const MAX_HISTORY = 8;
	const MAX_SUGGESTIONS = 8;

	let inputEl = $state<HTMLInputElement | null>(null);
	let overlayEl = $state<HTMLDivElement | null>(null);
	let rootEl = $state<HTMLDivElement | null>(null);

	// Only ever the clause being typed. It deliberately does *not* mirror
	// `value`: everything already committed is a chip, so there is nothing
	// to seed the input from and nothing to resynchronise when the parent
	// hands back a new expression.
	let text = $state('');
	let caret = $state(0);
	let focused = $state(false);
	let highlighted = $state(0);
	let history = $state<string[]>([]);

	onMount(() => {
		if (historyKey) history = readHistory(historyKey);

		// `/` focuses the bar, the convention everywhere else a queue is
		// searched. Ctrl+K belongs to the case switcher and Ctrl+/ to the
		// global search, so neither was available.
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTyping(event.target)) return;
			event.preventDefault();
			inputEl?.focus();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const isTyping = (target: EventTarget | null): boolean => {
		const element = target as HTMLElement | null;
		if (!element) return false;
		const tag = element.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
	};

	const readHistory = (key: string): string[] => {
		try {
			const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
			if (!Array.isArray(parsed)) return [];
			return parsed.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
		} catch {
			// A corrupt or unavailable store is not worth a broken search bar.
			return [];
		}
	};

	const remember = (expression: string) => {
		if (!historyKey || expression === '') return;
		const next = [expression, ...history.filter((entry) => entry !== expression)].slice(
			0,
			MAX_HISTORY
		);
		history = next;
		try {
			window.localStorage.setItem(historyKey, JSON.stringify(next));
		} catch {
			// Private-mode / quota. The list stays in memory for this session.
		}
	};

	/* ------------------------------------------------------------------ */
	/* Chips                                                               */
	/* ------------------------------------------------------------------ */

	/** The committed expression, as the removable pieces it is made of. */
	const chips = $derived(splitConjuncts(value));

	/** Stable within one `value`, which is all `{#each}` needs. */
	const keyOf = (chip: Conjunct) => `${chip.span.from}:${chip.span.to}`;

	/**
	 * The chip the backend's offset lands in.
	 *
	 * An unknown alias or an unresolvable value is not a syntax error, so
	 * the local parser is happy with it and only the server's character
	 * offset says which condition is at fault. Marking that one chip beats
	 * reddening the whole bar.
	 */
	const erroredChipKey = $derived.by<string | null>(() => {
		const position = serverError?.position;
		if (position === undefined || position === null) return null;

		const chip = chips.find(
			(candidate) => position >= candidate.span.from && position < candidate.span.to
		);
		return chip ? keyOf(chip) : null;
	});

	/**
	 * Whether the committed expression is one chip because an `OR` took
	 * everything in front of it.
	 *
	 * This is the one piece of the grammar that surprises people, and it
	 * surprises them by making the bar look broken: a working query of five
	 * conditions collapses into a single unreadable chip the moment `OR x`
	 * is appended. The expression is right — it is the silence that is
	 * wrong.
	 */
	const looseAlternation = $derived(hasLooseAlternation(value));

	/** The other reading, when there is exactly one. See `tightenAlternation`. */
	const tightened = $derived(looseAlternation ? tightenAlternation(value) : null);

	const tighten = () => {
		if (tightened === null) return;
		remember(tightened);
		commit(tightened);
	};

	/* ------------------------------------------------------------------ */
	/* Highlighting                                                        */
	/* ------------------------------------------------------------------ */

	const TOKEN_CLASS: Record<string, string> = {
		field: 'text-primary font-medium',
		phrase: 'text-emerald-600 dark:text-emerald-400',
		and: 'text-violet-600 dark:text-violet-400 font-medium',
		or: 'text-violet-600 dark:text-violet-400 font-medium',
		not: 'text-violet-600 dark:text-violet-400 font-medium',
		require: 'text-violet-600 dark:text-violet-400 font-medium',
		to: 'text-violet-600 dark:text-violet-400 font-medium',
		lparen: 'text-muted-foreground',
		rparen: 'text-muted-foreground',
		lbracket: 'text-muted-foreground',
		rbracket: 'text-muted-foreground',
		lbrace: 'text-muted-foreground',
		rbrace: 'text-muted-foreground'
	};

	/**
	 * What is wrong with the clause being typed.
	 *
	 * Syntax only — the local parser knows the grammar but not the
	 * vocabulary, so an unknown field or an unresolvable value still comes
	 * back from the server. See `$lib/search/lucene` for why that split is
	 * deliberate.
	 *
	 * A complaint about the very end of the input is held back while the
	 * input has focus: `status:` is "ends unexpectedly" right up until the
	 * value is typed, and flagging that on every keystroke is how the line
	 * stops being read at all.
	 */
	const localDiagnostics = $derived.by<Diagnostic[]>(() => {
		const found = parseLucene(text).diagnostics;
		if (!focused) return found;
		return found.filter((diagnostic) => diagnostic.to < text.length);
	});

	/** One message at a time; a stack of five is a stack nobody reads. */
	const message = $derived<string | null>(
		localDiagnostics[0]?.message ?? serverError?.message ?? null
	);

	const overlaps = (from: number, to: number) =>
		localDiagnostics.some((diagnostic) => diagnostic.from < to && diagnostic.to > from);

	/**
	 * The painted fragment, as coloured runs.
	 *
	 * Built from token offsets rather than the token text, so the gaps
	 * between tokens — the whitespace the lexer drops — are preserved and
	 * the overlay lines up with the input character for character.
	 */
	const segments = $derived.by(() => {
		const { tokens } = tokenize(text);
		const runs: { text: string; className: string }[] = [];
		let cursor = 0;

		for (const token of tokens) {
			if (token.kind === 'eof') continue;
			if (token.from > cursor) runs.push({ text: text.slice(cursor, token.from), className: '' });

			runs.push({
				text: text.slice(token.from, token.to),
				className: cn(
					TOKEN_CLASS[token.kind] ?? '',
					overlaps(token.from, token.to) && 'underline decoration-destructive decoration-wavy'
				)
			});
			cursor = token.to;
		}

		if (cursor < text.length) runs.push({ text: text.slice(cursor), className: '' });
		return runs;
	});

	// The overlay has no scrollbar of its own, so it has to be dragged
	// along by hand whenever the input scrolls past its own width.
	const syncScroll = () => {
		if (overlayEl && inputEl) overlayEl.scrollLeft = inputEl.scrollLeft;
	};

	/* ------------------------------------------------------------------ */
	/* Autocomplete                                                        */
	/* ------------------------------------------------------------------ */

	const context = $derived(caretContext(text, caret));

	/** The catalogue entry an alias or synonym names. */
	const fieldFor = (alias: string): AlertSearchField | undefined => {
		const wanted = alias.toLowerCase();
		return fields.find(
			(field) =>
				field.alias.toLowerCase() === wanted ||
				field.synonyms.some((synonym) => synonym.toLowerCase() === wanted)
		);
	};

	type Suggestion = {
		label: string;
		detail: string;
		insert: string;
		/** What follows the insertion; the caret context's own rule when unset. */
		trailing?: string;
	};

	/**
	 * The boolean operators, offered wherever a field name is.
	 *
	 * Juxtaposition already means `AND`, so the bar is usable without any
	 * of these ever being typed — which is exactly why they have to be in
	 * the list. Every visible affordance here narrows: chips, values, the
	 * advanced grid. Nothing hints that a query can widen or exclude, and
	 * an analyst who cannot find `OR` runs two searches instead of one.
	 *
	 * `needsLeft` is the difference between joining and starting. `AND` and
	 * `OR` are meaningless without something in front of them, while `NOT`
	 * opens a clause perfectly well on its own.
	 */
	const OPERATORS: (Suggestion & { needsLeft: boolean })[] = [
		{ label: 'OR', detail: 'match either side', insert: 'OR', trailing: ' ', needsLeft: true },
		{
			label: 'AND',
			detail: 'match both — what a space between two conditions already means',
			insert: 'AND',
			trailing: ' ',
			needsLeft: true
		},
		{
			label: 'NOT',
			detail: 'exclude what follows',
			insert: 'NOT',
			trailing: ' ',
			needsLeft: false
		}
	];

	const matches = (candidate: string, word: string) =>
		word === '' || candidate.toLowerCase().startsWith(word.toLowerCase());

	const suggestions = $derived.by<Suggestion[]>(() => {
		if (disabled) return [];

		if (context.kind === 'value') {
			const field = context.field === null ? undefined : fieldFor(context.field);
			if (!field) return [];

			const values = field.values.length ? field.values : (valuesFor?.(field.alias) ?? []);

			return values
				.filter((candidate) => matches(candidate, context.word))
				.slice(0, MAX_SUGGESTIONS)
				.map((candidate) => ({
					label: candidate,
					detail: field.alias,
					insert: quoteIfNeeded(candidate)
				}));
		}

		if (context.kind === 'field') {
			// Synonyms are offered alongside the canonical alias: an analyst
			// who thinks "assignee" should not have to learn it is "owner".
			const names = fields.flatMap((field) =>
				[field.alias, ...field.synonyms].map((name) => ({ name, field }))
			);

			// An operator that joins needs something to join to. One that
			// starts a clause is still held back on an untouched bar unless
			// it was asked for by name — the first thing wanted there is a
			// field, not a syntax lesson.
			const joinable = text.slice(0, context.from).trim() !== '';
			const operators: Suggestion[] = OPERATORS.filter(
				(operator) =>
					(joinable || (!operator.needsLeft && context.word !== '')) &&
					matches(operator.label, context.word)
			);

			// Room is reserved for them rather than taken from the end of the
			// list, which is where a long run of matching field names would
			// otherwise push them off.
			return [
				...names
					.filter((entry) => matches(entry.name, context.word))
					.slice(0, MAX_SUGGESTIONS - operators.length)
					.map((entry) => ({
						label: entry.name,
						detail: entry.field.description,
						insert: entry.name
					})),
				...operators
			];
		}

		return [];
	});

	/**
	 * Past expressions, offered instead of field names on a bar that is
	 * empty in both senses — nothing typed *and* nothing committed. With
	 * chips already on screen the analyst is narrowing this search, not
	 * reaching for an earlier one.
	 */
	const showHistory = $derived(focused && text === '' && value === '' && history.length > 0);
	const popoverOpen = $derived(focused && (showHistory || suggestions.length > 0));

	// Any change to what is on offer invalidates the highlighted row —
	// otherwise Enter accepts whatever has slid into that slot.
	$effect(() => {
		void suggestions;
		void showHistory;
		highlighted = 0;
	});

	const syncCaret = () => {
		caret = inputEl?.selectionStart ?? text.length;
	};

	const focusEnd = async () => {
		await tick();
		inputEl?.focus();
		inputEl?.setSelectionRange(text.length, text.length);
		syncCaret();
	};

	/* ------------------------------------------------------------------ */
	/* Committing                                                          */
	/* ------------------------------------------------------------------ */

	/** Hand an expression to the parent. Trimmed, because the URL carries it. */
	const commit = (expression: string) => {
		onSubmit(expression.trim());
	};

	/**
	 * Append what is typed to the committed expression and empty the input.
	 *
	 * `appendExpression` rather than a plain join: the input holds whatever
	 * the analyst wrote, which may be a whole alternation, and juxtaposing
	 * `a OR b` after an existing condition would quietly widen the query
	 * rather than narrow it.
	 */
	const commitTyped = (fragment: string = text) => {
		const clause = fragment.trim();
		const next = appendExpression(value, clause);

		text = '';
		// Set rather than read back: the input still holds the old text until
		// Svelte flushes, so `selectionStart` would be a position into it.
		caret = 0;
		if (clause !== '') remember(next);
		commit(next);
	};

	/** Replace the whole expression — what picking from the history means. */
	const commitWhole = (expression: string) => {
		text = '';
		caret = 0;
		remember(expression.trim());
		commit(expression);
		inputEl?.blur();
	};

	const removeChip = (chip: Conjunct) => {
		commit(removeNode(value, chip.span));
		inputEl?.focus();
	};

	/**
	 * Pull a chip back into the input to rewrite it.
	 *
	 * Whatever was half-typed is committed on the way rather than dropped:
	 * the click was aimed at the chip, not at the words already written.
	 * Removing before appending keeps the chip's offsets valid, since they
	 * index `value` and the append only ever adds to the end.
	 */
	const editChip = (chip: Conjunct) => {
		const pending = text.trim();
		commit(appendExpression(removeNode(value, chip.span), pending));
		text = chip.text;
		void focusEnd();
	};

	const accept = async (suggestion: Suggestion) => {
		const applied = applySuggestion(text, context, suggestion.insert, suggestion.trailing);

		// A value completes a clause, so it becomes a chip on the spot —
		// which is the point of picking one from the list. A field name is
		// only half a clause, so the bar stays open for the value. So is an
		// operator, which is why neither takes this branch.
		if (context.kind === 'value') {
			commitTyped(applied.text);
			inputEl?.focus();
			return;
		}

		text = applied.text;
		await tick();
		inputEl?.setSelectionRange(applied.caret, applied.caret);
		syncCaret();
		inputEl?.focus();
	};

	const clear = () => {
		text = '';
		caret = 0;
		commit('');
		inputEl?.focus();
	};

	const onKeydown = (event: KeyboardEvent) => {
		// Backspace at the start of an empty input reaches past it, the way
		// it does in every other chip field: the last condition comes back
		// as text so it can be corrected instead of retyped.
		if (
			event.key === 'Backspace' &&
			text === '' &&
			chips.length > 0 &&
			(inputEl?.selectionStart ?? 0) === 0
		) {
			event.preventDefault();
			editChip(chips[chips.length - 1]);
			return;
		}

		if (popoverOpen) {
			const options = showHistory ? history.length : suggestions.length;

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				highlighted = (highlighted + 1) % options;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				highlighted = (highlighted - 1 + options) % options;
				return;
			}
			if (event.key === 'Tab' && !showHistory && suggestions[highlighted]) {
				event.preventDefault();
				void accept(suggestions[highlighted]);
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				if (showHistory) {
					commitWhole(history[highlighted]);
					return;
				}
				const suggestion = suggestions[highlighted];
				if (suggestion) {
					void accept(suggestion);
					return;
				}
				commitTyped();
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				focused = false;
				return;
			}
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			commitTyped();
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			inputEl?.blur();
		}
	};

	// Clicking a suggestion or a chip steals focus from the input, which
	// would close the popover before the click lands. Blur is ignored
	// while focus is still somewhere inside the component.
	const onBlur = (event: FocusEvent) => {
		const next = event.relatedTarget as Node | null;
		if (next && rootEl?.contains(next)) return;
		focused = false;
	};
</script>

<div bind:this={rootEl} class={cn('relative w-full', className)}>
	<!--
	  The shell owns the border, background and focus ring. The input
	  inside it must stay transparent — see the note at the top of the
	  file for why an opaque one hides the highlighted copy.
	-->
	<div
		class={cn(
			'flex min-h-10 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 shadow-sm transition-colors duration-150',
			disabled ? 'cursor-not-allowed opacity-50' : 'focus-within:border-ring hover:border-ring/40',
			message && 'border-destructive/60'
		)}
	>
		<SearchIcon class="ml-1 size-4 shrink-0 text-muted-foreground" />

		{#each chips as chip (keyOf(chip))}
			{@const errored = !chip.understood || keyOf(chip) === erroredChipKey}
			<span
				class={cn(
					'inline-flex h-6 max-w-full items-center gap-0.5 rounded-md border py-0.5 pl-2 pr-1 font-mono text-xs transition-colors',
					errored
						? 'border-destructive/50 bg-destructive/10 text-destructive'
						: 'border-primary/30 bg-primary/10 text-foreground'
				)}
			>
				<!--
				  `max-w-full` rather than a fixed cap: a chip that *is* the
				  whole expression — which is what a top-level alternation
				  produces — has to stay readable, and the bar wraps, so a wide
				  one simply takes its own row.
				-->
				<button
					type="button"
					{disabled}
					class="max-w-full truncate disabled:cursor-not-allowed"
					title={chip.text}
					onclick={() => editChip(chip)}
				>
					{chip.text}
				</button>
				<button
					type="button"
					{disabled}
					class="inline-flex size-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed"
					aria-label={`Remove ${chip.text}`}
					onclick={() => removeChip(chip)}
				>
					<XIcon class="size-3" />
				</button>
			</span>
		{/each}

		<div class="relative h-7 min-w-[9rem] flex-1">
			<!--
			  The painted copy. `aria-hidden` because the input in front of it
			  already carries the same text for assistive tech, and `pre` so
			  runs of spaces occupy the width the input gives them.
			-->
			<div
				bind:this={overlayEl}
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-1 font-mono text-sm leading-7"
			>
				{#each segments as segment, index (index)}<span class={segment.className}
						>{segment.text}</span
					>{/each}
			</div>

			<input
				bind:this={inputEl}
				bind:value={text}
				type="text"
				role="combobox"
				aria-expanded={popoverOpen}
				aria-autocomplete="list"
				aria-controls="lucene-search-suggestions"
				aria-label="Search expression"
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"
				autocorrect="off"
				placeholder={chips.length === 0 ? placeholder : ''}
				{disabled}
				class="relative block h-7 w-full bg-transparent px-1 font-mono text-sm leading-7 text-transparent caret-foreground outline-none selection:bg-primary/30 placeholder:font-sans placeholder:text-muted-foreground disabled:cursor-not-allowed"
				oninput={syncCaret}
				onkeyup={syncCaret}
				onclick={syncCaret}
				onscroll={syncScroll}
				onfocus={() => {
					focused = true;
					syncCaret();
				}}
				onblur={onBlur}
				onkeydown={onKeydown}
			/>
		</div>

		{#if text !== '' || value !== ''}
			<button
				type="button"
				{disabled}
				class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
				aria-label="Clear search"
				onclick={clear}
			>
				<XIcon class="size-3.5" />
			</button>
		{:else}
			<kbd
				class="pointer-events-none shrink-0 rounded border border-border/70 px-1.5 py-0.5 font-sans text-2xs text-muted-foreground"
			>
				/
			</kbd>
		{/if}
	</div>

	{#if message}
		<p class="mt-1 px-1 text-xs text-destructive">{message}</p>
	{:else if looseAlternation}
		<!--
		  Not an error — the expression is valid and is what the queue is
		  filtered by. It is a note about the one precedence rule nobody
		  guesses right, shown at the moment it has just caught someone out.
		-->
		<p class="mt-1 flex flex-wrap items-baseline gap-x-1.5 px-1 text-xs text-muted-foreground">
			<span>
				<span class="font-mono font-medium text-violet-600 dark:text-violet-400">OR</span>
				applies to everything written before it, so this is one condition.
			</span>
			{#if tightened !== null}
				<button
					type="button"
					{disabled}
					class="font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed"
					onclick={tighten}
				>
					Apply it to the last condition only
				</button>
			{/if}
		</p>
	{/if}

	{#if popoverOpen}
		<div
			id="lucene-search-suggestions"
			role="listbox"
			aria-label={showHistory ? 'Recent searches' : 'Search suggestions'}
			class="shadow-elevation-3 absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground"
		>
			{#if showHistory}
				<p class="px-3 py-1 text-2xs uppercase tracking-wide text-muted-foreground">Recent</p>

				{#each history as entry, index (entry)}
					<button
						type="button"
						role="option"
						aria-selected={index === highlighted}
						class={cn(
							'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors',
							index === highlighted ? 'bg-muted' : 'hover:bg-muted/60'
						)}
						onmouseenter={() => (highlighted = index)}
						onclick={() => commitWhole(entry)}
					>
						<span class="truncate">{entry}</span>
					</button>
				{/each}
			{:else}
				{#each suggestions as suggestion, index (suggestion.label)}
					<button
						type="button"
						role="option"
						aria-selected={index === highlighted}
						class={cn(
							'flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors',
							index === highlighted ? 'bg-muted' : 'hover:bg-muted/60'
						)}
						onmouseenter={() => (highlighted = index)}
						onclick={() => accept(suggestion)}
					>
						<span class="shrink-0 font-mono text-xs text-primary">{suggestion.label}</span>
						<span class="truncate text-2xs text-muted-foreground">{suggestion.detail}</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
