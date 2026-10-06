<script lang="ts">
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import { Check, CircleAlert, Lock, Send, TriangleAlert } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { toast } from '$lib/components/ui/toast';
	import { WarRoomsService, type WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import {
		WarRoomSitRepsService,
		type WarRoomSitRep,
		type WarRoomSitRepPublishBody,
		type WarRoomSitRepPublished,
		type WarRoomSitRepShareResult,
		isSitRepShareSuccess
	} from '$lib/services/war-room-sitreps.service';

	type ShareMode = 'none' | 'all' | 'select';

	type Props = {
		open: boolean;
		warRoomId: number;
		sitrep: WarRoomSitRep | null;
		onPublished?: (sitrep: WarRoomSitRepPublished) => void;
	};

	let { open = $bindable(false), warRoomId, sitrep, onPublished }: Props = $props();

	let mode = $state<ShareMode>('none');
	let cases = $state<WarRoomCaseAttachment[]>([]);
	let loadingCases = $state(false);
	let selected = $state<Set<number>>(new Set());
	let publishing = $state(false);
	let shared = $state<WarRoomSitRepShareResult[] | null>(null);

	const loadCases = async () => {
		loadingCases = true;
		const res = await WarRoomsService.listCases(warRoomId);
		loadingCases = false;
		cases = res.ok && Array.isArray(res.data) ? res.data : [];
	};

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			mode = 'none';
			selected = new Set();
			shared = null;
			void loadCases();
		}
		wasOpen = open;
	});

	const toggle = (caseId: number, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(caseId);
		else next.delete(caseId);
		selected = next;
	};

	const targetCases = $derived(
		mode === 'all' ? cases : mode === 'select' ? cases.filter((c) => selected.has(c.case_id)) : []
	);

	// The SitRep body names every case/customer of the room — copying it
	// into cases of different customers shows each the others' names.
	const customers = $derived([
		...new Set(targetCases.map((c) => c.customer_name).filter((n): n is string => !!n))
	]);

	const canSubmit = $derived(!publishing && !!sitrep && (mode !== 'select' || selected.size > 0));

	const caseName = (caseId: number) =>
		cases.find((c) => c.case_id === caseId)?.case_name ?? `Case #${caseId}`;

	const submit = async () => {
		if (!sitrep || !canSubmit) return;
		const body: WarRoomSitRepPublishBody = {};
		if (mode === 'all') body.share_to_case_ids = 'all';
		else if (mode === 'select') body.share_to_case_ids = [...selected];
		publishing = true;
		const res = await WarRoomSitRepsService.publish(warRoomId, sitrep.sitrep_id, body);
		publishing = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const published = res.data as WarRoomSitRepPublished;
			onPublished?.(published);
			const results = Array.isArray(published.shared) ? published.shared : [];
			const copied = results.filter(isSitRepShareSuccess).length;
			toast({
				title: `SitRep v${published.version} published`,
				description: mode === 'none' ? undefined : `Copied to ${copied} of ${results.length} cases.`
			});
			if (mode === 'none') {
				open = false;
			} else {
				shared = results;
			}
		} else {
			toast({ title: apiErrorMessage(res, 'Could not publish'), variant: 'destructive' });
		}
	};

	const STATUS_LABEL: Record<string, string> = {
		copied: 'Copied',
		created: 'Copied',
		denied: 'No access',
		error: 'Error'
	};
</script>

<Dialog bind:open>
	<DialogContent class="max-w-xl">
		<DialogHeader>
			<DialogTitle>Publish “{sitrep?.title ?? 'SitRep'}”</DialogTitle>
			<DialogDescription>
				Posts it to the war-room stream. It stays editable — publishing just marks the state.
			</DialogDescription>
		</DialogHeader>

		{#if shared}
			<div class="py-2">
				<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
					Shared to cases
				</p>
				{#if shared.length === 0}
					<p class="text-sm text-muted-foreground">No case received a copy.</p>
				{:else}
					<ul class="flex max-h-[45vh] flex-col gap-1 overflow-y-auto" aria-label="Share results">
						{#each shared as r (r.case_id)}
							<li class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
								{#if isSitRepShareSuccess(r)}
									<Check class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
								{:else if r.status === 'denied'}
									<Lock class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								{:else}
									<CircleAlert class="h-3.5 w-3.5 shrink-0 text-destructive" />
								{/if}
								<span class="font-mono text-xs text-muted-foreground">#{r.case_id}</span>
								<span class="min-w-0 flex-1 truncate">{caseName(r.case_id)}</span>
								{#if r.message}
									<span class="max-w-[40%] truncate text-2xs text-muted-foreground">
										{r.message}
									</span>
								{/if}
								<span
									class="shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium {isSitRepShareSuccess(
										r
									)
										? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
										: 'border-destructive/40 bg-destructive/10 text-destructive'}"
								>
									{STATUS_LABEL[r.status] ?? r.status}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<DialogFooter>
				<Button onclick={() => (open = false)}>Close</Button>
			</DialogFooter>
		{:else}
			<div class="flex flex-col gap-3 py-2">
				<div class="flex flex-col gap-2">
					<Label class="text-xs font-medium text-muted-foreground">Also share to cases</Label>
					<RadioGroup.Root bind:value={mode} class="flex flex-col gap-2">
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="none" id="sitrep-share-none" />
							<Label for="sitrep-share-none">Don't share</Label>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="all" id="sitrep-share-all" />
							<Label for="sitrep-share-all">
								All attached cases {loadingCases ? '' : `(${cases.length})`}
							</Label>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="select" id="sitrep-share-select" />
							<Label for="sitrep-share-select">Selected cases</Label>
						</div>
					</RadioGroup.Root>
					{#if mode !== 'none'}
						<p class="text-xs text-muted-foreground">
							Each case gets a plain note copy of this SitRep under “War room · …”. You need full
							access to a case to share into it.
						</p>
					{/if}
				</div>

				{#if mode === 'select'}
					{#if loadingCases}
						<div class="flex flex-col gap-1">
							{#each Array(3) as _}
								<Skeleton class="h-8 w-full" />
							{/each}
						</div>
					{:else if cases.length === 0}
						<p class="text-sm text-muted-foreground">No cases are attached to this war room.</p>
					{:else}
						<ul
							class="flex max-h-[35vh] flex-col gap-0.5 overflow-y-auto rounded-md border p-1"
							aria-label="Cases to share to"
						>
							{#each cases as c (c.case_id)}
								{@const id = `sitrep-share-case-${c.case_id}`}
								<li class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
									<Checkbox
										{id}
										checked={selected.has(c.case_id)}
										onCheckedChange={(v) => toggle(c.case_id, v === true)}
									/>
									<label for={id} class="flex min-w-0 flex-1 items-center gap-2 text-sm">
										<span class="font-mono text-xs text-muted-foreground">#{c.case_id}</span>
										<span class="truncate">{c.case_name}</span>
										{#if c.customer_name}
											<span class="truncate text-xs text-muted-foreground">
												· {c.customer_name}
											</span>
										{/if}
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}

				{#if customers.length > 1}
					<div
						class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
						role="alert"
					>
						<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							These cases belong to {customers.length} customers ({customers.join(', ')}). Each copy
							carries the full SitRep, so every case will see the others' content.
						</span>
					</div>
				{/if}
			</div>
			<DialogFooter>
				<Button variant="ghost" onclick={() => (open = false)} disabled={publishing}>Cancel</Button>
				<Button onclick={submit} disabled={!canSubmit}>
					<Send class="mr-1 h-3.5 w-3.5" />
					{publishing ? 'Publishing…' : 'Publish'}
				</Button>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
