import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
import { TlpService, type TlpItem } from '$lib/services/tlp.service';
import { TaskStatusService } from '$lib/services/task-status.service';
import { AssetFlagsService, type AssetFlag } from '$lib/services/asset-flags.service';
import type { TaskStatus } from '$lib/types/resources/task';

/**
 * Lookup lists the authoring dialogs need (asset / IOC types, TLPs, task
 * statuses, asset flags). Each list is fetched once, on first use.
 */
export class GraphReferenceData {
	assetTypes = $state.raw<AssetType[]>([]);
	iocTypes = $state.raw<IocType[]>([]);
	tlps = $state.raw<TlpItem[]>([]);
	taskStatuses = $state.raw<TaskStatus[]>([]);
	assetFlags = $state.raw<AssetFlag[]>([]);
	errors = $state<Record<string, string>>({});

	private pending = new Map<string, Promise<void>>();

	private once(name: string, fn: () => Promise<void>) {
		let p = this.pending.get(name);
		if (!p) {
			p = fn().catch((e: unknown) => {
				this.pending.delete(name);
				this.errors[name] = e instanceof Error ? e.message : String(e);
			});
			this.pending.set(name, p);
		}
		return p;
	}

	private static listOf<T>(data: unknown): T[] {
		return Array.isArray(data) ? (data as T[]) : [];
	}

	ensureObjectTypes() {
		return Promise.all([
			this.once('assetTypes', async () => {
				const res = await AssetTypesService.list();
				this.assetTypes = GraphReferenceData.listOf<AssetType>(res.data).sort((a, b) =>
					a.asset_name.localeCompare(b.asset_name)
				);
			}),
			this.once('iocTypes', async () => {
				const res = await IocTypesService.list();
				this.iocTypes = GraphReferenceData.listOf<IocType>(res.data).sort((a, b) =>
					a.type_name.localeCompare(b.type_name)
				);
			}),
			this.once('tlps', async () => {
				const res = await TlpService.list();
				this.tlps = GraphReferenceData.listOf<TlpItem>(res.data);
			})
		]);
	}

	ensureTaskStatuses() {
		return this.once('taskStatuses', async () => {
			const res = await TaskStatusService.list();
			this.taskStatuses = GraphReferenceData.listOf<TaskStatus>(res.data);
		});
	}

	ensureAssetFlags() {
		return this.once('assetFlags', async () => {
			const res = await AssetFlagsService.list();
			this.assetFlags = GraphReferenceData.listOf<AssetFlag>(res.data).sort(
				(a, b) => a.sort_order - b.sort_order
			);
		});
	}

	/** TLP used by default for new IOCs: amber when it exists, else the first one. */
	get defaultTlpId(): number | null {
		const amber = this.tlps.find((t) => t.tlp_name.toLowerCase().includes('amber'));
		return amber?.tlp_id ?? this.tlps[0]?.tlp_id ?? null;
	}
}
