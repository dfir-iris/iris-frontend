<!--
  Add / edit a vulnerability finding of a registry (managed) asset.
-->
<script lang="ts">
	import { toast } from '$lib/components/ui/toast';
	import {
		VulnerabilitiesService,
		type ManagedFinding
	} from '$lib/services/vulnerabilities.service';
	import FindingDialog from './FindingDialog.svelte';
	import {
		buildFindingPayload,
		buildManagedCreatePayload,
		choiceIdentifier,
		emptyFindingForm,
		findingToForm,
		type FindingFormState,
		type VulnerabilityChoice
	} from './finding-form';

	let {
		open = $bindable(false),
		managedAssetId,
		assetName,
		finding = null,
		onSaved
	}: {
		open: boolean;
		managedAssetId: number;
		assetName: string;
		finding?: ManagedFinding | null;
		onSaved?: () => void;
	} = $props();

	const initial = $derived<FindingFormState>(finding ? findingToForm(finding) : emptyFindingForm());

	const submit = async ({
		choice,
		form
	}: {
		choice: VulnerabilityChoice | null;
		form: FindingFormState;
	}): Promise<boolean> => {
		if (finding) {
			const payload = buildFindingPayload(form, { initial });
			if (Object.keys(payload).length === 0) return true;
			const res = await VulnerabilitiesService.updateManaged(
				managedAssetId,
				finding.finding_id,
				payload
			);
			if (!res.ok) {
				toast({
					title: 'Failed to update the finding',
					description: res.error?.message,
					variant: 'destructive'
				});
				return false;
			}
			toast({ title: `${finding.vulnerability.identifier} updated`, variant: 'success' });
			onSaved?.();
			return true;
		}

		if (!choice) return false;
		const res = await VulnerabilitiesService.createManaged(
			managedAssetId,
			buildManagedCreatePayload(choice, form)
		);
		if (!res.ok) {
			toast({
				title: 'Failed to record the vulnerability',
				description: res.error?.message,
				variant: 'destructive'
			});
			return false;
		}
		toast({ title: `${choiceIdentifier(choice)} recorded on ${assetName}`, variant: 'success' });
		onSaved?.();
		return true;
	};
</script>

<FindingDialog
	bind:open
	mode={finding ? 'edit' : 'create'}
	title={finding ? `Edit ${finding.vulnerability.identifier}` : 'Add a vulnerability'}
	description={finding
		? `${finding.vulnerability.title} — on ${assetName}`
		: `Record a catalogue entry on the registry asset ${assetName}.`}
	{initial}
	ownerName={finding?.owner_name ?? null}
	onSubmit={submit}
/>
