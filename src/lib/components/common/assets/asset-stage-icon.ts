import {
	Ban,
	Bug,
	CircleCheck,
	CircleDot,
	Eye,
	Flag,
	Hourglass,
	KeyRound,
	Microscope,
	OctagonX,
	RotateCcw,
	ScanSearch,
	Shield,
	ShieldCheck,
	ShieldOff,
	TriangleAlert,
	Unplug,
	Wrench
} from 'lucide-svelte';

// Allow-list of the icons an administrator can pick for a stage. Unknown
// names fall back to a neutral dot rather than resolving arbitrary input.
export const ASSET_STAGE_ICONS = {
	'scan-search': ScanSearch,
	unplug: Unplug,
	microscope: Microscope,
	wrench: Wrench,
	'circle-check': CircleCheck,
	'shield-off': ShieldOff,
	'octagon-x': OctagonX,
	'circle-dot': CircleDot,
	shield: Shield,
	'shield-check': ShieldCheck,
	'key-round': KeyRound,
	'rotate-ccw': RotateCcw,
	eye: Eye,
	bug: Bug,
	ban: Ban,
	flag: Flag,
	hourglass: Hourglass,
	'triangle-alert': TriangleAlert
} as const;

export type AssetStageIconName = keyof typeof ASSET_STAGE_ICONS;

export function getAssetStageIcon(name: string | null | undefined) {
	if (name && Object.hasOwn(ASSET_STAGE_ICONS, name)) {
		return ASSET_STAGE_ICONS[name as AssetStageIconName];
	}
	return CircleDot;
}
