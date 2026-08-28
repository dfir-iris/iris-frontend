<!--
  Admin notification defaults.

  These rows live in the same `notification_setting` table with
  `user_id IS NULL`. Per-user rows override them via the two-tier
  resolution in the backend notification service.

  Route is under /settings so it sits inside the admin sidebar's card
  layout. Access is enforced server-side via `Permissions.server_administrator`
  on the /manage/notification-settings endpoints — a non-admin who
  reaches this page will get a 403 from the fetch and the ApiError
  banner will render below the header.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { BellIcon } from 'lucide-svelte';
	import NotificationSettingsGrid from '$lib/components/common/NotificationSettingsGrid.svelte';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import {
		NotificationsService,
		type NotificationSettingsGrid as SettingsGrid,
		type NotificationSettingsPayload
	} from '$lib/services/notifications.service';

	let payload = $state<NotificationSettingsPayload | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function load() {
		loading = true;
		error = null;
		const res = await NotificationsService.getAdminSettings();
		if (res.ok && res.data && typeof res.data !== 'string') {
			payload = res.data;
		} else {
			error = res.error?.message ?? 'Failed to load admin settings';
		}
		loading = false;
	}

	async function save(grid: SettingsGrid) {
		const res = await NotificationsService.putAdminSettings(grid);
		if (res.ok && res.data && typeof res.data !== 'string') {
			payload = res.data;
			return res.data;
		}
		error = res.error?.message ?? 'Save failed';
		return null;
	}

	onMount(load);
</script>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<BellIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold text-foreground">Notification defaults</h1>
				<p class="text-xs text-muted-foreground">
					Org-wide defaults. Users can override any of these from their profile.
				</p>
			</div>
		</div>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto p-5">
		{#if error}
			<div class="mb-4"><ApiError {error} showRetryButton={false} /></div>
		{/if}

		<NotificationSettingsGrid
			title="Notification defaults"
			description="Toggles below apply to every user unless they override the setting from their profile."
			{payload}
			{loading}
			onSave={save}
		/>
	</div>
</div>
