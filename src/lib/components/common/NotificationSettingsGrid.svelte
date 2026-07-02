<!--
	Reusable notification-settings grid.

	Used by BOTH the user profile page (per-user overrides) and the
	admin defaults page. The parent supplies the initial payload and a
	save handler — the grid renders event × channel checkboxes, tracks
	local dirty state, and calls `onSave` with the full grid on submit.
-->

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import { toast } from '$lib/components/ui/toast';
	import type {
		NotificationChannel,
		NotificationEventType,
		NotificationSettingsGrid,
		NotificationSettingsPayload
	} from '$lib/services/notifications.service';

	interface Props {
		title: string;
		description: string;
		payload: NotificationSettingsPayload | null;
		loading: boolean;
		onSave: (grid: NotificationSettingsGrid) => Promise<NotificationSettingsPayload | null>;
	}

	let { title, description, payload, loading, onSave }: Props = $props();

	// Local working copy of the grid. Kept in sync with `payload` when
	// the parent re-fetches (initial load, after save). The `saving`
	// flag guards against double-submits.
	let grid = $state<NotificationSettingsGrid>({});
	let saving = $state(false);

	// Re-sync when payload lands. We deep-clone the settings map so the
	// parent's state doesn't get mutated by checkbox toggles.
	$effect(() => {
		if (payload) {
			grid = JSON.parse(JSON.stringify(payload.settings));
		}
	});

	const EVENT_LABELS: Record<string, string> = {
		mention: 'You are mentioned',
		task_assigned: 'Task assigned to you',
		case_state_change: 'Case you own is updated',
		case_assigned: 'Case assigned to you',
		alert_assigned: 'Alert assigned to you',
		alert_escalated: 'Alert escalated',
		war_room_message: 'War-room message',
		war_room_thread_reply: 'War-room thread reply',
		module_custom: 'Custom module notification'
	};

	const CHANNEL_LABELS: Record<NotificationChannel, string> = {
		in_app: 'In-app',
		email: 'Email'
	};

	function toggle(event: NotificationEventType, channel: NotificationChannel) {
		if (!grid[event]) grid[event] = {} as Record<NotificationChannel, boolean>;
		grid[event][channel] = !grid[event][channel];
		// Reassign to trigger reactivity on the nested map.
		grid = { ...grid };
	}

	async function submit() {
		saving = true;
		try {
			const result = await onSave(grid);
			if (result) {
				toast({ title: 'Notification settings saved', variant: 'success' });
			}
		} finally {
			saving = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if loading || !payload}
			<div class="py-8 text-center text-sm text-muted-foreground">Loading…</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b">
							<th class="py-2 pr-4 text-left font-medium">Event</th>
							{#each payload.channels as channel}
								<th class="w-32 py-2 text-center font-medium">
									{CHANNEL_LABELS[channel] ?? channel}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each payload.event_types as event}
							<tr class="border-b last:border-b-0">
								<td class="py-2 pr-4">
									<Label>{EVENT_LABELS[event] ?? event}</Label>
								</td>
								{#each payload.channels as channel}
									<td class="text-center">
										<Checkbox
											checked={grid[event]?.[channel] ?? false}
											onCheckedChange={() => toggle(event, channel)}
											aria-label={`${event} — ${channel}`}
										/>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="mt-4 flex justify-end">
				<Button onclick={submit} disabled={saving}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
