<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, ExternalLink, Search } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { CaseService } from '$lib/services/case.service';
	import type { Case } from '$lib/types/resources/case';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let attachments = $state<WarRoomCaseAttachment[]>([]);
	let loading = $state(true);

	let attachOpen = $state(false);
	let attaching = $state(false);
	let caseSearch = $state('');
	let candidates = $state<Case[]>([]);
	let candidatesLoading = $state(false);
	let selectedCaseId = $state<number | null>(null);
	let attachNote = $state('');

	const load = async () => {
		loading = true;
		const res = await WarRoomsService.listCases(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			attachments = res.data;
		}
		loading = false;
	};

	onMount(load);

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	const onSearchCandidates = (value: string) => {
		caseSearch = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			candidatesLoading = true;
			// Reuse the existing cases search endpoint — `quick_search`
			// matches against name, customer, and numeric id, which is
			// exactly what we want here.
			const res = await CaseService.list({
				quick_search: value.trim() || undefined,
				per_page: 25
			});
			candidatesLoading = false;
			if (res.ok && res.data && typeof res.data !== 'string') {
				const payload = res.data as { data: Case[] };
				const attached = new Set(attachments.map((a) => a.case_id));
				candidates = (payload.data ?? []).filter((c) => !attached.has(c.case_id));
			}
		}, 250);
	};

	const openAttach = () => {
		caseSearch = '';
		selectedCaseId = null;
		attachNote = '';
		candidates = [];
		attachOpen = true;
		onSearchCandidates('');
	};

	const submitAttach = async () => {
		if (selectedCaseId == null) return;
		attaching = true;
		const res = await WarRoomsService.attachCase(warRoomId, {
			case_id: selectedCaseId,
			note: attachNote.trim() || null
		});
		attaching = false;
		if (res.ok) {
			toast({ title: 'Case attached' });
			attachOpen = false;
			load();
		} else {
			toast({
				title: 'Could not attach case',
				description:
					typeof res.data === 'string' ? res.data : (res.error?.message ?? undefined),
				variant: 'destructive'
			});
		}
	};

	const detach = async (caseId: number) => {
		if (!confirm('Detach this case from the war room?')) return;
		const res = await WarRoomsService.detachCase(warRoomId, caseId);
		if (res.ok) {
			toast({ title: 'Case detached' });
			attachments = attachments.filter((a) => a.case_id !== caseId);
		} else {
			toast({ title: 'Could not detach', variant: 'destructive' });
		}
	};
</script>

<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Attached cases</h2>
			<p class="text-xs text-muted-foreground">
				Cases pulled into this war room for coordinated triage.
			</p>
		</div>
		<Button onclick={openAttach}>
			<Plus class="mr-1 h-4 w-4" /> Attach case
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if attachments.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<p class="text-sm text-muted-foreground">
				No cases attached yet. Attach a case to start coordinating it from this war room.
			</p>
			<Button variant="outline" onclick={openAttach}>
				<Plus class="mr-1 h-4 w-4" /> Attach case
			</Button>
		</div>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each attachments as a (a.case_id)}
				<li class="flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<a
								href={`/case/${a.case_id}`}
								class="truncate text-sm font-medium hover:underline"
							>
								{a.case_name}
							</a>
							<span class="text-2xs text-muted-foreground">#{a.case_id}</span>
						</div>
						{#if a.note}
							<p class="line-clamp-1 text-xs text-muted-foreground">{a.note}</p>
						{/if}
					</div>
					<a
						href={`/case/${a.case_id}`}
						class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						aria-label="Open case"
					>
						<ExternalLink class="h-4 w-4" />
					</a>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 text-destructive hover:text-destructive"
						onclick={() => detach(a.case_id)}
						aria-label="Detach"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Dialog bind:open={attachOpen}>
	<DialogContent class="sm:max-w-lg">
		<DialogHeader>
			<DialogTitle>Attach a case</DialogTitle>
			<DialogDescription>
				Pull a case into this war room. You'll need full-access on the case to attach it.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-col gap-3 py-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					value={caseSearch}
					oninput={(e) => onSearchCandidates((e.target as HTMLInputElement).value)}
					placeholder="Search by case name or customer"
					class="pl-7"
				/>
			</div>

			<div class="max-h-64 overflow-y-auto rounded-md border">
				{#if candidatesLoading}
					<div class="p-3 text-center text-xs text-muted-foreground">Searching…</div>
				{:else if candidates.length === 0}
					<div class="p-3 text-center text-xs text-muted-foreground">No matching cases.</div>
				{:else}
					<ul>
						{#each candidates as c (c.case_id)}
							{@const selected = selectedCaseId === c.case_id}
							<li>
								<button
									type="button"
									class={[
										'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
										selected ? 'bg-primary/10' : 'hover:bg-muted/50'
									]}
									onclick={() => (selectedCaseId = c.case_id)}
								>
									<span class="flex-1 truncate">{c.case_name}</span>
									<span class="text-2xs text-muted-foreground">#{c.case_id}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<label class="text-xs font-medium text-muted-foreground" for="attach-note">
					Note (optional)
				</label>
				<Input
					id="attach-note"
					value={attachNote}
					oninput={(e) => (attachNote = (e.target as HTMLInputElement).value)}
					placeholder="Why is this case in the war room?"
					class="mt-1"
				/>
			</div>
		</div>

		<DialogFooter>
			<Button variant="ghost" onclick={() => (attachOpen = false)} disabled={attaching}>
				Cancel
			</Button>
			<Button onclick={submitAttach} disabled={attaching || selectedCaseId == null}>
				{attaching ? 'Attaching…' : 'Attach'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
