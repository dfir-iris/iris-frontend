<script lang="ts">
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { getIocTypeIcon } from '$lib/components/common/ioc/ioc-type-icon';
	import type { Ioc } from '$lib/types/resources/ioc';
	import EntityRow from '$lib/components/common/EntityRow.svelte';
	import TlpBadge from '$lib/components/common/tlp/TlpBadge.svelte';
	import SeenElsewhereBadge from '$lib/components/common/SeenElsewhereBadge.svelte';
	import { toPlainSnippet } from '$lib/utils/text';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let {
		ioc,
		compact = false,
		isSelected = false
	}: { ioc: Ioc; compact?: boolean; isSelected?: boolean } = $props();

	// Case id resolved from the URL — used by the "seen elsewhere" badge
	// loader. Not all mount contexts have a case in the params (e.g.
	// dashboard widgets), in which case we skip the cross-case lookup.
	const caseId = $derived(Number(page.params.case_id));

	const IocTypeIcon = $derived(getIocTypeIcon(ioc.ioc_type?.type_name));

	// IOC Value Formatting
	function formatIOCValue(value: string, typeName: string | undefined) {
		if (!typeName) return value;
		const lowerTypeName = typeName.toLowerCase();
		if (
			lowerTypeName.includes('hash') ||
			lowerTypeName.includes('md5') ||
			lowerTypeName.includes('sha')
		) {
			if (value.length > 16) {
				return `${value.substring(0, 8)}...${value.substring(value.length - 8)}`;
			}
		}
		if (lowerTypeName.includes('filename') && value.includes('|')) {
			const parts = value.split('|');
			if (parts.length === 2 && parts[1].length > 16) {
				return `${parts[0]} | ${parts[1].substring(0, 8)}...`;
			}
		}
		return value;
	}

	// Descriptions are markdown. The row shows a flattened one-liner; the
	// rendered markdown lives in the IOC detail pane.
	const descriptionSnippet = $derived(compact ? '' : toPlainSnippet(ioc.ioc_description ?? '', 90));

	function handleClick() {
		if (compact) return;
		goto(`/case/${page.params.case_id}/iocs/${ioc.ioc_id}`);
	}
</script>

<button
	type="button"
	class="block w-full text-left"
	onclick={handleClick}
	aria-label={`View details for IOC ${ioc.ioc_value}`}
	disabled={compact}
>
	<EntityRow
		id={`ioc-card-${ioc.ioc_id}`}
		title={formatIOCValue(ioc.ioc_value, ioc.ioc_type?.type_name)}
		Icon={IocTypeIcon}
		mono
		{isSelected}
		tags={compact ? [] : (ioc.ioc_tags ?? [])}
	>
		{#snippet titleSuffix()}
			<ClipboardCopy
				value={ioc.ioc_value}
				tooltipText="Copy IOC value"
				className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				size={12}
			/>
		{/snippet}

		{#snippet badges()}
			<TlpBadge tlp_name={ioc.tlp?.tlp_name} />
		{/snippet}

		{#snippet meta()}
			<span class="truncate">{ioc.ioc_type?.type_name || 'Unknown type'}</span>

			{#if descriptionSnippet}
				<span class="truncate">{descriptionSnippet}</span>
			{/if}

			<!--
			  "Seen elsewhere" pivot. Inline (non-interactive) variant so it
			  can sit inside the parent `<button>` row without producing
			  nested buttons. It auto-hides when there are no other sightings.
			-->
			{#if Number.isFinite(caseId) && !compact}
				<SeenElsewhereBadge
					variant="inline"
					objectLabel="IOC"
					objectId={ioc.ioc_id}
					load={async () => {
						const res = await CaseIocsService.listOtherCaseLinks(caseId, ioc.ioc_id);
						return res.ok && Array.isArray(res.data) ? res.data : null;
					}}
				/>
			{/if}
		{/snippet}
	</EntityRow>
</button>
