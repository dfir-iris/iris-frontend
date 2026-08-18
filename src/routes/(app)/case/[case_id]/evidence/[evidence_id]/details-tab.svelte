<script lang="ts">
	import type { Evidence, EvidenceType } from '$lib/types/resources/evidence';
	import { EvidenceTypesService } from '$lib/services/evidence-types.service';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { Fact, FactBar, FactRecord } from '$lib/components/common/fact-bar';
	import EvidenceForm from '../components/evidence-form.svelte';

	type EditData = {
		filename: string;
		file_description: string;
		type_id?: number;
		file_hash?: string;
		file_size?: number;
		acquisition_date?: string;
	};

	type Props = {
		evidence: Evidence;
		isEditing?: boolean;
		editData?: EditData;
		onUpdateEditData?: (field: string, value: string | number) => void;
		onSaveChanges?: () => void;
	};

	let {
		evidence,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		onSaveChanges = () => {}
	}: Props = $props();

	let evidenceTypes = $state<EvidenceType[]>([]);

	const formatSize = (bytes: number | null | undefined): string | null => {
		if (!bytes || bytes <= 0) return null;
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	};

	const loadOptions = async () => {
		const typesRes = await EvidenceTypesService.list({ fetch });

		if (typesRes.ok && Array.isArray(typesRes.data)) {
			evidenceTypes = typesRes.data as EvidenceType[];
		}
	};

	const updateField = (field: string, value: string | number) => onUpdateEditData(field, value);

	$effect(() => {
		loadOptions();
	});
</script>

{#if isEditing && editData}
	<div class="p-4">
		<EvidenceForm
			formData={editData}
			{evidenceTypes}
			onUpdateField={updateField}
			onSave={onSaveChanges}
		/>
	</div>
{:else}
	<!--
	  Triage facts on one strip, then the prose at full width. The filename is
	  absent on purpose — it is the header one line above this.
	-->
	<FactBar>
		<Fact label="Type" value={evidence.type?.name} />
		<Fact label="Size" value={formatSize(evidence.file_size)} />
		<Fact label="Acquired" value={evidence.acquisition_date} />
		<Fact label="Hash" value={evidence.file_hash} mono copyable />
	</FactBar>

	<div class="p-4">
		{#if evidence.file_description}
			<MarkDownPreview markdown={evidence.file_description} />
		{:else}
			<p class="text-sm italic text-muted-foreground">No description provided</p>
		{/if}

		<FactRecord
			items={[
				['Added', evidence.date_added],
				['By', evidence.user?.user_name ?? evidence.user?.user_login],
				['ID', `#${evidence.id}`, true],
				['UUID', evidence.file_uuid, true]
			]}
		/>
	</div>
{/if}
