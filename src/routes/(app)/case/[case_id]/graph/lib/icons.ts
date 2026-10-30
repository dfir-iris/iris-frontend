import type { GraphNode, GraphNodeKind, FreeNodeType } from '$lib/types/resources/case-graph';
import { applyAssetImageTheme, lucideIcon } from '$lib/components/common/CytoscapeGraph/icons';
import bellRing from 'lucide-static/icons/bell-ring.svg?raw';
import boxes from 'lucide-static/icons/boxes.svg?raw';
import briefcase from 'lucide-static/icons/briefcase.svg?raw';
import bug from 'lucide-static/icons/bug.svg?raw';
import building2 from 'lucide-static/icons/building-2.svg?raw';
import calendarClock from 'lucide-static/icons/calendar-clock.svg?raw';
import circleDot from 'lucide-static/icons/circle-dot.svg?raw';
import cloud from 'lucide-static/icons/cloud.svg?raw';
import cpu from 'lucide-static/icons/cpu.svg?raw';
import crosshair from 'lucide-static/icons/crosshair.svg?raw';
import database from 'lucide-static/icons/database.svg?raw';
import file from 'lucide-static/icons/file.svg?raw';
import fileLock2 from 'lucide-static/icons/file-lock-2.svg?raw';
import fingerprint from 'lucide-static/icons/fingerprint.svg?raw';
import flag from 'lucide-static/icons/flag.svg?raw';
import ghost from 'lucide-static/icons/ghost.svg?raw';
import globe from 'lucide-static/icons/globe.svg?raw';
import group from 'lucide-static/icons/group.svg?raw';
import hardDrive from 'lucide-static/icons/hard-drive.svg?raw';
import key from 'lucide-static/icons/key.svg?raw';
import keyRound from 'lucide-static/icons/key-round.svg?raw';
import laptop from 'lucide-static/icons/laptop.svg?raw';
import layers from 'lucide-static/icons/layers.svg?raw';
import link from 'lucide-static/icons/link.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import mail from 'lucide-static/icons/mail.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import network from 'lucide-static/icons/network.svg?raw';
import notebookText from 'lucide-static/icons/notebook-text.svg?raw';
import router from 'lucide-static/icons/router.svg?raw';
import server from 'lucide-static/icons/server.svg?raw';
import shield from 'lucide-static/icons/shield.svg?raw';
import shieldAlert from 'lucide-static/icons/shield-alert.svg?raw';
import skull from 'lucide-static/icons/skull.svg?raw';
import smartphone from 'lucide-static/icons/smartphone.svg?raw';
import squareCheckBig from 'lucide-static/icons/square-check-big.svg?raw';
import stickyNote from 'lucide-static/icons/sticky-note.svg?raw';
import terminal from 'lucide-static/icons/terminal.svg?raw';
import user from 'lucide-static/icons/user.svg?raw';
import userRound from 'lucide-static/icons/user-round.svg?raw';
import users from 'lucide-static/icons/users.svg?raw';
import usb from 'lucide-static/icons/usb.svg?raw';
import wifi from 'lucide-static/icons/wifi.svg?raw';

/**
 * Lucide icons a free node may use (`icon` column, §3.2). Bundling every
 * lucide icon for the canvas would cost ~1 MB, so free nodes pick from this
 * curated set; unknown names fall back to the icon of their `node_type`.
 */
export const FREE_NODE_ICONS: Record<string, string> = {
	'bell-ring': bellRing,
	boxes,
	briefcase,
	bug,
	'building-2': building2,
	'circle-dot': circleDot,
	cloud,
	cpu,
	crosshair,
	database,
	file,
	fingerprint,
	flag,
	ghost,
	globe,
	group,
	'hard-drive': hardDrive,
	key,
	'key-round': keyRound,
	laptop,
	layers,
	link,
	lock,
	mail,
	monitor,
	network,
	router,
	server,
	shield,
	'shield-alert': shieldAlert,
	skull,
	smartphone,
	'sticky-note': stickyNote,
	terminal,
	user,
	'user-round': userRound,
	users,
	usb,
	wifi
};

export const FREE_NODE_ICON_NAMES = Object.keys(FREE_NODE_ICONS);

export const FREE_NODE_TYPE_ICON: Record<FreeNodeType, string> = {
	actor: 'skull',
	account: 'user-round',
	infrastructure: 'server',
	malware: 'bug',
	note: 'sticky-note',
	group: 'group',
	other: 'circle-dot'
};

const KIND_ICON: Record<GraphNodeKind, string> = {
	asset: hardDrive,
	ioc: link,
	event: calendarClock,
	evidence: fileLock2,
	task: squareCheckBig,
	note: notebookText,
	alert: bellRing,
	node: circleDot,
	case: briefcase
};

/** Raw SVG of the lucide icon used for a node (not for assets with a type icon). */
export const lucideSvgFor = (node: Pick<GraphNode, 'kind' | 'icon' | 'type'>): string => {
	if (node.kind === 'node') {
		const named = node.icon ? FREE_NODE_ICONS[node.icon] : undefined;
		if (named) return named;
		const byType = FREE_NODE_TYPE_ICON[(node.type ?? 'other') as FreeNodeType];
		return FREE_NODE_ICONS[byType] ?? circleDot;
	}
	return KIND_ICON[node.kind] ?? circleDot;
};

/**
 * Canvas image for a node: the themed asset-type icon when the backend sent
 * one, a coloured lucide data URL otherwise.
 */
export const nodeImage = (
	node: Pick<GraphNode, 'kind' | 'icon' | 'type'>,
	color: string,
	isDark: boolean
): { url: string; scale: number } => {
	if (node.kind === 'asset' && node.icon) {
		return { url: applyAssetImageTheme(node.icon, isDark), scale: 0.72 };
	}
	return { url: lucideIcon(lucideSvgFor(node), color), scale: 0.55 };
};
