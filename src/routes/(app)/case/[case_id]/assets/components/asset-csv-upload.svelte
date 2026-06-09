<script lang="ts">
	type Props = {
		sampleCsv: string;
		onCsvChange: (csvText: string) => void;
	};

	let { sampleCsv, onCsvChange }: Props = $props();

	let csvFile = $state<File | null>(null);
	let csvText = $state('');

	const readCsvFile = async (file: File) => {
		csvFile = file;
		csvText = await file.text();

		onCsvChange(csvText);
	};
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<div class="text-sm font-medium">Expected CSV file format</div>

		<textarea
			class="h-16 w-full resize-none rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
			readonly
			value={'asset_name,asset_type_name,asset_description,asset_ip,asset_domain,asset_tags (separated with "|")'}
		></textarea>
	</div>

	<div class="space-y-2">
		<div class="text-sm font-medium">CSV file format example</div>

		<textarea
			class="h-28 w-full resize-none rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
			readonly
			value={sampleCsv}
		></textarea>
	</div>

	<div class="space-y-2">
		<div class="text-sm font-medium">Choose CSV file to import</div>

		<input
			type="file"
			accept="text/csv,.csv"
			class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
			onchange={(event) => {
				const file = (event.target as HTMLInputElement).files?.[0];

				if (file) {
					readCsvFile(file);
				}
			}}
		/>

		{#if csvFile}
			<p class="text-xs text-muted-foreground">
				Loaded {csvFile.name} ({csvText.length} bytes)
			</p>
		{/if}
	</div>
</div>
