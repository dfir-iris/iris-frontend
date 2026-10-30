<!--
  Relation picker shown after drag-to-connect / "Connect to…". Defaults to
  `connected_to`. Lists the timeline events already recording the link and
  offers to record it as a new one.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { GraphNodeKey, GraphRelationType } from '$lib/types/resources/case-graph';
	import RelationForm, { type RelationFormValues } from './RelationForm.svelte';
	import RelationTimelineSection from './RelationTimelineSection.svelte';
	import {
		relationTimelineAvailable,
		relationTimelineChoice,
		relationTimelineTitle,
		type RelationTimelineChoice,
		type RelationTimelineState
	} from '../lib/relation-timeline';

	interface Props {
		open: boolean;
		caseId: number;
		relationTypes: GraphRelationType[];
		source: GraphNodeKey | undefined;
		target: GraphNodeKey | undefined;
		sourceLabel: string;
		targetLabel: string;
		onSubmit: (
			values: RelationFormValues,
			timeline: RelationTimelineChoice
		) => void | Promise<void>;
	}

	let {
		open = $bindable(),
		caseId,
		relationTypes,
		source,
		target,
		sourceLabel,
		targetLabel,
		onSubmit
	}: Props = $props();

	const freshTimeline = (): RelationTimelineState => ({
		attach: [],
		create: false,
		title: '',
		date: '',
		tz: '+00:00',
		categoryId: null
	});

	let timeline = $state<RelationTimelineState>(freshTimeline());

	$effect(() => {
		if (open) timeline = freshTimeline();
	});

	const withTimeline = $derived(!!source && !!target && relationTimelineAvailable(source, target));

	const suggestedTitle = (v: RelationFormValues) =>
		relationTimelineTitle(
			v.swapped ? targetLabel : sourceLabel,
			v.label || relationTypes.find((r) => r.id === v.relationTypeId)?.label || v.relationName,
			v.swapped ? sourceLabel : targetLabel
		);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New relation</Dialog.Title>
			<Dialog.Description>How are these two objects related?</Dialog.Description>
		</Dialog.Header>
		{#if open}
			<RelationForm
				{relationTypes}
				{sourceLabel}
				{targetLabel}
				submitLabel="Create relation"
				onSubmit={async (v) => {
					const choice = withTimeline ? relationTimelineChoice(timeline, suggestedTitle(v)) : {};
					await onSubmit(v, choice);
					open = false;
				}}
				onCancel={() => (open = false)}
			>
				{#snippet extra(ctx)}
					{#if withTimeline && source && target}
						<RelationTimelineSection
							{caseId}
							{source}
							{target}
							relationName={ctx.relationName}
							suggestedTitle={relationTimelineTitle(ctx.from, ctx.relationLabel, ctx.to)}
							bind:value={timeline}
						/>
					{/if}
				{/snippet}
			</RelationForm>
		{/if}
	</Dialog.Content>
</Dialog.Root>
