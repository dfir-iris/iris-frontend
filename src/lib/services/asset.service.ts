import { ApiService } from '$lib/services/api.service';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Asset } from '$lib/types/resources/asset';

export class AssetService {
  static async updateAsset(caseId: string | number, assetId: string | number, assetData: Partial<Asset>) {
    return ApiService.put(ENDPOINTS.case.assets.update(caseId, assetId), assetData);
  }
}