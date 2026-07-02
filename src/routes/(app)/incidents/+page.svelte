<!--
  Incidents list page. Follows the alerts-page shape (filter row on top,
  card list below, pagination bar at the bottom) but stays intentionally
  slim — incidents are containers, most of the analyst detail work
  happens on the detail page (member alerts, escalate). This page is the
  triage entry point: what's open right now, what to work on next.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PlusIcon, ArrowRightIcon } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Loading } from '$lib/components/ui/loading';
	import { IncidentsService, type PaginatedIncidents } from '$lib/services/incidents.service';
	import type { Incident } from '$lib/types/resources/incident';

	let incidents = $state<Incident[]>([]);
	let total = $state(0);
	let pageNum = $state(1);
	let perPage = $state(20);
	let titleFilter = $state('');
	let loading = $state(false);

	const load = async () => {
		loading = true;
		try {
			const res = await IncidentsService.list({
				page: pageNum,
				per_page: perPage,
				title: titleFilter || undefined
			});
			const payload =
				res.data && typeof res.data === 'object' ? (res.data as PaginatedIncidents) : null;
			incidents = payload?.data ?? [];
			total = payload?.total ?? 0;
		} finally {
			loading = false;
		}
	};

	onMount(load);
</script>

<!--
  Fill the (app) scroll viewport. Without `w-full` the flex row parent
  above (from `(app)/+layout.svelte`) treats this page as a
  content-width flex child, which pushes the whole thing to the left of
  the available space and looks visually broken.
-->
<div class="flex h-full w-full flex-col gap-4 p-4">
	<header class="flex items-center justify-between">
		<div>
			<h1 class="text-lg font-semibold">Incidents</h1>
			<p class="text-xs text-muted-foreground">
				{total} total — sets of alerts grouped for triage
			</p>
		</div>
		<Button onclick={() => goto('/incidents/new')}>
			<PlusIcon class="mr-2 h-4 w-4" /> New incident
		</Button>
	</header>

	<div class="flex items-center gap-2">
		<Input
			placeholder="Search by title"
			value={titleFilter}
			oninput={(e) => (titleFilter = (e.target as HTMLInputElement).value)}
			onkeydown={(e) => e.key === 'Enter' && load()}
		/>
		<Button variant="outline" onclick={load}>Search</Button>
	</div>

	{#if loading}
		<Loading />
	{:else if incidents.length === 0}
		<p class="text-sm text-muted-foreground">No incidents yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each incidents as inc (inc.incident_id)}
				<li class="rounded border p-3 hover:bg-accent">
					<button
						class="flex w-full items-start justify-between text-left"
						onclick={() => goto(`/incidents/${inc.incident_id}`)}
					>
						<div>
							<p class="font-medium">
								#{inc.incident_id} — {inc.incident_title}
							</p>
							<p class="text-xs text-muted-foreground">
								{inc.status?.status_name ?? 'Unknown'} ·
								{(inc.alert_ids ?? []).length} alerts ·
								created {new Date(inc.incident_creation_time).toLocaleString()}
							</p>
						</div>
						<ArrowRightIcon class="h-4 w-4 text-muted-foreground" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
