import { AssetFlagsService } from '$lib/services/asset-flags.service';
import type { AssetFlag, AssetFlagChange } from '$lib/services/asset-flags.service';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
import type { Asset } from '$lib/types/resources/asset';

export const FLAG_REASON_MAX = 4000;

export type FlagApplyAction = 'set' | 'clear';

export type FlagApplyResult = {
	updated: number;
	failed: { assetId: number; message: string }[];
};

/**
 * Whether setting the flag needs the form first: a reason when the flag
 * asks for one, a decision when it requires one. Plain flags are set in
 * one click and can be detailed afterwards.
 */
export const flagNeedsInput = (flag: AssetFlag | null | undefined): boolean =>
	!!flag && (flag.requires_reason || flag.requires_decision);

/**
 * Client-side mirror of the backend validation so the form can explain
 * what is missing before the round-trip. Removing a flag never takes a
 * decision and never requires a reason. Returns null when valid.
 */
export const validateFlagInput = (
	flag: AssetFlag | null | undefined,
	reason: string,
	decisionId: string,
	date: string,
	action: FlagApplyAction = 'set'
): string | null => {
	const trimmed = reason.trim();
	if (trimmed.length > FLAG_REASON_MAX) {
		return `Reason must be at most ${FLAG_REASON_MAX} characters`;
	}
	if (date.trim() && Number.isNaN(new Date(date).getTime())) {
		return 'Date is not valid';
	}
	if (action === 'clear') return null;
	if (flag?.requires_reason && !trimmed) {
		return `"${flag.name}" requires a reason`;
	}
	const decision = decisionId.trim();
	if (decision && !/^[1-9]\d*$/.test(decision)) {
		return 'Decision ID must be a positive number';
	}
	if (flag?.requires_decision && !decision) {
		return `"${flag.name}" requires a decision`;
	}
	return null;
};

/**
 * Request body for a flag change. Empty fields are left out; the date
 * (a `datetime-local` value, read as local time) is sent as UTC ISO, and
 * the server dates the timeline event "now" without it.
 */
export const buildFlagChange = (
	reason: string,
	decisionId: string,
	date: string,
	action: FlagApplyAction = 'set'
): AssetFlagChange => {
	const body: AssetFlagChange = {};
	const trimmed = reason.trim();
	if (trimmed) body.reason = trimmed;
	const decision = decisionId.trim();
	if (decision && action === 'set') body.decision_id = Number(decision);
	if (date.trim()) {
		const parsed = new Date(date);
		if (!Number.isNaN(parsed.getTime())) body.date = parsed.toISOString();
	}
	return body;
};

const messageOf = (data: unknown, fallback: string): string => {
	if (data && typeof data === 'object' && 'message' in data) {
		const msg = (data as { message?: unknown }).message;
		if (typeof msg === 'string' && msg) return msg;
	}
	return fallback;
};

/**
 * Set or remove one flag on one or more case assets and write the
 * server's answer back into the case-assets store, so every row and the
 * detail view pick up the change without a list reload.
 */
export const applyAssetFlag = async (
	caseAssets: CaseAssetsContext,
	caseId: number,
	assetIds: number[],
	flagId: number,
	action: FlagApplyAction,
	body: AssetFlagChange = {}
): Promise<FlagApplyResult> => {
	const result: FlagApplyResult = { updated: 0, failed: [] };
	// Removing a flag takes no decision.
	const { decision_id: _decision, ...clearBody } = body;
	await Promise.all(
		assetIds.map(async (assetId) => {
			try {
				const res =
					action === 'set'
						? await AssetFlagsService.setAssetFlag<Asset>(caseId, assetId, flagId, body)
						: await AssetFlagsService.clearAssetFlag<Asset>(caseId, assetId, flagId, clearBody);
				if (res.ok && res.data && typeof res.data === 'object') {
					caseAssets.byId[assetId] = res.data;
					result.updated += 1;
				} else if (res.ok && action === 'clear') {
					// ApiService drops DELETE response bodies, so the updated
					// asset never comes back: drop the flag from the local copy.
					const current = caseAssets.byId[assetId];
					if (current) {
						caseAssets.byId[assetId] = {
							...current,
							flags: (current.flags ?? []).filter((entry) => entry.flag_id !== flagId)
						};
					}
					result.updated += 1;
				} else {
					result.failed.push({
						assetId,
						message: messageOf(res.data, res.error?.message ?? 'Unable to change the flag')
					});
				}
			} catch (e) {
				result.failed.push({ assetId, message: (e as Error).message });
			}
		})
	);
	return result;
};
