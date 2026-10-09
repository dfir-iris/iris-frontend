<!--
  One AI workflow suggestion: what it is, why (link to the run trace),
  what it would run, and the Accept / Dismiss / Answer controls.

  Accepting runs the proposed tool call as the current analyst, so the
  confirm dialog spells out the tool and its exact arguments first.
-->
<script lang="ts">
	import { ChevronRightIcon, CheckIcon, ExternalLinkIcon, WrenchIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import { current_user } from '$lib/stores/auth.store';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { AiSuggestionsService, type AiSuggestion } from '$lib/services/ai-suggestions.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import {
		AI_SUGGESTION_STATUS_LABELS,
		aiSuggestionConfidence,
		aiSuggestionKind,
		aiSuggestionPretty,
		aiSuggestionSeverityClass
	} from './ai-suggestion-format';
	import {
		AI_SUGGESTION_ENTITY_LABELS,
		aiSuggestionsEntityHref,
		aiSuggestionsRunHref
	} from '$lib/stores/ai-suggestions.store.svelte';
	import AiSuggestionAnswerForm from './AiSuggestionAnswerForm.svelte';

	interface Props {
		suggestion: AiSuggestion;
		/** Called with the updated suggestion (or null to force a reload). */
		onChanged: (updated: AiSuggestion | null) => void;
		/** Name the entity it is about (outside that entity's own page). */
		showEntity?: boolean;
		/** Outline it (the one a link pointed at). */
		highlight?: boolean;
	}

	let { suggestion, onChanged, showEntity = false, highlight = false }: Props = $props();

	const kind = $derived(aiSuggestionKind(suggestion.kind));
	const confidence = $derived(aiSuggestionConfidence(suggestion.confidence));
	const isOpen = $derived(suggestion.status === 'open');
	const isInfoRequest = $derived(suggestion.kind === 'info_request');
	const canAccept = $derived(
		isOpen && !isInfoRequest && suggestion.can_accept !== false && !!suggestion.proposed_action
	);
	// The link text is always the canonical `type #id`; the title is
	// LLM-provided, so it only shows as secondary text / tooltip.
	const refs = $derived(
		(Array.isArray(suggestion.related_refs) ? suggestion.related_refs : [])
			.map((r) => ({
				key: `${r?.type}:${r?.id}`,
				href: aiSuggestionsEntityHref(r?.type, r?.id),
				label: `${String(r?.type ?? '').replace(/_/g, ' ')} #${r?.id}`,
				title: typeof r?.title === 'string' && r.title.trim() ? r.title.trim() : null
			}))
			.filter((r, i, all) => r.href && all.findIndex((o) => o.key === r.key) === i)
	);
	const runHref = $derived(aiSuggestionsRunHref(suggestion.run_uuid));
	const isDryRun = $derived(suggestion.status === 'dry_run');
	const entityHref = $derived(
		aiSuggestionsEntityHref(suggestion.entity_type, suggestion.entity_id)
	);
	const entityText = $derived(
		suggestion.entity_type
			? `${AI_SUGGESTION_ENTITY_LABELS[suggestion.entity_type] ?? suggestion.entity_type} #${suggestion.entity_id}`
			: null
	);
	const actingAs = $derived(
		$current_user ? `${$current_user.user_name} (${$current_user.user_login})` : 'you'
	);

	let showArgs = $state(false);
	let showResult = $state(false);
	let showAnswer = $state(false);
	let acceptOpen = $state(false);
	let dismissOpen = $state(false);
	let note = $state('');
	let busy = $state(false);

	function settle(res: RequestResponse<AiSuggestion>, okTitle: string, failTitle: string) {
		if (res.ok) {
			const data = res.data;
			const updated =
				data && typeof data === 'object' && 'id' in (data as object)
					? (data as AiSuggestion)
					: null;
			toast({ title: okTitle, variant: 'success' });
			onChanged(updated);
			return true;
		}
		const message =
			(res.data && typeof res.data === 'object' && 'message' in (res.data as object)
				? String((res.data as unknown as { message: unknown }).message)
				: null) ??
			res.error?.message ??
			undefined;
		toast({ title: failTitle, description: message, variant: 'destructive' });
		return false;
	}

	async function accept() {
		busy = true;
		try {
			const res = await AiSuggestionsService.accept(suggestion.id, note.trim() || null);
			if (settle(res, 'Suggestion accepted', 'Could not accept the suggestion')) {
				acceptOpen = false;
				note = '';
			}
		} finally {
			busy = false;
		}
	}

	async function dismiss() {
		busy = true;
		try {
			const res = await AiSuggestionsService.dismiss(suggestion.id, note.trim() || null);
			if (settle(res, 'Suggestion dismissed', 'Could not dismiss the suggestion')) {
				dismissOpen = false;
				note = '';
			}
		} finally {
			busy = false;
		}
	}

	async function answer(values: Record<string, unknown>, answerNote: string | null) {
		busy = true;
		try {
			const res = await AiSuggestionsService.answer(suggestion.id, values, answerNote);
			if (settle(res, 'Answer sent', 'Could not send the answer')) {
				showAnswer = false;
			}
		} finally {
			busy = false;
		}
	}

	const fmt = (iso: string | null) => (iso ? formatDateTime(iso) : '');
</script>

<article
	class={`rounded-md border bg-card p-3 text-sm ${highlight ? 'ring-2 ring-primary' : ''}`}
	data-testid="ai-suggestion-card"
	data-suggestion-id={suggestion.id}
>
	<header class="flex items-start gap-2">
		<div
			class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400"
			title={kind.label}
		>
			<kind.icon size={13} />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
				<span class="font-medium uppercase tracking-wide">{kind.label}</span>
				{#if suggestion.severity}
					<span
						class="rounded-sm border px-1.5 py-px text-2xs font-medium capitalize {aiSuggestionSeverityClass(
							suggestion.severity
						)}"
					>
						{suggestion.severity}
					</span>
				{/if}
				{#if confidence}
					<span class="rounded-sm border px-1.5 py-px tabular-nums" title="Confidence">
						{confidence} confidence
					</span>
				{/if}
				{#if !isOpen}
					<span class="rounded-sm border bg-muted/40 px-1.5 py-px">
						{AI_SUGGESTION_STATUS_LABELS[suggestion.status] ?? suggestion.status}
					</span>
				{/if}
			</div>
			<h4 class="mt-0.5 font-medium leading-snug">{suggestion.title}</h4>
			{#if showEntity}
				<div class="mt-0.5 truncate text-2xs text-muted-foreground">
					{#if entityText}
						{#if entityHref}
							<a href={entityHref} class="font-medium text-primary hover:underline">{entityText}</a>
						{:else}
							<span class="font-medium">{entityText}</span>
						{/if}
						{#if suggestion.entity_title}
							<span title={suggestion.entity_title}>· {suggestion.entity_title}</span>
						{/if}
					{:else}
						Not about a specific alert, case or war room
					{/if}
				</div>
			{/if}
		</div>
	</header>

	{#if isDryRun}
		<p
			class="mt-2 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-2xs text-amber-800 dark:text-amber-300"
		>
			Produced by a dry run: shown for review only, nothing can be accepted.
		</p>
	{/if}

	{#if suggestion.body}
		<div class="mt-2 max-h-64 overflow-y-auto">
			<MarkDownPreview
				markdown={suggestion.body}
				untrusted
				class="text-sm leading-normal [&>:first-child]:mt-0 [&_code]:text-xs [&_li]:text-sm [&_p]:text-sm [&_pre]:text-xs"
			/>
		</div>
	{/if}

	{#if refs.length > 0}
		<div class="mt-2 flex flex-wrap items-center gap-1 text-2xs">
			<span class="text-muted-foreground">Related:</span>
			{#each refs as r (r.key)}
				<a
					href={r.href}
					class="inline-flex max-w-full items-center gap-1 rounded-sm border bg-muted/40 px-1.5 py-px hover:bg-muted"
					title={r.title ?? undefined}
				>
					<span class="shrink-0 font-medium">{r.label}</span>
					{#if r.title}
						<span class="truncate text-muted-foreground">{r.title}</span>
					{/if}
				</a>
			{/each}
		</div>
	{/if}

	{#if suggestion.proposed_action}
		<div class="mt-2 rounded-md border bg-muted/20 text-2xs">
			<button
				type="button"
				class="flex w-full items-center gap-1.5 px-2 py-1 text-left"
				onclick={() => (showArgs = !showArgs)}
				aria-expanded={showArgs}
			>
				<ChevronRightIcon
					size={12}
					class="shrink-0 transition-transform {showArgs ? 'rotate-90' : ''}"
				/>
				<WrenchIcon size={12} class="shrink-0 text-muted-foreground" />
				<span class="text-muted-foreground">Proposed action</span>
				<code class="font-mono">{suggestion.proposed_action.tool}</code>
			</button>
			{#if showArgs}
				<pre
					class="max-h-56 overflow-auto border-t px-2 py-1.5 font-mono text-2xs">{aiSuggestionPretty(
						suggestion.proposed_action.arguments ?? {}
					)}</pre>
			{/if}
		</div>
	{/if}

	<footer class="mt-2 flex flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
			{#if suggestion.workflow_name}
				<span class="truncate">From {suggestion.workflow_name}</span>
			{/if}
			{#if suggestion.created_at}
				<span>{fmt(suggestion.created_at)}</span>
			{/if}
			{#if runHref}
				<a
					href={runHref}
					class="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
					title="Open the run that produced this suggestion"
				>
					Why?
					<ExternalLinkIcon size={10} />
				</a>
			{/if}
		</div>

		{#if isOpen}
			<div class="flex items-center gap-1.5">
				{#if isInfoRequest}
					<Button size="xs" onclick={() => (showAnswer = !showAnswer)} disabled={busy}>
						{showAnswer ? 'Hide form' : 'Answer'}
					</Button>
				{:else if canAccept}
					<Button size="xs" onclick={() => ((note = ''), (acceptOpen = true))} disabled={busy}>
						<CheckIcon />
						Accept
					</Button>
				{/if}
				<Button
					size="xs"
					variant="outline"
					onclick={() => ((note = ''), (dismissOpen = true))}
					disabled={busy}
				>
					<XIcon />
					Dismiss
				</Button>
			</div>
		{/if}
	</footer>

	{#if isOpen && isInfoRequest && showAnswer}
		<div class="mt-2 border-t pt-2">
			<AiSuggestionAnswerForm
				fields={suggestion.form_schema?.fields ?? []}
				{busy}
				onSubmit={answer}
				onCancel={() => (showAnswer = false)}
			/>
		</div>
	{/if}

	{#if !isOpen && (suggestion.resolved_by || suggestion.resolution_note || suggestion.resolution_hidden || suggestion.answer != null || suggestion.result != null)}
		<div class="mt-2 border-t pt-2 text-2xs text-muted-foreground">
			{#if suggestion.resolved_by}
				<div>
					{AI_SUGGESTION_STATUS_LABELS[suggestion.status] ?? suggestion.status} by
					<span class="font-medium text-foreground">{suggestion.resolved_by.name}</span>
					{#if suggestion.resolved_at}· {fmt(suggestion.resolved_at)}{/if}
				</div>
			{/if}
			{#if suggestion.resolution_note}
				<div class="mt-0.5 whitespace-pre-wrap">Note: {suggestion.resolution_note}</div>
			{/if}
			{#if suggestion.resolution_hidden}
				<div class="mt-0.5 italic" data-testid="ai-suggestion-resolution-hidden">
					{suggestion.kind === 'info_request' ? 'The answer' : 'The result'} is visible only to whoever
					resolved it.
				</div>
			{/if}
			{#if suggestion.answer != null || suggestion.result != null}
				<button
					type="button"
					class="mt-1 inline-flex items-center gap-1 hover:text-foreground"
					onclick={() => (showResult = !showResult)}
					aria-expanded={showResult}
				>
					<ChevronRightIcon
						size={11}
						class="transition-transform {showResult ? 'rotate-90' : ''}"
					/>
					{suggestion.answer != null ? 'Answer' : 'Result'}
				</button>
				{#if showResult}
					<pre
						class="mt-1 max-h-48 overflow-auto rounded-sm border bg-muted/20 px-2 py-1 font-mono">{aiSuggestionPretty(
							suggestion.answer ?? suggestion.result
						)}</pre>
				{/if}
			{/if}
		</div>
	{/if}
</article>

<Dialog.Root bind:open={acceptOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Run this action as you?</Dialog.Title>
			<Dialog.Description>
				Accepting runs the tool below with your own permissions, as
				<span class="font-medium text-foreground">{actingAs}</span>. It is recorded in the activity
				log under your name.
			</Dialog.Description>
		</Dialog.Header>
		{#if suggestion.proposed_action}
			<div class="flex flex-col gap-2 text-sm">
				<div>
					<span class="text-xs text-muted-foreground">Tool</span>
					<div><code class="font-mono">{suggestion.proposed_action.tool}</code></div>
				</div>
				<div>
					<span class="text-xs text-muted-foreground">Arguments</span>
					<pre
						class="max-h-64 overflow-auto rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-xs">{aiSuggestionPretty(
							suggestion.proposed_action.arguments ?? {}
						)}</pre>
				</div>
				<label class="flex flex-col gap-1">
					<span class="text-xs text-muted-foreground">Note (optional)</span>
					<Textarea rows={2} bind:value={note} disabled={busy} />
				</label>
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (acceptOpen = false)} disabled={busy}>Cancel</Button>
			<Button onclick={accept} disabled={busy}>{busy ? 'Running…' : 'Run as me'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={dismissOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Dismiss suggestion</Dialog.Title>
			<Dialog.Description>{suggestion.title}</Dialog.Description>
		</Dialog.Header>
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-xs text-muted-foreground">Note (optional)</span>
			<Textarea rows={3} bind:value={note} disabled={busy} placeholder="Why it does not apply" />
		</label>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dismissOpen = false)} disabled={busy}>Cancel</Button
			>
			<Button variant="destructive" onclick={dismiss} disabled={busy}>
				{busy ? 'Dismissing…' : 'Dismiss'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
