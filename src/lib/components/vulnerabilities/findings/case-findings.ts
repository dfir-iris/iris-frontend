import { toast } from '$lib/components/ui/toast';
import { VulnerabilitiesService, type CaseFinding } from '$lib/services/vulnerabilities.service';

/**
 * The full finding (with its linked events and IOCs) before editing: the
 * list rows leave the evidence out, and an edit started from them would
 * replace the existing links with only the ones ticked in the dialog.
 */
export async function fetchCaseFindingForEdit(
	caseId: number,
	findingId: number
): Promise<CaseFinding | null> {
	const res = await VulnerabilitiesService.getCase(caseId, findingId);
	if (res.ok && res.data && typeof res.data === 'object') return res.data;
	toast({
		title: 'Failed to load the finding',
		description: res.error?.message,
		variant: 'destructive'
	});
	return null;
}

export async function deleteCaseFinding(caseId: number, finding: CaseFinding): Promise<boolean> {
	const res = await VulnerabilitiesService.removeCase(caseId, finding.finding_id);
	if (!res.ok) {
		toast({
			title: 'Failed to delete the finding',
			description: res.error?.message,
			variant: 'destructive'
		});
		return false;
	}
	toast({
		title: `${finding.vulnerability.identifier} removed from ${finding.asset_name}`,
		variant: 'success'
	});
	return true;
}
