<!--
  Collects the reason / decision a stage asks for before a bulk move.
  Stages that need neither are applied straight from the menu and never
  open this dialog.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import AssetStageChip from '$lib/components/common/assets/AssetStageChip.svelte';
	import type { AssetStage } from '$lib/services/asset-stages.service';
	import { STAGE_REASON_MAX, validateStageInput } from '../stage-helpers';

	type Props = {
		open: boolean;
		stage: AssetStage | null;
		count: number;
		busy?: boolean;
		onConfirm: (reason: string, decisionId: string) => void | Promise<void>;
	};

	let { open = $bindable(), stage, count, busy = false, onConfirm }: Props = $props();

	let reason = $state('');
	let decisionId = $state('');
	let error = $state<string | null>(null);

	$effect(() => {
		if (open) {
			reason = '';
			decisionId = '';
			error = null;
		}
	});

	const submit = async () => {
		error = validateStageInput(stage, reason, decisionId);
		if (error) return;
		await onConfirm(reason, decisionId);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Set stage</Dialog.Title>
			<Dialog.Description>
				Move {count} asset{count === 1 ? '' : 's'} to
				<AssetStageChip {stage} />
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label
					for="bulk-stage-reason"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Reason{stage?.requires_reason ? ' *' : ''}
				</label>
				<Textarea
					id="bulk-stage-reason"
					rows={3}
					maxlength={STAGE_REASON_MAX}
					bind:value={reason}
					placeholder="Why are these assets moving to this stage?"
					disabled={busy}
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label
					for="bulk-stage-decision"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Decision ID{stage?.requires_decision ? ' *' : ''}
				</label>
				<Input
					id="bulk-stage-decision"
					inputmode="numeric"
					bind:value={decisionId}
					placeholder="War-room decision backing this move"
					disabled={busy}
				/>
			</div>
			{#if error}
				<p class="text-2xs text-destructive" role="alert">{error}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy}>{busy ? 'Saving…' : 'Set stage'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
