<!--
  Compact list of findings for an asset (case asset detail, registry
  asset detail).
-->
<script lang="ts">
	import { ExternalLinkIcon, HistoryIcon, PencilIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { CaseFinding, ManagedFinding } from '$lib/services/vulnerabilities.service';
	import SeverityBadge from '../SeverityBadge.svelte';
	import KevBadge from '../KevBadge.svelte';
	import FindingStatusPill from './FindingStatusPill.svelte';
	import ExploitationPill from './ExploitationPill.svelte';
	import FindingDueDate from './FindingDueDate.svelte';
	import { vulnerabilityHref } from './finding-form';

	type Finding = CaseFinding | ManagedFinding;

	let {
		findings,
		canEdit = false,
		showCase = false,
		emptyMessage = 'No vulnerability recorded.',
		onEdit,
		onHistory,
		onDelete
	}: {
		findings: Finding[];
		canEdit?: boolean;
		/** Show the case a (case) finding belongs to, with a link. */
		showCase?: boolean;
		emptyMessage?: string;
		onEdit?: (finding: Finding) => void;
		onHistory?: (finding: Finding) => void;
		onDelete?: (finding: Finding) => void;
	} = $props();
</script>

{#if findings.length === 0}
	<p class="py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each findings as finding (`${finding.scope}-${finding.finding_id}`)}
			<li
				class="rounded-md border p-3 {finding.exploitation_status === 'exploited' &&
				finding.status_group === 'open'
					? 'border-red-300 dark:border-red-800'
					: ''}"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<a
								href={vulnerabilityHref(finding.vulnerability.vulnerability_id)}
								class="font-mono text-xs font-semibold hover:underline"
							>
								{finding.vulnerability.identifier}
							</a>
							<SeverityBadge
								severity={finding.vulnerability.severity}
								score={finding.vulnerability.cvss_score}
							/>
							<KevBadge kev={finding.vulnerability.kev} />
						</div>
						<p
							class="mt-0.5 truncate text-xs text-muted-foreground"
							title={finding.vulnerability.title}
						>
							{finding.vulnerability.title}
						</p>
						<div class="mt-2 flex flex-wrap items-center gap-2 text-2xs">
							<FindingStatusPill status={finding.remediation_status} />
							<ExploitationPill status={finding.exploitation_status} />
							{#if finding.due_date}
								<FindingDueDate dueDate={finding.due_date} overdue={finding.overdue} />
							{/if}
							{#if finding.component}
								<span class="text-muted-foreground">
									{finding.component}{finding.installed_version
										? ` ${finding.installed_version}`
										: ''}
								</span>
							{/if}
							{#if finding.owner_name}
								<span class="text-muted-foreground">· {finding.owner_name}</span>
							{/if}
						</div>
						{#if showCase && finding.scope === 'case'}
							<a
								href={`/case/${finding.case_id}/assets/${finding.asset_id}?tab=vulnerabilities`}
								class="mt-1.5 inline-flex items-center gap-1 text-2xs text-primary hover:underline"
							>
								#{finding.case_id} · {finding.case_name} · {finding.asset_name}
								<ExternalLinkIcon class="size-3" />
							</a>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-0.5">
						{#if onHistory}
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								aria-label="History"
								title="History"
								onclick={() => onHistory(finding)}
							>
								<HistoryIcon />
							</Button>
						{/if}
						{#if canEdit && onEdit}
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								aria-label="Edit"
								title="Edit"
								onclick={() => onEdit(finding)}
							>
								<PencilIcon />
							</Button>
						{/if}
						{#if canEdit && onDelete}
							<Button
								variant="ghost"
								size="icon"
								class="size-7 text-destructive hover:text-destructive"
								aria-label="Delete"
								title="Delete"
								onclick={() => onDelete(finding)}
							>
								<Trash2Icon />
							</Button>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
