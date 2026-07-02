<!--
  Incident detail. Shows metadata + the list of member alerts + actions
  (escalate to case, remove alert, edit). Alerts are rendered as compact
  rows here rather than through the full AlertCard because the alert
  detail lives at /alerts/[id]; this page is the incident-level view.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowUpRightIcon, CheckSquareIcon, TrashIcon } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Loading } from '$lib/components/ui/loading';
	import IncidentInvestigationFlowPanel from './IncidentInvestigationFlowPanel.svelte';
	import { IncidentsService } from '$lib/services/incidents.service';
	import { AlertService } from '$lib/services/alerts.service';
	import type { Incident } from '$lib/types/resources/incident';
	import type { Alert } from '$lib/types/resources/alert';

	const incidentId = Number(page.params.incident_id);

	let incident = $state<Incident | null>(null);
	let alerts = $state<Alert[]>([]);
	let loading = $state(true);
	let flowPanelOpen = $state(false);

	const load = async () => {
		loading = true;
		try {
			const res = await IncidentsService.get(incidentId);
			incident =
				res.data && typeof res.data === 'object' ? (res.data as Incident) : null;
			if (incident && incident.alert_ids?.length) {
				const fetched = await Promise.all(
					incident.alert_ids.map(async (id) => {
						const r = await AlertService.get(id);
						return r.data && typeof r.data === 'object' ? (r.data as Alert) : null;
					})
				);
				alerts = fetched.filter((a): a is Alert => !!a);
			} else {
				alerts = [];
			}
		} finally {
			loading = false;
		}
	};

	const removeAlert = async (alertId: number) => {
		if (!incident) return;
		await IncidentsService.removeAlert(incident.incident_id, alertId);
		await load();
	};

	const escalate = async () => {
		if (!incident) return;
		const res = await IncidentsService.escalate(incident.incident_id, {
			case_title: incident.incident_title,
			note: incident.incident_description ?? undefined
		});
		const payload = res.data && typeof res.data === 'object' ? res.data : null;
		if (payload && 'case_id' in payload && payload.case_id) {
			goto(`/case/${payload.case_id}`);
		}
	};

	onMount(load);
</script>

<!-- `w-full` is load-bearing: see the sibling incidents list page. -->
<div class="flex h-full w-full">
	{#if flowPanelOpen && incident}
		<aside
			class="my-3 ml-3 h-[calc(100%-1.5rem)] w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 sm:my-4 sm:ml-4 sm:h-[calc(100%-2rem)]"
			aria-label="Investigation flow"
		>
			<IncidentInvestigationFlowPanel
				incident={incident}
				onClose={() => (flowPanelOpen = false)}
			/>
		</aside>
	{/if}
	<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
	{#if loading}
		<Loading />
	{:else if !incident}
		<p>Not found.</p>
	{:else}
		{#if incident.investigation_flow}
			<div class="flex justify-start">
				<Button
					variant="outline"
					size="sm"
					onclick={() => (flowPanelOpen = !flowPanelOpen)}
				>
					<CheckSquareIcon class="mr-2 h-4 w-4" />
					Investigation flow: {incident.investigation_flow.flow_name}
				</Button>
			</div>
		{/if}
		<header class="flex items-start justify-between">
			<div>
				<h1 class="text-lg font-semibold">
					#{incident.incident_id} — {incident.incident_title}
				</h1>
				<p class="text-xs text-muted-foreground">
					{incident.status?.status_name} · created
					{new Date(incident.incident_creation_time).toLocaleString()}
				</p>
			</div>
			{#if !incident.incident_case_id}
				<Button onclick={escalate} disabled={alerts.length === 0}>
					<ArrowUpRightIcon class="mr-2 h-4 w-4" /> Escalate to case
				</Button>
			{:else}
				<Button variant="outline" onclick={() => goto(`/case/${incident?.incident_case_id}`)}>
					Open linked case #{incident.incident_case_id}
				</Button>
			{/if}
		</header>

		{#if incident.incident_description}
			<p class="whitespace-pre-wrap text-sm">{incident.incident_description}</p>
		{/if}

		<section>
			<h2 class="mb-2 text-sm font-medium">Member alerts ({alerts.length})</h2>
			{#if alerts.length === 0}
				<p class="text-sm text-muted-foreground">No alerts attached yet.</p>
			{:else}
				<ul class="space-y-1">
					{#each alerts as alert (alert.alert_id)}
						<li class="flex items-center justify-between rounded border p-2 text-sm">
							<button
								class="flex-1 text-left hover:underline"
								onclick={() => goto(`/alerts/${alert.alert_id}`)}
							>
								#{alert.alert_id} — {alert.alert_title}
							</button>
							{#if !incident.incident_case_id}
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove from incident"
									onclick={() => removeAlert(alert.alert_id)}
								>
									<TrashIcon class="h-4 w-4" />
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
	</div>
</div>
