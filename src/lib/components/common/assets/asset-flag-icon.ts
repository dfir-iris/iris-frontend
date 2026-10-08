import {
	Ban,
	Bug,
	CircleCheck,
	CircleDot,
	Eye,
	Flag,
	HardDrive,
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

// Allow-list of the icons an administrator can pick for a flag. Unknown
// names fall back to a neutral dot rather than resolving arbitrary input.
export const ASSET_FLAG_ICONS = {
	unplug: Unplug,
	'key-round': KeyRound,
	wrench: Wrench,
	'hard-drive': HardDrive,
	eye: Eye,
	'circle-check': CircleCheck,
	'shield-off': ShieldOff,
	'octagon-x': OctagonX,
	shield: Shield,
	'shield-check': ShieldCheck,
	'triangle-alert': TriangleAlert,
	'scan-search': ScanSearch,
	microscope: Microscope,
	'rotate-ccw': RotateCcw,
	'circle-dot': CircleDot,
	bug: Bug,
	ban: Ban,
	flag: Flag,
	hourglass: Hourglass
} as const;

export type AssetFlagIconName = keyof typeof ASSET_FLAG_ICONS;

export function getAssetFlagIcon(name: string | null | undefined) {
	if (name && Object.hasOwn(ASSET_FLAG_ICONS, name)) {
		return ASSET_FLAG_ICONS[name as AssetFlagIconName];
	}
	return CircleDot;
}
