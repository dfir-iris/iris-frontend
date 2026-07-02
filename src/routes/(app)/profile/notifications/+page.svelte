<!--
	Per-user notification preferences.

	Renders the shared NotificationSettingsGrid seeded with the
	effective view (admin defaults merged with the user's overrides).
	Save writes to /api/v2/notifications/settings which persists only
	the per-user rows.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import NotificationSettingsGrid from '$lib/components/common/NotificationSettingsGrid.svelte';
	import {
		NotificationsService,
		type NotificationSettingsGrid as SettingsGrid,
		type NotificationSettingsPayload
	} from '$lib/services/notifications.service';

	let payload = $state<NotificationSettingsPayload | null>(null);
	let loading = $state(true);

	async function load() {
		loading = true;
		const res = await NotificationsService.getSettings();
		if (res.ok && res.data && typeof res.data !== 'string') {
			payload = res.data;
		}
		loading = false;
	}

	async function save(grid: SettingsGrid) {
		const res = await NotificationsService.putSettings(grid);
		if (res.ok && res.data && typeof res.data !== 'string') {
			payload = res.data;
			return res.data;
		}
		return null;
	}

	onMount(load);
</script>

<div class="mx-auto max-w-3xl p-6">
	<NotificationSettingsGrid
		title="Notifications"
		description="Choose how you want to be notified. In-app notifications appear in the top-bar bell. Email delivery uses the org SMTP config."
		payload={payload}
		loading={loading}
		onSave={save}
	/>
</div>
