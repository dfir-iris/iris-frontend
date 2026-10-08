<!--
  Answer form for an `info_request` suggestion, rendered from its
  `form_schema.fields` (text / textarea / number / boolean / select).
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { AiSuggestionFormField } from '$lib/services/ai-suggestions.service';
	import {
		aiSuggestionAnswerBuild,
		aiSuggestionAnswerDefaults,
		aiSuggestionFieldOptions,
		type AiSuggestionAnswerValue
	} from './ai-suggestion-format';

	interface Props {
		fields: AiSuggestionFormField[];
		busy?: boolean;
		onSubmit: (answer: Record<string, unknown>, note: string | null) => void | Promise<void>;
		onCancel?: () => void;
	}

	let { fields, busy = false, onSubmit, onCancel }: Props = $props();

	// Seeded once from the schema; the fields don't change while open.
	const initial = (() => aiSuggestionAnswerDefaults(fields))();
	let values = $state<Record<string, AiSuggestionAnswerValue>>(initial);
	let note = $state('');
	let errors = $state<Record<string, string>>({});

	const idFor = (name: string) => `ai-answer-${name}`;

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const built = aiSuggestionAnswerBuild(fields, values);
		errors = built.errors;
		if (Object.keys(built.errors).length > 0) return;
		await onSubmit(built.answer, note.trim() || null);
	}
</script>

<form class="flex flex-col gap-2 text-sm" onsubmit={submit} novalidate>
	{#if fields.length === 0}
		<p class="text-xs text-muted-foreground">No fields: the reply is just your note.</p>
	{/if}
	{#each fields as field, i (`${i}:${field.name}`)}
		{@const label = field.label || field.name}
		<div class="flex flex-col gap-1">
			{#if field.type === 'boolean'}
				<label class="flex items-center gap-2 text-xs">
					<Checkbox
						checked={values[field.name] === true}
						onCheckedChange={(v) => (values[field.name] = v === true)}
						disabled={busy}
					/>
					{label}
				</label>
			{:else}
				<label class="text-xs text-muted-foreground" for={idFor(field.name)}>
					{label}{#if field.required}<span class="text-destructive"> *</span>{/if}
				</label>
				{#if field.type === 'textarea'}
					<Textarea
						id={idFor(field.name)}
						rows={3}
						value={(values[field.name] as string | null) ?? ''}
						oninput={(e) => (values[field.name] = (e.currentTarget as HTMLTextAreaElement).value)}
						disabled={busy}
					/>
				{:else if field.type === 'select'}
					<select
						id={idFor(field.name)}
						class="h-8 rounded-md border border-input bg-background px-2 text-sm"
						value={(values[field.name] as string | null) ?? ''}
						onchange={(e) => (values[field.name] = (e.currentTarget as HTMLSelectElement).value)}
						disabled={busy}
					>
						<option value="">—</option>
						{#each aiSuggestionFieldOptions(field) as opt, j (`${j}:${opt.value}`)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				{:else}
					<Input
						id={idFor(field.name)}
						class="h-8 text-sm"
						type={field.type === 'number' ? 'number' : 'text'}
						value={values[field.name] == null ? '' : String(values[field.name])}
						oninput={(e) => (values[field.name] = (e.currentTarget as HTMLInputElement).value)}
						disabled={busy}
					/>
				{/if}
			{/if}
			{#if errors[field.name]}
				<span class="text-2xs text-destructive">{errors[field.name]}</span>
			{/if}
		</div>
	{/each}
	<div class="flex flex-col gap-1">
		<label class="text-xs text-muted-foreground" for="ai-answer-note">Note (optional)</label>
		<Input id="ai-answer-note" class="h-8 text-sm" bind:value={note} disabled={busy} />
	</div>
	<div class="flex justify-end gap-1.5">
		{#if onCancel}
			<Button type="button" size="xs" variant="outline" onclick={onCancel} disabled={busy}>
				Cancel
			</Button>
		{/if}
		<Button type="submit" size="xs" disabled={busy}>{busy ? 'Sending…' : 'Send answer'}</Button>
	</div>
</form>
