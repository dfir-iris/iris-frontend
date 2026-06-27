<!--
  Read-only preview modal for attachment chips in the chat stream.

  Same role as the case-side `AssetDetailDialog` / `IocDetailDialog`,
  but case-agnostic: we fetch by (caseId, kind, id) directly from the
  v2 endpoints so the modal works regardless of which (if any) case
  context the war-room layout happens to sit inside. Keeps the
  operator in the chat surface — no navigation needed to look at the
  underlying resource.
-->
<script lang="ts">
	import { ExternalLink, Loader2 } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';

	export type AttachmentTarget = {
		kind: 'event' | 'ioc' | 'asset' | 'task';
		caseId: number;
		label: string;
	};

	type Props = {
		open: boolean;
		target: AttachmentTarget | null;
		onOpenChange: (next: boolean) => void;
	};
	let { open = $bindable(false), target, onOpenChange }: Props = $props();

	let loading = $state(false);
	let detail = $state<Record<string, unknown> | null>(null);
	let error = $state<string | null>(null);

	const titleFor = (k: AttachmentTarget['kind']) => {
		switch (k) {
			case 'event':
				return 'Event';
			case 'ioc':
				return 'IOC';
			case 'asset':
				return 'Asset';
			case 'task':
				return 'Task';
		}
	};

	const load = async () => {
		if (!target) return;
		loading = true;
		error = null;
		detail = null;
		try {
			let res;
			switch (target.kind) {
				case 'asset':
					res = await CaseAssetsService.get(target.caseId, Number(extractIdFromLabel(target.label) ?? 0));
					break;
				case 'ioc':
					res = await CaseIocsService.get(target.caseId, Number(extractIdFromLabel(target.label) ?? 0));
					break;
				case 'task':
					res = await CaseTasksService.get(target.caseId, Number(extractIdFromLabel(target.label) ?? 0));
					break;
				case 'event':
					res = await CaseTimelineService.getEvent(
						target.caseId,
						Number(extractIdFromLabel(target.label) ?? 0)
					);
					break;
			}
			if (res && res.ok && res.data && typeof res.data !== 'string') {
				detail = res.data as unknown as Record<string, unknown>;
			} else {
				error = 'Could not load resource. Open the case page for full details.';
			}
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	};

	// Labels are human-readable (e.g. asset name) — we don't carry the id
	// in the chip. Searching by label is good enough for the preview when
	// there's an exact match in the cached list, but the v2 detail
	// endpoints want a numeric id. For now we fall back to a lookup by
	// listing the resource and matching label — keeps the modal working
	// even when the chip was inserted by a slash-command and we never
	// stamped an id into the markdown.
	const extractIdFromLabel = (_label: string): string | null => null;

	const fallbackList = async () => {
		// When the direct fetch above fails (we don't have an id), list a
		// page of resources for the case and match by label.
		if (!target) return;
		try {
			let payload: Array<Record<string, unknown>> = [];
			if (target.kind === 'event') {
				const r = await CaseTimelineService.listEvents(
					target.caseId,
					{},
					{},
					{ per_page: 200 }
				);
				if (r.ok && r.data && typeof r.data !== 'string') {
					payload = (r.data as { timeline?: Array<Record<string, unknown>> })
						.timeline ?? [];
				}
			} else if (target.kind === 'ioc') {
				const r = await CaseIocsService.list(target.caseId, { per_page: 200 });
				if (r.ok && r.data && typeof r.data !== 'string') {
					payload =
						(r.data as unknown as { data?: Array<Record<string, unknown>> })
							.data ?? [];
				}
			} else if (target.kind === 'asset') {
				const r = await CaseAssetsService.list(target.caseId, {
					per_page: 200
				});
				if (r.ok && r.data && typeof r.data !== 'string') {
					payload =
						(r.data as unknown as { data?: Array<Record<string, unknown>> })
							.data ?? [];
				}
			} else if (target.kind === 'task') {
				const r = await CaseTasksService.list(target.caseId, { per_page: 200 });
				if (r.ok && r.data && typeof r.data !== 'string') {
					payload =
						(r.data as unknown as { data?: Array<Record<string, unknown>> })
							.data ?? [];
				}
			}

			const labelKey =
				target.kind === 'event'
					? 'event_title'
					: target.kind === 'ioc'
						? 'ioc_value'
						: target.kind === 'asset'
							? 'asset_name'
							: 'task_title';

			const match = payload.find(
				(p) => String((p as Record<string, unknown>)[labelKey] ?? '') === target.label
			);
			if (match) {
				detail = match;
				error = null;
			}
		} catch {
			/* keep the existing error */
		}
	};

	$effect(() => {
		if (open && target) {
			void (async () => {
				await load();
				if (!detail) await fallbackList();
			})();
		}
	});

	// Selected fields, kind-by-kind, that we render as a clean summary.
	type SummaryRow = { label: string; value: string };
	const summary = $derived.by<SummaryRow[]>(() => {
		if (!detail || !target) return [];
		const out: SummaryRow[] = [];
		const get = (k: string) => detail?.[k];
		const str = (v: unknown) => (v == null || v === '' ? '—' : String(v));

		if (target.kind === 'asset') {
			out.push({ label: 'Name', value: str(get('asset_name')) });
			out.push({ label: 'Type', value: str((get('asset_type') as { asset_name?: string } | undefined)?.asset_name ?? get('asset_type_name')) });
			out.push({ label: 'Description', value: str(get('asset_description')) });
			out.push({ label: 'IP', value: str(get('asset_ip')) });
			out.push({ label: 'Tags', value: str(get('asset_tags')) });
		} else if (target.kind === 'ioc') {
			out.push({ label: 'Value', value: str(get('ioc_value')) });
			out.push({
				label: 'Type',
				value: str(
					(get('ioc_type') as { type_name?: string } | undefined)?.type_name ??
						get('ioc_type_name')
				)
			});
			out.push({ label: 'Description', value: str(get('ioc_description')) });
			out.push({ label: 'TLP', value: str(get('ioc_tlp_id')) });
			out.push({ label: 'Tags', value: str(get('ioc_tags')) });
		} else if (target.kind === 'task') {
			out.push({ label: 'Title', value: str(get('task_title')) });
			out.push({ label: 'Description', value: str(get('task_description')) });
			out.push({ label: 'Status', value: str(get('task_status_id') ?? get('status_id')) });
			out.push({ label: 'Assignee', value: str(get('task_userid_open') ?? get('assignee_id')) });
			out.push({ label: 'Tags', value: str(get('task_tags')) });
		} else if (target.kind === 'event') {
			out.push({ label: 'Title', value: str(get('event_title')) });
			out.push({ label: 'Source', value: str(get('event_source')) });
			out.push({ label: 'Date', value: str(get('event_date')) });
			out.push({ label: 'Content', value: str(get('event_content')) });
			out.push({ label: 'Tags', value: str(get('event_tags')) });
		}
		return out;
	});

	const sourceLink = $derived.by(() => {
		if (!target) return '';
		const sub =
			target.kind === 'event'
				? 'timeline'
				: target.kind === 'ioc'
					? 'iocs'
					: target.kind === 'asset'
						? 'assets'
						: 'tasks';
		return `/case/${target.caseId}/${sub}`;
	});
</script>

<Dialog.Root bind:open onOpenChange={(v) => onOpenChange(v)}>
	<Dialog.Content class="max-w-2xl gap-0 overflow-hidden p-0">
		<Dialog.Header class="border-b px-5 py-3">
			<Dialog.Title class="flex items-center gap-2 text-base font-medium">
				{target ? titleFor(target.kind) : 'Preview'}
				{#if target}
					<span class="ml-1 truncate font-normal text-muted-foreground">
						— {target.label}
					</span>
				{/if}
			</Dialog.Title>
		</Dialog.Header>

		<div class="max-h-[60vh] overflow-y-auto p-5">
			{#if loading}
				<div class="space-y-2">
					{#each Array(4) as _}
						<Skeleton class="h-5 w-full" />
					{/each}
				</div>
			{:else if error && !detail}
				<p class="text-xs text-destructive">{error}</p>
			{:else if summary.length === 0}
				<p class="text-xs text-muted-foreground">No details available.</p>
			{:else}
				<dl class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
					{#each summary as row}
						<dt class="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
							{row.label}
						</dt>
						<dd class="break-words">{row.value}</dd>
					{/each}
				</dl>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2 border-t bg-card/40 px-5 py-3">
			<a
				href={sourceLink}
				class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
			>
				Open in case <ExternalLink class="h-3 w-3" />
			</a>
			<Button size="sm" variant="ghost" onclick={() => onOpenChange(false)}>
				Close
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
