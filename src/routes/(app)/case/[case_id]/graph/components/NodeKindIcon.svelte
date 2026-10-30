<script lang="ts">
	import {
		BellRingIcon,
		BriefcaseIcon,
		CalendarClockIcon,
		CircleDotIcon,
		FileLock2Icon,
		FingerprintIcon,
		HardDriveIcon,
		LinkIcon,
		NotebookTextIcon,
		SquareCheckBigIcon
	} from 'lucide-svelte';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph/palette';
	import { mode } from 'mode-watcher';
	import { KIND_COLOR } from '../lib/model';

	interface Props {
		kind: string;
		color?: string | null;
		class?: string;
	}

	let { kind, color = null, class: className = 'h-4 w-4' }: Props = $props();

	const ICONS = {
		asset: HardDriveIcon,
		ioc: LinkIcon,
		event: CalendarClockIcon,
		evidence: FileLock2Icon,
		task: SquareCheckBigIcon,
		note: NotebookTextIcon,
		alert: BellRingIcon,
		case: BriefcaseIcon,
		node: CircleDotIcon,
		fanout: FingerprintIcon
	} as const;

	const Icon = $derived(ICONS[kind as keyof typeof ICONS] ?? CircleDotIcon);
	const hex = $derived(
		paletteHex(
			color ?? KIND_COLOR[kind as keyof typeof KIND_COLOR] ?? KIND_COLOR.ioc,
			$mode === 'dark'
		)
	);
</script>

<Icon class="shrink-0 {className}" style="color: {hex}" aria-hidden="true" />
