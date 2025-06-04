import type { Ioc } from '$lib/types/resources/ioc';

export function deduplicateIocs(iocList: Ioc[]): Ioc[] {
  const seen = new Set<string>();
  return iocList.filter(ioc => {
    // Ensure asset_id is treated as a string for the Set
    const id = String(ioc.ioc_id);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
