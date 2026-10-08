<!--
  Collects the reason / decision / event date of a bulk flag change.
  Setting a flag that needs neither is applied straight from the menu
  and never opens this dialog.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import AssetFlagChip from '$lib/components/common/assets/AssetFlagChip.svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import { FLAG_REASON_MAX, validateFlagInput, type FlagApplyAction } from '../flag-helpers';

	type Props = {
		open: boolean;
		flag: AssetFlag | null;
		action: FlagApplyAction;
		count: number;
		busy?: boolean;
		onConfirm: (reason: string, decisionId: string, date: string) => void | Promise<void>;
	};

	let { open = $bindable(), flag, action, count, busy = false, onConfirm }: Props = $props();

	let reason = $state('');
	let decisionId = $state('');
	let eventDate = $state('');
	let error = $state<string | null>(null);

	const removing = $derived(action === 'clear');

	$effect(() => {
		if (open) {
			reason = '';
			decisionId = '';
			eventDate = '';
			error = null;
		}
	});

	const submit = async () => {
		error = validateFlagInput(flag, reason, decisionId, eventDate, action);
		if (error) return;
		await onConfirm(reason, decisionId, eventDate);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{removing ? 'Remove flag' : 'Set flag'}</Dialog.Title>
			<Dialog.Description>
				{removing ? 'Remove' : 'Set'}
				{#if flag}<AssetFlagChip {flag} />{/if}
				{removing ? 'from' : 'on'}
				{count} asset{count === 1 ? '' : 's'}. Each change is recorded on the case "Asset status"
				timeline.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label
					for="bulk-flag-reason"
					class="text-2xs uppercase tracking-wide text-muted-foreground"
				>
					Reason{!removing && flag?.requires_reason ? ' *' : ' (optional)'}
				</label>
				<Textarea
					id="bulk-flag-reason"
					rows={3}
					maxlength={FLAG_REASON_MAX}
					bind:value={reason}
					placeholder="Context for the timeline events"
					disabled={busy}
				/>
			</div>
			{#if !removing}
				<div class="flex flex-col gap-1">
					<label
						for="bulk-flag-decision"
						class="text-2xs uppercase tracking-wide text-muted-foreground"
					>
						Decision ID{flag?.requires_decision ? ' *' : ' (optional)'}
					</label>
					<Input
						id="bulk-flag-decision"
						inputmode="numeric"
						bind:value={decisionId}
						placeholder="War-room decision backing this change"
						disabled={busy}
					/>
				</div>
			{/if}
			<div class="flex flex-col gap-1">
				<label for="bulk-flag-date" class="text-2xs uppercase tracking-wide text-muted-foreground">
					Event date (optional)
				</label>
				<Input
					id="bulk-flag-date"
					type="datetime-local"
					bind:value={eventDate}
					title="When it happened; now when left empty"
					disabled={busy}
				/>
			</div>
			{#if error}
				<p class="text-2xs text-destructive" role="alert">{error}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy}>
				{busy ? 'Saving…' : removing ? 'Remove flag' : 'Set flag'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
