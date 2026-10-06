<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils.js';
	import {
		findingStatusGroup,
		type RemediationStatus
	} from '$lib/services/vulnerabilities.service';
	import { REMEDIATION_STATUS_LABELS, STATUS_GROUP_CLASSES, labelOf } from '../labels';

	/** Remediation status, coloured by its group (open / fixed / dismissed). */
	let {
		status,
		class: className = ''
	}: {
		status: RemediationStatus | string;
		class?: string;
	} = $props();

	const group = $derived(findingStatusGroup(status));
</script>

<Badge class={cn('whitespace-nowrap', STATUS_GROUP_CLASSES[group], className)}>
	{labelOf(REMEDIATION_STATUS_LABELS, status)}
</Badge>
