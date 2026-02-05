<script lang="ts">
	import { getContext } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import Ace from '$lib/components/common/Ace/Ace.svelte';
	import { Button } from '$lib/components/ui/button';
	import { normalizeTags } from './utils';

	type CaseEditorProps = {
		onDelete?: () => void;
		onClose?: () => void;
		onCancel?: () => void;
		onSave?: (body: UpdateCaseBody) => void | Promise<void>;
	};

	let { onDelete, onClose, onCancel, onSave }: CaseEditorProps = $props();

	const app = getContext<AppContext>(APP_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);

	let currentCase = $state<Case | null>(null);

	let caseName = $state('');
	let socId = $state('');
	let tagsCsv = $state('');
	let description = $state('');

	$effect(() => {
		const c = cases.byId[app.state.currentCaseID] ?? null;

		currentCase = c;

		if (!c) return;

		caseName = c.case_name ?? '';
		socId = c.case_soc_id ?? '';
		tagsCsv = (c.tags ?? []).map((t) => t.tag_title).join(', ');
		description = c.case_description ?? '';
	});

	const save = async () => {
		const body: UpdateCaseBody = {
			case_name: caseName,
			case_soc_id: socId,
			case_tags: normalizeTags(tagsCsv).join(','),
			case_description: description
		};

		await onSave?.(body);
	};

	const cancel = () => {
		if (!currentCase) return;

		caseName = currentCase.case_name ?? '';
		socId = currentCase.case_soc_id ?? '';
		tagsCsv = (currentCase.tags ?? []).join(', ');
		description = currentCase.case_description ?? '';
		onCancel?.();
	};

	const onSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		await save();
	};
</script>

<form class="space-y-6" onsubmit={onSubmit}>
	<div class="grid grid-cols-2 gap-4">
		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Case name</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={caseName}
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Customer</span>
			<input
				class="rounded-md border bg-muted/20 px-3 py-2"
				value={currentCase?.case_customer?.customer_name}
				readonly
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Case tags (comma separated)</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={tagsCsv}
				placeholder="tag1, tag2, tag3"
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">SOC ID</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={socId}
				autocomplete="off"
			/>
		</label>

		<div>
			<div class="text-sm font-semibold">Case ID</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.case_id}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Case UUID</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.case_uuid}</div>
		</div>

		{#if currentCase?.classification_id}
			<div>
				<div class="text-sm font-semibold">Classification</div>
				<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase.classification_id}</div>
			</div>
		{/if}

		{#if currentCase?.state}
			<div>
				<div class="text-sm font-semibold">State</div>
				<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase.state.state_name}</div>
			</div>
		{/if}

		{#if currentCase?.severity}
			<div>
				<div class="text-sm font-semibold">Severity</div>
				<div class="rounded-md border bg-muted/20 px-3 py-2">
					{currentCase.severity.severity_name}
				</div>
			</div>
		{/if}

		<div>
			<div class="text-sm font-semibold">Open date</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.open_date}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Opening user</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.user_id}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Owner</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.owner.user_name}</div>
		</div>
	</div>

	<h2 class="text-xl font-bold">Case description</h2>

	<Ace value={description} onChange={(v) => (description = v)} />

	<div class="flex justify-between">
		<div class="flex gap-2">
			<Button type="button" variant="destructive" onclick={onDelete}>Delete case</Button>
			<Button type="button" variant="secondary" onclick={onClose}>Close case</Button>
		</div>

		<div class="flex gap-2">
			<Button type="button" variant="secondary" onclick={cancel}>Cancel</Button>
			<Button type="submit" variant="destructive">Save</Button>
		</div>
	</div>
</form>
