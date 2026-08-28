<!--
  Scope picker for new chats.

  Presents a small dropdown of scope choices — Global / current case /
  current war-room / current alert / pick specific case / pick specific
  war-room — and returns the chosen scope to the caller via `onPick`.
  The caller decides what to do with it (start a new conversation via
  the context, close a menu, etc.).

  The "Current *" options only appear when the SPA is actually on that
  route (case_id / war_room_id / alert_id populated). "Pick specific"
  options accept a freeform integer id via a tiny inline input.
-->
<script lang="ts">
	import { ChevronDownIcon, ChevronUpIcon } from 'lucide-svelte';
	import type { ChatScopeChoice } from './scope-picker-types';

	let {
		currentCaseId,
		currentWarRoomId,
		currentAlertId,
		compact = false,
		onPick
	}: {
		currentCaseId: number | null;
		currentWarRoomId: number | null;
		currentAlertId: number | null;
		compact?: boolean;
		onPick: (choice: ChatScopeChoice) => void;
	} = $props();

	// Sensible default: whatever scope the route currently exposes,
	// preferring most-specific (war-room > case > alert) > global. The
	// analyst can override in the dropdown.
	function defaultKind(): ChatScopeChoice['kind'] {
		if (currentWarRoomId != null) return 'currentWarRoom';
		if (currentCaseId != null) return 'currentCase';
		if (currentAlertId != null) return 'currentAlert';
		return 'global';
	}

	let selectedKind = $state<ChatScopeChoice['kind']>(defaultKind());
	let pickCaseInput = $state<string>('');
	let pickWarRoomInput = $state<string>('');
	let expanded = $state(false);

	function labelFor(kind: ChatScopeChoice['kind']): string {
		switch (kind) {
			case 'global':
				return 'Global (no scope)';
			case 'currentCase':
				return currentCaseId != null ? `Case #${currentCaseId}` : 'Current case';
			case 'currentWarRoom':
				return currentWarRoomId != null ? `War-room #${currentWarRoomId}` : 'Current war-room';
			case 'currentAlert':
				return currentAlertId != null ? `Alert #${currentAlertId}` : 'Current alert';
			case 'pickCase':
				return 'Pick a case…';
			case 'pickWarRoom':
				return 'Pick a war-room…';
		}
	}

	function summaryLabel(): string {
		return labelFor(selectedKind);
	}

	function confirm() {
		if (selectedKind === 'pickCase') {
			const n = Number(pickCaseInput);
			if (!Number.isFinite(n) || n <= 0) return;
			onPick({ kind: 'pickCase', caseId: n });
		} else if (selectedKind === 'pickWarRoom') {
			const n = Number(pickWarRoomInput);
			if (!Number.isFinite(n) || n <= 0) return;
			onPick({ kind: 'pickWarRoom', warRoomId: n });
		} else if (selectedKind === 'currentCase') {
			if (currentCaseId == null) return;
			onPick({ kind: 'currentCase' });
		} else if (selectedKind === 'currentWarRoom') {
			if (currentWarRoomId == null) return;
			onPick({ kind: 'currentWarRoom' });
		} else if (selectedKind === 'currentAlert') {
			if (currentAlertId == null) return;
			onPick({ kind: 'currentAlert' });
		} else {
			onPick({ kind: 'global' });
		}
		expanded = false;
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if compact}
		<!-- Header-chip variant: single-line dropdown trigger, expands
		     inline when clicked. -->
		<button
			type="button"
			class="flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => (expanded = !expanded)}
			title="Change scope for next new chat"
		>
			<span>Scope: {summaryLabel()}</span>
			{#if expanded}
				<ChevronUpIcon size={10} />
			{:else}
				<ChevronDownIcon size={10} />
			{/if}
		</button>
	{/if}

	{#if !compact || expanded}
		<div class="flex flex-col gap-1 rounded border bg-background p-2">
			<label class="text-2xs font-medium text-muted-foreground" for="scope-kind"> Scope </label>
			<select
				id="scope-kind"
				class="h-7 rounded border bg-background px-2 text-xs"
				bind:value={selectedKind}
			>
				{#if currentWarRoomId != null}
					<option value="currentWarRoom">{labelFor('currentWarRoom')}</option>
				{/if}
				{#if currentCaseId != null}
					<option value="currentCase">{labelFor('currentCase')}</option>
				{/if}
				{#if currentAlertId != null}
					<option value="currentAlert">{labelFor('currentAlert')}</option>
				{/if}
				<option value="global">Global (no scope)</option>
				<option value="pickCase">Pick a case…</option>
				<option value="pickWarRoom">Pick a war-room…</option>
			</select>

			{#if selectedKind === 'pickCase'}
				<input
					type="number"
					min="1"
					placeholder="Case ID (e.g. 42)"
					class="h-7 rounded border bg-background px-2 text-xs"
					bind:value={pickCaseInput}
				/>
			{:else if selectedKind === 'pickWarRoom'}
				<input
					type="number"
					min="1"
					placeholder="War-room ID (e.g. 3)"
					class="h-7 rounded border bg-background px-2 text-xs"
					bind:value={pickWarRoomInput}
				/>
			{/if}

			<button
				type="button"
				class="mt-1 h-7 rounded bg-primary px-3 text-2xs font-medium text-primary-foreground hover:opacity-90"
				onclick={confirm}
			>
				Start new chat here
			</button>
		</div>
	{/if}
</div>
