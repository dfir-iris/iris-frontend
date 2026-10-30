<!--
  Relation picker shown after drag-to-connect / "Connect to…". Defaults to
  `connected_to`.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { GraphRelationType } from '$lib/types/resources/case-graph';
	import RelationForm, { type RelationFormValues } from './RelationForm.svelte';

	interface Props {
		open: boolean;
		relationTypes: GraphRelationType[];
		sourceLabel: string;
		targetLabel: string;
		onSubmit: (values: RelationFormValues) => void | Promise<void>;
	}

	let { open = $bindable(), relationTypes, sourceLabel, targetLabel, onSubmit }: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
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
					await onSubmit(v);
					open = false;
				}}
				onCancel={() => (open = false)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
