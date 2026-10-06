import { AssetStagesService } from '$lib/services/asset-stages.service';
import type { AssetStage, AssetStageUpdate } from '$lib/services/asset-stages.service';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
import type { Asset } from '$lib/types/resources/asset';

export const STAGE_REASON_MAX = 4000;

export type StageApplyResult = {
	updated: number;
	failed: { assetId: number; message: string }[];
};

/**
 * What the stage form must collect before a move: a reason when the
 * target stage asks for one, a decision when it requires one. Clearing
 * the stage (`null`) never needs either.
 */
export const stageNeedsInput = (stage: AssetStage | null | undefined): boolean =>
	!!stage && (stage.requires_reason || stage.requires_decision);

/**
 * Client-side mirror of the backend validation so the form can explain
 * what is missing before the round-trip. Returns null when valid.
 */
export const validateStageInput = (
	stage: AssetStage | null | undefined,
	reason: string,
	decisionId: string
): string | null => {
	const trimmed = reason.trim();
	if (trimmed.length > STAGE_REASON_MAX) {
		return `Reason must be at most ${STAGE_REASON_MAX} characters`;
	}
	if (stage?.requires_reason && !trimmed) {
		return `"${stage.name}" requires a reason`;
	}
	const decision = decisionId.trim();
	if (decision && !/^[1-9]\d*$/.test(decision)) {
		return 'Decision ID must be a positive number';
	}
	if (stage?.requires_decision && !decision) {
		return `"${stage.name}" requires a decision`;
	}
	return null;
};

export type StageStepState = 'reached' | 'skipped' | 'todo';

/**
 * State of each step of the stage path. Steps up to the current one are
 * reached, except an optional step the asset never entered (per its
 * stage history), which was skipped. Steps after the current one, or all
 * of them when the asset has no path stage, are still to do.
 */
export const stagePathStates = (
	pathStages: Pick<AssetStage, 'id' | 'is_optional'>[],
	currentId: number | null | undefined,
	visitedIds: Iterable<number | null>
): StageStepState[] => {
	const currentIndex = pathStages.findIndex((s) => s.id === currentId);
	const visited = new Set(visitedIds);
	return pathStages.map((stage, i) => {
		if (currentIndex < 0 || i > currentIndex) return 'todo';
		if (i < currentIndex && stage.is_optional && !visited.has(stage.id)) return 'skipped';
		return 'reached';
	});
};

export const buildStageUpdate = (
	stage: AssetStage | null,
	reason: string,
	decisionId: string
): AssetStageUpdate => {
	const body: AssetStageUpdate = { stage_id: stage ? stage.id : null };
	if (stage) {
		const trimmed = reason.trim();
		if (trimmed) body.reason = trimmed;
		const decision = decisionId.trim();
		if (decision) body.decision_id = Number(decision);
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
 * Set the stage of one or more case assets and write the server's
 * answer back into the case-assets store, so every row and the detail
 * view pick up the new stage without a list reload.
 */
export const applyAssetStage = async (
	caseAssets: CaseAssetsContext,
	caseId: number,
	assetIds: number[],
	body: AssetStageUpdate
): Promise<StageApplyResult> => {
	const result: StageApplyResult = { updated: 0, failed: [] };
	await Promise.all(
		assetIds.map(async (assetId) => {
			try {
				const res = await AssetStagesService.setAssetStage<Asset>(caseId, assetId, body);
				if (res.ok && res.data && typeof res.data === 'object') {
					caseAssets.byId[assetId] = res.data;
					result.updated += 1;
				} else {
					result.failed.push({
						assetId,
						message: messageOf(res.data, res.error?.message ?? 'Unable to set stage')
					});
				}
			} catch (e) {
				result.failed.push({ assetId, message: (e as Error).message });
			}
		})
	);
	return result;
};
