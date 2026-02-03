<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as Popover from '$lib/components/ui/popover';

	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import { CheckIcon, ChevronDownIcon } from 'lucide-svelte';

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
	let selectedCaseId = $state<string | undefined>(undefined);

	let casesFilter = $state('');
	let popoverOpen = $state(false);

	const selectedCaseLabel = $derived.by(() => {
		if (!selectedCaseId) return 'Select Case';

		const id = Number(selectedCaseId);
		const c = cases.find((x) => x.case_id === id);
		return c ? (c.case_name ?? '').trim() : `#${id}`;
	});

	const filteredCases = $derived.by(() => {
		if (casesFilter === '') return cases;
		return cases.filter((c) =>
			(c.case_name ?? '').toLowerCase().includes(casesFilter.toLowerCase())
		);
	});

	const PER_PAGE = 100;
	const MAX_PAGES = 250;
	const MAX_CASES = 25000;

	const loadAllCases = async () => {
		if (loading) return;

		loading = true;
		error = null;
		cases = [];
		selectedCaseId = undefined;

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

	const chooseCase = (id: number) => {
		selectedCaseId = String(id);
		popoverOpen = false;
	};

	const handleConfirm = () => {
		if (!selectedCaseId) return;
		onConfirm(Number(selectedCaseId));
		onOpenChange(false);
	};

	let didLoadForOpen = false;

	$effect(() => {
		if (!open) {
			didLoadForOpen = false;
			popoverOpen = false;
			casesFilter = '';
			return;
		}

		if (!didLoadForOpen) {
			didLoadForOpen = true;
			void loadAllCases();
		}
	});

	$effect(() => {
		if (popoverOpen) casesFilter = '';
	});
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="sm:max-w-[525px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<div class="grid gap-4 py-4">
			<Popover.Root bind:open={popoverOpen}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline" class="w-full justify-between">
							<span class="truncate">{selectedCaseLabel}</span>
							<ChevronDownIcon size="16" />
						</Button>
					{/snippet}
				</Popover.Trigger>

				<Popover.Content class="w-[calc(525px-3rem)] max-w-[calc(100vw-3rem)] p-2">
					<Input
						type="text"
						placeholder="Search cases..."
						bind:value={casesFilter}
						class="mb-2 w-full"
					/>

					<div class="max-h-72 overflow-auto">
						{#if filteredCases.length === 0}
							<div class="px-2 py-2 text-sm opacity-70">No matches</div>
						{:else}
							{#each filteredCases as c (c.case_id)}
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted"
									onclick={() => chooseCase(c.case_id)}
								>
									<span class="truncate">{c.case_name ?? ''}</span>

									{#if selectedCaseId === String(c.case_id)}
										<CheckIcon size="16" />
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				</Popover.Content>
			</Popover.Root>

			{#if loading}
				<div class="text-sm opacity-80">Loading cases...</div>
			{/if}

			{#if error}
				<div class="text-sm text-red-500">{error}</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
			<Button onclick={handleConfirm} disabled={!selectedCaseId || loading}>Switch</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
