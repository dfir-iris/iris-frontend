<!--
  Banners admin page. Server administrators publish maintenance /
  outage / informational banners here; they render at the top of the
  app for every authenticated user via the `/manage/banners/active`
  endpoint polled from the (app) layout.

  Simple single-pane list — banners are typically a handful of rows,
  so no pagination or master/detail split. Add / edit / delete via a
  shared modal.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertTriangleIcon,
		InfoIcon,
		MegaphoneIcon,
		PencilIcon,
		PlusIcon,
		RefreshCwIcon,
		Trash2Icon,
		XCircleIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Select } from '$lib/components/ui/select';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		BannersService,
		type Banner,
		type BannerBody,
		type BannerPurpose
	} from '$lib/services/banners.service';

	const PURPOSE_OPTIONS: { value: BannerPurpose; label: string }[] = [
		{ value: 'info', label: 'Info' },
		{ value: 'warning', label: 'Warning' },
		{ value: 'error', label: 'Error' }
	];

	const PURPOSE_META: Record<BannerPurpose, { icon: typeof InfoIcon; tone: string }> = {
		info: { icon: InfoIcon, tone: 'text-blue-600 dark:text-blue-300' },
		warning: { icon: AlertTriangleIcon, tone: 'text-yellow-600 dark:text-yellow-300' },
		error: { icon: XCircleIcon, tone: 'text-red-600 dark:text-red-300' }
	};

	let banners = $state<Banner[]>([]);
	let loading = $state(false);

	let modalOpen = $state(false);
	let editing = $state<Banner | null>(null);
	// Local form values. `datetime-local` inputs speak local-tz strings;
	// we convert to ISO on submit and back on edit.
	let form = $state({
		text: '',
		purpose: 'info' as BannerPurpose,
		dismissable: true,
		startLocal: '',
		endLocal: ''
	});
	let submitting = $state(false);

	let confirmOpen = $state(false);
	let pendingDelete = $state<Banner | null>(null);

	async function refresh() {
		loading = true;
		try {
			const res = await BannersService.list();
			if (res.ok && Array.isArray(res.data)) {
				banners = res.data as Banner[];
			} else {
				toast({
					title: 'Failed to load banners',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			loading = false;
		}
	}

	onMount(() => refresh());

	// ISO → `datetime-local` value. `datetime-local` wants YYYY-MM-DDTHH:mm
	// in local time, no timezone suffix. Slicing the toISOString would be
	// UTC, which is misleading — use the browser's local offset instead.
	function isoToLocalInput(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
			`T${pad(d.getHours())}:${pad(d.getMinutes())}`
		);
	}

	function localInputToIso(v: string): string | null {
		if (!v) return null;
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return null;
		return d.toISOString();
	}

	function openAdd() {
		editing = null;
		form = { text: '', purpose: 'info', dismissable: true, startLocal: '', endLocal: '' };
		modalOpen = true;
	}

	function openEdit(b: Banner) {
		editing = b;
		form = {
			text: b.text,
			purpose: b.purpose,
			dismissable: b.dismissable,
			startLocal: isoToLocalInput(b.start_at),
			endLocal: isoToLocalInput(b.end_at)
		};
		modalOpen = true;
	}

	async function submitForm(e: Event) {
		e.preventDefault();
		if (!form.text.trim()) {
			toast({ title: 'Text is required', variant: 'destructive' });
			return;
		}

		const start = localInputToIso(form.startLocal);
		const end = localInputToIso(form.endLocal);
		if (start && end && new Date(end) <= new Date(start)) {
			toast({ title: 'End date must be after start date', variant: 'destructive' });
			return;
		}

		const body: BannerBody = {
			text: form.text.trim(),
			purpose: form.purpose,
			dismissable: form.dismissable,
			start_at: start,
			end_at: end
		};

		submitting = true;
		try {
			const res = editing
				? await BannersService.update(editing.id, body)
				: await BannersService.create(body);
			if (res.ok) {
				toast({
					title: editing ? 'Banner updated' : 'Banner created',
					variant: 'success'
				});
				modalOpen = false;
				await refresh();
			} else {
				toast({
					title: editing ? 'Failed to update banner' : 'Failed to create banner',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			submitting = false;
		}
	}

	function requestDelete(b: Banner) {
		pendingDelete = b;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const res = await BannersService.remove(pendingDelete.id);
		if (res.ok) {
			toast({ title: 'Banner deleted', variant: 'success' });
			await refresh();
		} else {
			toast({
				title: 'Failed to delete banner',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
		pendingDelete = null;
	}

	function formatTimespan(b: Banner): string {
		const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
		if (!b.start_at && !b.end_at) return 'Always active';
		return `${fmt(b.start_at)} → ${fmt(b.end_at)}`;
	}

	function truncate(s: string, n: number): string {
		return s.length > n ? `${s.slice(0, n)}…` : s;
	}
</script>

<svelte:head>
	<title>Banners</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<MegaphoneIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Banners</h1>
				<p class="text-2xs text-muted-foreground">
					Publish top-of-app messages to every authenticated user (maintenance notices, outages,
					announcements).
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button variant="outline" size="sm" class="h-7" onclick={refresh} disabled={loading}>
				<RefreshCwIcon size={12} class={`mr-1 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</Button>
			<Button size="sm" class="h-7" onclick={openAdd}>
				<PlusIcon size={12} class="mr-1" />
				Add banner
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-auto p-4">
		{#if banners.length === 0 && !loading}
			<div
				class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
			>
				<MegaphoneIcon size={32} class="opacity-40" />
				<p class="text-sm">No banners yet.</p>
				<p class="text-xs">Create one to alert users about maintenance windows or announcements.</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-md border">
				<table class="w-full text-xs">
					<thead
						class="bg-muted/40 text-left text-2xs uppercase tracking-wide text-muted-foreground"
					>
						<tr>
							<th class="w-8 px-3 py-2"></th>
							<th class="px-3 py-2">Text</th>
							<th class="w-24 px-3 py-2">Purpose</th>
							<th class="w-72 px-3 py-2">Timespan</th>
							<th class="w-24 px-3 py-2">Dismissable</th>
							<th class="w-24 px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each banners as banner (banner.id)}
							{@const meta = PURPOSE_META[banner.purpose]}
							<tr class="border-t hover:bg-muted/20">
								<td class="px-3 py-2">
									<meta.icon size={14} class={meta.tone} />
								</td>
								<td class="px-3 py-2">{truncate(banner.text, 100)}</td>
								<td class="px-3 py-2 capitalize">{banner.purpose}</td>
								<td class="px-3 py-2 text-muted-foreground">{formatTimespan(banner)}</td>
								<td class="px-3 py-2">{banner.dismissable ? 'Yes' : 'No'}</td>
								<td class="px-3 py-2">
									<div class="flex items-center justify-end gap-1">
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6"
											aria-label="Edit banner"
											onclick={() => openEdit(banner)}
										>
											<PencilIcon size={12} />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-6 w-6 text-destructive hover:text-destructive"
											aria-label="Delete banner"
											onclick={() => requestDelete(banner)}
										>
											<Trash2Icon size={12} />
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<Dialog.Root bind:open={modalOpen}>
	<Dialog.Content class="sm:max-w-[560px]">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit banner' : 'New banner'}</Dialog.Title>
			<Dialog.Description>
				{editing
					? 'Update the message, schedule or appearance of this banner.'
					: 'Publish a new top-of-app message. Leave the start / end blank to make the banner active immediately and indefinitely.'}
			</Dialog.Description>
		</Dialog.Header>

		<form class="flex flex-col gap-3 py-2" onsubmit={submitForm}>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium" for="banner-text">Text</label>
				<Textarea
					id="banner-text"
					rows={3}
					maxlength={2000}
					bind:value={form.text}
					placeholder="Planned maintenance on Saturday 20:00 UTC — service may be briefly unavailable."
				/>
			</div>

			<div class="flex flex-col gap-1">
				<span class="text-xs font-medium">Purpose</span>
				<Select
					type="single"
					value={form.purpose}
					onValueChange={(v: string) => (form.purpose = v as BannerPurpose)}
				>
					<SelectTrigger class="h-8 text-xs">
						{PURPOSE_OPTIONS.find((o) => o.value === form.purpose)?.label ?? 'Info'}
					</SelectTrigger>
					<SelectContent>
						{#each PURPOSE_OPTIONS as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label class="text-xs font-medium" for="banner-start">Start (optional)</label>
					<Input id="banner-start" type="datetime-local" class="h-8" bind:value={form.startLocal} />
				</div>
				<div class="flex flex-col gap-1">
					<label class="text-xs font-medium" for="banner-end">End (optional)</label>
					<Input id="banner-end" type="datetime-local" class="h-8" bind:value={form.endLocal} />
				</div>
			</div>

			<label class="flex cursor-pointer items-center gap-2">
				<Switch
					checked={form.dismissable}
					onCheckedChange={(v: boolean) => (form.dismissable = v)}
				/>
				<span class="text-xs">Users can dismiss this banner</span>
			</label>

			<Dialog.Footer class="mt-2 flex gap-2">
				<Button
					type="button"
					variant="outline"
					onclick={() => (modalOpen = false)}
					disabled={submitting}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={submitting}>
					{editing ? 'Save' : 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmationDialog
	bind:open={confirmOpen}
	title="Delete banner?"
	message={pendingDelete
		? `The banner "${truncate(pendingDelete.text, 60)}" will be permanently deleted.`
		: ''}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={confirmDelete}
/>
