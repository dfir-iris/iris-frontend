<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import DialogContent from '$lib/components/ui/dialog/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog/dialog-header.svelte';
	import DialogTitle from '$lib/components/ui/dialog/dialog-title.svelte';
	import DialogFooter from '$lib/components/ui/dialog/dialog-footer.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	type SwitchContextModalProps = {
		open: boolean;
		title?: string;
		onConfirm: (caseId: number) => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open,
		title = 'Switch Context',
		onConfirm,
		onOpenChange
	}: SwitchContextModalProps = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);

	let cases = $state<Case[]>([]);
	let selectedCaseId = $state<string>('');

	const options = $derived.by<SelectOption[]>(() =>
		cases.map((c) => ({
			value: String(c.case_id),
			label: (c.case_name ?? '').trim() !== '' ? (c.case_name ?? '').trim() : `#${c.case_id}`
		}))
	);

	const PER_PAGE = 100;
	const MAX_PAGES = 250;
	const MAX_CASES = 25000;

	const loadAllCases = async () => {
		if (loading) return;

		loading = true;
		error = null;
		cases = [];
		selectedCaseId = '';

		try {
			const seen = new Set<number>();

			for (let page = 1; page <= MAX_PAGES; page++) {
				const res = await CaseService.list({ page, per_page: PER_PAGE });

				if (!res.ok || !res.data) throw new Error(res.error?.message ?? 'Failed to load cases');

				const { data, next_page } = res.data as Paginated<Case>;

				for (const c of data ?? []) {
					if (!seen.has(c.case_id)) {
						seen.add(c.case_id);
						cases.push(c);
					}
				}

				if (cases.length > MAX_CASES) throw new Error(`Too many cases (>${MAX_CASES})`);
				if (!next_page) break;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	};

	const handleConfirm = () => {
		if (selectedCaseId === '') return;
		onConfirm(Number(selectedCaseId));
		onOpenChange(false);
	};

	let didLoadForOpen = false;

	$effect(() => {
		if (!open) {
			didLoadForOpen = false;
			return;
		}

		if (!didLoadForOpen) {
			didLoadForOpen = true;
			void loadAllCases();
		}
	});
</script>

<DialogPrimitive.Root bind:open {onOpenChange}>
	<DialogContent class="sm:max-w-[525px]">
		<DialogHeader>
			<DialogTitle>{title}</DialogTitle>
		</DialogHeader>

		<div class="grid gap-4 py-4">
			<SearchSelect
				value={selectedCaseId}
				{options}
				placeholder="Select Case"
				searchPlaceholder="Search cases..."
				disabled={loading}
				onChange={(v) => (selectedCaseId = v)}
			/>

			{#if loading}
				<div class="text-sm opacity-80">Loading cases...</div>
			{/if}

			{#if error}
				<div class="text-sm text-red-500">{error}</div>
			{/if}
		</div>

		<DialogFooter>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
			<Button onclick={handleConfirm} disabled={selectedCaseId === '' || loading}>Switch</Button>
		</DialogFooter>
	</DialogContent>
</DialogPrimitive.Root>
