<!--
  Inline reference card rendered alongside system-kind rows in the
  Stream. When a row carries (ref_type, ref_id) — e.g. a sitrep_published
  row referencing the SitRep that was just drafted — this turns the
  pointer into a clickable chip the operator can use to jump straight
  to the referenced object instead of hunting it down in the right tab.
-->
<script lang="ts">
	import {
		ClipboardListIcon,
		ExternalLink,
		FileTextIcon,
		FileSearchIcon,
		FilesIcon,
		ShieldAlertIcon,
		WaypointsIcon
	} from 'lucide-svelte';

	type Props = {
		warRoomId: number;
		refType: string | null;
		refId: number | null;
		refCaseId: number | null;
	};
	let { warRoomId, refType, refId, refCaseId }: Props = $props();

	type Resolved = {
		href: string;
		label: string;
		Icon: typeof FileTextIcon;
		cls: string;
	};

	const resolved = $derived.by<Resolved | null>(() => {
		if (refType === 'sitrep' && refId != null) {
			return {
				href: `/war-rooms/${warRoomId}/sitreps#${refId}`,
				label: `SitRep #${refId}`,
				Icon: FilesIcon,
				cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200'
			};
		}
		if (refType === 'war_room_task' && refId != null) {
			return {
				href: `/war-rooms/${warRoomId}/tasks#${refId}`,
				label: `Task #${refId}`,
				Icon: ClipboardListIcon,
				cls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-200'
			};
		}
		if (refType === 'war_room_note' && refId != null) {
			return {
				href: `/war-rooms/${warRoomId}/notes#${refId}`,
				label: `Note #${refId}`,
				Icon: FileTextIcon,
				cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200'
			};
		}
		if (refType === 'case' && (refId != null || refCaseId != null)) {
			const id = refId ?? refCaseId;
			return {
				href: `/case/${id}`,
				label: `Case #${id}`,
				Icon: WaypointsIcon,
				cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
			};
		}
		// `user_activity` is the live-merged case-activity firehose — its
		// ref points at a UserActivity row, but the meaningful jump is to
		// the case itself. Use ref_case_id as the link target.
		if (refType === 'user_activity' && refCaseId != null) {
			return {
				href: `/case/${refCaseId}`,
				label: `Case #${refCaseId}`,
				Icon: WaypointsIcon,
				cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
			};
		}
		// `war_room` refs (state, priority) point at the room itself —
		// rendered as a non-clickable chip so the operator sees the type
		// without offering a useless link to the page they're already on.
		if (refType === 'war_room') {
			return {
				href: '',
				label: 'War room',
				Icon: ShieldAlertIcon,
				cls: 'border-border bg-muted/60 text-muted-foreground'
			};
		}
		if (refType === 'war_room_chat') {
			// `/note`, `/pin`, `/decision` rows all point at the chat
			// itself — also a non-link chip to avoid a self-link.
			return {
				href: '',
				label: refType === 'war_room_chat' ? 'Stream' : refType,
				Icon: FileSearchIcon,
				cls: 'border-border bg-muted/60 text-muted-foreground'
			};
		}
		return null;
	});
</script>

{#if resolved}
	{#if resolved.href}
		<a
			href={resolved.href}
			class={[
				'shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium transition-colors hover:brightness-110',
				resolved.cls
			]}
		>
			<resolved.Icon class="h-3 w-3 shrink-0" />
			<span>{resolved.label}</span>
			<ExternalLink class="h-2.5 w-2.5 shrink-0 opacity-60" />
		</a>
	{:else}
		<span
			class={[
				'shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium',
				resolved.cls
			]}
		>
			<resolved.Icon class="h-3 w-3 shrink-0" />
			<span>{resolved.label}</span>
		</span>
	{/if}
{/if}
