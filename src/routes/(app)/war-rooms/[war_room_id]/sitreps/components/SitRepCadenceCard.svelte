<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomSitRepsService,
		type WarRoomSitRepCadence
	} from '$lib/services/war-room-sitreps.service';
	import {
		CADENCE_MAX_MINUTES,
		CADENCE_MIN_MINUTES,
		CADENCE_PRESETS,
		cadenceSelectValue,
		reminderOptions,
		validateCadenceMinutes
	} from '../helpers/cadence';

	type Props = {
		warRoomId: number;
		cadence: WarRoomSitRepCadence | null;
		canWrite: boolean;
		onChange?: (cadence: WarRoomSitRepCadence) => void;
	};

	let { warRoomId, cadence, canWrite, onChange }: Props = $props();

	const SELECT_CLASS =
		'h-7 rounded-md border border-input bg-background px-2 text-xs focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

	let saving = $state(false);
	// `custom` stays selected while the user types a value that is not
	// one of the presets yet.
	let customMode = $state(false);
	let customValue = $state('');

	const selectValue = $derived(
		customMode ? 'custom' : cadenceSelectValue(cadence?.cadence_minutes ?? null)
	);
	const reminders = $derived.by(() => {
		const opts = reminderOptions(cadence?.cadence_minutes ?? null);
		const current = cadence?.reminder_minutes;
		// Keep an off-preset server value visible rather than silently
		// showing "Off" for it.
		if (current != null && current > 0 && !opts.includes(current)) {
			return [...opts, current].sort((a, b) => a - b);
		}
		return opts;
	});
	const customError = $derived(
		customMode && customValue !== '' ? validateCadenceMinutes(Number(customValue)) : null
	);

	const save = async (cadenceMinutes: number | null, reminderMinutes: number | null) => {
		saving = true;
		const res = await WarRoomSitRepsService.setCadence(warRoomId, {
			cadence_minutes: cadenceMinutes,
			reminder_minutes: cadenceMinutes == null ? null : reminderMinutes
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			customMode = false;
			onChange?.(res.data as WarRoomSitRepCadence);
			return true;
		}
		toast({ title: apiErrorMessage(res, 'Could not update the cadence'), variant: 'destructive' });
		return false;
	};

	// A reminder longer than the new cadence would be rejected (0..cadence).
	const keepReminder = (cadenceMinutes: number) => {
		const r = cadence?.reminder_minutes ?? null;
		return r != null && r <= cadenceMinutes ? r : null;
	};

	const onSelect = (value: string) => {
		if (value === 'custom') {
			customMode = true;
			customValue = cadence?.cadence_minutes ? String(cadence.cadence_minutes) : '';
			return;
		}
		customMode = false;
		if (value === 'none') {
			void save(null, null);
			return;
		}
		const minutes = Number(value);
		void save(minutes, keepReminder(minutes));
	};

	const applyCustom = () => {
		const minutes = Number(customValue);
		if (customValue === '' || validateCadenceMinutes(minutes)) return;
		void save(minutes, keepReminder(minutes));
	};

	const onReminder = (value: string) => {
		if (!cadence?.cadence_minutes) return;
		void save(cadence.cadence_minutes, value === 'off' ? null : Number(value));
	};
</script>

<section class="border-t p-3" aria-labelledby="sitrep-cadence-heading">
	<h3
		id="sitrep-cadence-heading"
		class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
	>
		Cadence
	</h3>
	<div class="grid gap-2 text-xs">
		<div class="flex items-center justify-between gap-2">
			<label for="sitrep-cadence">Publish</label>
			<select
				id="sitrep-cadence"
				class="{SELECT_CLASS} w-36"
				value={selectValue}
				disabled={!canWrite || saving || !cadence}
				onchange={(e) => onSelect((e.target as HTMLSelectElement).value)}
			>
				<option value="none">No cadence</option>
				{#each CADENCE_PRESETS as p (p.minutes)}
					<option value={String(p.minutes)}>{p.label}</option>
				{/each}
				<option value="custom">Custom…</option>
			</select>
		</div>

		{#if selectValue === 'custom'}
			<div class="flex items-center justify-between gap-2">
				<label for="sitrep-cadence-custom">Every (minutes)</label>
				<div class="flex items-center gap-1">
					<Input
						id="sitrep-cadence-custom"
						type="number"
						min={CADENCE_MIN_MINUTES}
						max={CADENCE_MAX_MINUTES}
						step="1"
						class="h-7 w-20 text-xs"
						value={customValue}
						disabled={!canWrite || saving}
						aria-invalid={customError ? 'true' : undefined}
						aria-describedby={customError ? 'sitrep-cadence-custom-error' : undefined}
						oninput={(e) => (customValue = (e.target as HTMLInputElement).value)}
						onkeydown={(e) => {
							if (e.key === 'Enter') applyCustom();
						}}
					/>
					<Button
						size="sm"
						variant="outline"
						class="h-7 px-2 text-xs"
						onclick={applyCustom}
						disabled={!canWrite || saving || customValue === '' || !!customError}
					>
						Set
					</Button>
				</div>
			</div>
			{#if customError}
				<p id="sitrep-cadence-custom-error" class="text-2xs text-destructive">{customError}</p>
			{/if}
		{/if}

		{#if cadence?.cadence_minutes}
			<div class="flex items-center justify-between gap-2">
				<label for="sitrep-reminder">Remind</label>
				<select
					id="sitrep-reminder"
					class="{SELECT_CLASS} w-36"
					value={cadence.reminder_minutes ? String(cadence.reminder_minutes) : 'off'}
					disabled={!canWrite || saving}
					onchange={(e) => onReminder((e.target as HTMLSelectElement).value)}
				>
					<option value="off">Off</option>
					{#each reminders as m (m)}
						<option value={String(m)}>{m} min before</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>
</section>
