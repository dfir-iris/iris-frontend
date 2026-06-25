<!--
  Dashboards list. System dashboards (currently only Statistics) pinned at
  the top in their own group so admins land on a working example before
  scrolling user dashboards. Create button is rendered unconditionally;
  the backend enforces `custom_dashboards_write` and a 403 surfaces here
  as a toast.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { PlusIcon, LayoutDashboardIcon, LockIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		CustomDashboardsService,
		type CustomDashboard
	} from '$lib/services/custom-dashboards.service';

	let dashboards: CustomDashboard[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);

	const systemDashboards = $derived(dashboards.filter((d) => d.is_system));
	const userDashboards = $derived(dashboards.filter((d) => !d.is_system));

	async function load() {
		loading = true;
		error = null;
		const response = await CustomDashboardsService.list();
		if (response.ok && Array.isArray(response.data)) {
			dashboards = response.data;
		} else {
			error = response.error?.message ?? 'Failed to load dashboards.';
		}
		loading = false;
	}

	async function createBlank() {
		const response = await CustomDashboardsService.create({
			name: 'Untitled dashboard',
			widgets: [
				{
					name: 'Total alerts',
					chart_type: 'number',
					fields: [
						{ table: 'alerts', column: 'alert_id', aggregation: 'count', alias: 'total' }
					]
				}
			]
		});
		if (response.ok && response.data) {
			goto(`/dashboards/${response.data.dashboard_uuid}/edit`);
		} else {
			error = response.error?.message ?? 'Failed to create dashboard.';
		}
	}

	$effect(() => {
		load();
	});
</script>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
	<header class="flex items-end justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Dashboards</h1>
			<p class="text-sm text-muted-foreground">
				Built-in and user-defined dashboards. Clone Statistics for a quick start.
			</p>
		</div>
		<Button onclick={createBlank}>
			<PlusIcon class="size-4" />
			New dashboard
		</Button>
	</header>

	{#if error}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else}
		{#if systemDashboards.length > 0}
			<section>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					System
				</h2>
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each systemDashboards as dashboard (dashboard.dashboard_uuid)}
						<a href={`/dashboards/${dashboard.dashboard_uuid}`} class="block">
							<Card class="transition hover:border-primary">
								<CardHeader>
									<CardTitle class="flex items-center gap-2">
										<LayoutDashboardIcon class="size-4" />
										{dashboard.name}
										<Badge variant="secondary"><LockIcon class="mr-1 size-3" />System</Badge>
									</CardTitle>
									<CardDescription>{dashboard.description ?? ''}</CardDescription>
								</CardHeader>
							</Card>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Yours and shared
			</h2>
			{#if userDashboards.length === 0}
				<p class="text-sm text-muted-foreground">No dashboards yet. Create one above.</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each userDashboards as dashboard (dashboard.dashboard_uuid)}
						<a href={`/dashboards/${dashboard.dashboard_uuid}`} class="block">
							<Card class="transition hover:border-primary">
								<CardHeader>
									<CardTitle class="flex items-center gap-2">
										{dashboard.name}
										{#if dashboard.is_shared}
											<Badge variant="outline">Shared</Badge>
										{/if}
									</CardTitle>
									<CardDescription>{dashboard.description ?? ''}</CardDescription>
								</CardHeader>
								<CardContent class="text-xs text-muted-foreground">
									Updated {dashboard.updated_at ?? '—'}
								</CardContent>
							</Card>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
