<!--
  Dashboards list. System dashboards (currently only Statistics) pinned at
  the top in their own group so admins land on a working example before
  scrolling user dashboards. Create button is rendered unconditionally;
  the backend enforces `custom_dashboards_write` and a 403 surfaces here
  as a toast.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		PlusIcon,
		LayoutDashboardIcon,
		LockIcon,
		Share2Icon,
		SparklesIcon,
		CopyIcon,
		CodeIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import {
		CustomDashboardsService,
		type CustomDashboard,
		type DashboardDefinition
	} from '$lib/services/custom-dashboards.service';

	let dashboards: CustomDashboard[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);

	// JSON viewer state — opens a modal with the full dashboard definition
	// so an analyst can see how the system dashboard is wired before
	// cloning + tweaking. Read-only.
	let jsonViewerDashboard: CustomDashboard | null = $state(null);

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
					fields: [{ table: 'alerts', column: 'alert_id', aggregation: 'count', alias: 'total' }]
				}
			]
		});
		if (response.ok && response.data && typeof response.data !== 'string') {
			goto(`/dashboards/${response.data.dashboard_uuid}/edit`);
		} else {
			error = response.error?.message ?? 'Failed to create dashboard.';
		}
	}

	// Deep-clone the system dashboard's definition into a new user-owned
	// dashboard. Strips is_system/is_shared/dashboard_uuid so the copy is
	// editable and owned by the caller. Server assigns a new uuid.
	async function cloneDashboard(source: CustomDashboard, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		const def: DashboardDefinition = {
			...(source.definition ?? {}),
			name: `${displayName(source)} (copy)`,
			description: source.description ?? undefined,
			is_shared: false
		};
		const response = await CustomDashboardsService.create(def);
		if (response.ok && response.data && typeof response.data !== 'string') {
			toast({ title: `Cloned "${displayName(source)}"`, variant: 'success' });
			goto(`/dashboards/${response.data.dashboard_uuid}/edit`);
		} else {
			toast({
				title: response.error?.message ?? 'Failed to clone dashboard.',
				variant: 'destructive'
			});
		}
	}

	function openJsonViewer(dashboard: CustomDashboard, evt: MouseEvent) {
		evt.preventDefault();
		evt.stopPropagation();
		jsonViewerDashboard = dashboard;
	}

	async function copyDashboardJson() {
		if (!jsonViewerDashboard) return;
		try {
			await navigator.clipboard.writeText(JSON.stringify(jsonViewerDashboard.definition, null, 2));
			toast({ title: 'Copied to clipboard', variant: 'success' });
		} catch {
			toast({ title: 'Clipboard blocked — select the text manually', variant: 'destructive' });
		}
	}

	// Empty titles happen when a dashboard is created without a name (or
	// the field is stripped by an admin export). Render a stable fallback
	// so cards never collapse into a shapeless blob.
	function displayName(d: CustomDashboard): string {
		return d.name?.trim() || 'Untitled dashboard';
	}

	function formatUpdated(iso: string | null | undefined): string {
		if (!iso) return '—';
		try {
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return '—';
			return d.toLocaleString(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short'
			});
		} catch {
			return '—';
		}
	}

	// Deterministic pastel accent per dashboard so the grid gets some
	// visual rhythm without random flashes on re-render. Uses the uuid's
	// first hex char (0-f = 0-15) to pick a 24-step hue slice.
	function accentHue(uuid: string): number {
		const c = parseInt(uuid?.[0] ?? '0', 16);
		return (Number.isFinite(c) ? c : 0) * 24;
	}

	$effect(() => {
		load();
	});
</script>

<svelte:head>
	<title>Dashboards</title>
</svelte:head>

<div
	class="mx-auto flex w-full max-w-[1920px] flex-col gap-8 px-8 py-10 lg:px-12 xl:px-16 2xl:px-20"
>
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-semibold tracking-tight">Dashboards</h1>
			<p class="text-sm text-muted-foreground">
				Built-in and user-defined dashboards. Clone Statistics for a quick start.
			</p>
		</div>
		<Button onclick={createBlank} class="shadow-sm">
			<PlusIcon class="size-4" />
			New dashboard
		</Button>
	</header>

	{#if error}
		<div
			class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
		>
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each Array(4) as _, i (i)}
				<Card class="h-32 animate-pulse bg-muted/40"></Card>
			{/each}
		</div>
	{:else}
		{#if systemDashboards.length > 0}
			<section class="flex flex-col gap-3">
				<h2
					class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					<SparklesIcon class="size-3" />
					System
				</h2>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each systemDashboards as dashboard (dashboard.dashboard_uuid)}
						<a
							href={`/dashboards/${dashboard.dashboard_uuid}`}
							class="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						>
							<Card
								class="group-hover:shadow-elevation-4 relative h-full overflow-hidden border-border/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/60"
							>
								<div
									class="pointer-events-none absolute inset-x-0 top-0 h-1"
									style="background: linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) 100%);"
								></div>
								<CardHeader class="gap-3 p-5 pt-6">
									<div class="flex items-start gap-3">
										<div
											class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
										>
											<LayoutDashboardIcon class="size-5" />
										</div>
										<div class="flex min-w-0 flex-1 flex-col gap-1">
											<div class="flex items-center gap-2">
												<span class="truncate text-base font-semibold"
													>{displayName(dashboard)}</span
												>
												<Badge variant="secondary" class="shrink-0 gap-1 text-2xs">
													<LockIcon class="size-3" />
													System
												</Badge>
											</div>
											{#if dashboard.description}
												<p class="line-clamp-2 text-xs text-muted-foreground">
													{dashboard.description}
												</p>
											{/if}
										</div>
									</div>
									<div class="mt-1 flex flex-wrap gap-2 border-t border-border/50 pt-3">
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-2xs font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
											onclick={(e) => cloneDashboard(dashboard, e)}
											title="Clone this dashboard to your workspace and edit it"
										>
											<CopyIcon class="size-3" />
											Clone
										</button>
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-2xs font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
											onclick={(e) => openJsonViewer(dashboard, e)}
											title="View the raw dashboard definition"
										>
											<CodeIcon class="size-3" />
											View JSON
										</button>
									</div>
								</CardHeader>
							</Card>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section class="flex flex-col gap-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Yours and shared
			</h2>
			{#if userDashboards.length === 0}
				<Card class="border-dashed bg-muted/30 p-8 text-center">
					<div
						class="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<LayoutDashboardIcon class="size-5" />
					</div>
					<p class="mt-3 text-sm font-medium">No dashboards yet</p>
					<p class="mt-1 text-xs text-muted-foreground">
						Create one from scratch or clone the Statistics dashboard above to get started.
					</p>
					<Button onclick={createBlank} size="sm" class="mt-4">
						<PlusIcon class="size-3.5" />
						New dashboard
					</Button>
				</Card>
			{:else}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each userDashboards as dashboard (dashboard.dashboard_uuid)}
						{@const hue = accentHue(dashboard.dashboard_uuid)}
						<a
							href={`/dashboards/${dashboard.dashboard_uuid}`}
							class="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						>
							<Card
								class="group-hover:shadow-elevation-4 relative h-full overflow-hidden border-border/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/60"
							>
								<div
									class="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-80"
									style="background: linear-gradient(90deg, hsl({hue} 70% 55%) 0%, hsl({hue +
										30} 65% 60%) 100%);"
								></div>
								<CardHeader class="gap-3 pt-5">
									<div class="flex items-start gap-3">
										<div
											class="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
											style="background: hsl({hue} 70% 55% / 0.15); color: hsl({hue} 70% 45%);"
										>
											{displayName(dashboard).slice(0, 1).toUpperCase()}
										</div>
										<div class="flex min-w-0 flex-1 flex-col gap-0.5">
											<div class="flex items-center gap-2">
												<span class="truncate text-sm font-semibold">
													{displayName(dashboard)}
												</span>
												{#if dashboard.is_shared}
													<Badge
														variant="outline"
														class="shrink-0 gap-1 border-primary/30 text-2xs text-primary"
													>
														<Share2Icon class="size-3" />
														Shared
													</Badge>
												{/if}
											</div>
											{#if dashboard.description}
												<p class="line-clamp-2 text-xs text-muted-foreground">
													{dashboard.description}
												</p>
											{/if}
											<p class="mt-1 text-2xs text-muted-foreground">
												Updated {formatUpdated(dashboard.updated_at)}
											</p>
										</div>
									</div>
								</CardHeader>
							</Card>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<!-- Read-only JSON viewer for a dashboard definition. Handy for system
     dashboards where an analyst wants to see the wiring before cloning
     and tweaking, and for exporting a working definition to another
     instance. -->
<Dialog
	open={jsonViewerDashboard !== null}
	onOpenChange={(v) => {
		if (!v) jsonViewerDashboard = null;
	}}
>
	<DialogContent class="max-h-[85vh] max-w-3xl overflow-hidden">
		<DialogHeader>
			<DialogTitle class="flex items-center gap-2">
				<CodeIcon class="size-4" />
				{jsonViewerDashboard ? displayName(jsonViewerDashboard) : ''} — JSON
			</DialogTitle>
		</DialogHeader>
		{#if jsonViewerDashboard}
			<div class="flex flex-col gap-3">
				<p class="text-xs text-muted-foreground">
					Read-only view of the dashboard's definition. Use "Copy" to grab it and paste into another
					instance, or clone the dashboard to get an editable copy.
				</p>
				<pre
					class="max-h-[55vh] overflow-auto rounded-md border bg-muted/50 p-3 text-2xs leading-relaxed"><code
						>{JSON.stringify(jsonViewerDashboard.definition, null, 2)}</code
					></pre>
				<div class="flex justify-end gap-2">
					<Button variant="outline" size="sm" onclick={copyDashboardJson}>
						<CopyIcon class="size-3.5" />
						Copy
					</Button>
					<Button size="sm" onclick={(e) => cloneDashboard(jsonViewerDashboard!, e)}>
						<CopyIcon class="size-3.5" />
						Clone as editable
					</Button>
					<Button variant="ghost" size="sm" onclick={() => (jsonViewerDashboard = null)}>
						<XIcon class="size-3.5" />
						Close
					</Button>
				</div>
			</div>
		{/if}
	</DialogContent>
</Dialog>
