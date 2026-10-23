/** UTF-8 JSON application envelopes, including JSON escaping of admitted ASCII IDs. */
export const ASSET_CONTAINER_MAX_BYTES = 262144;
export const ASSET_ORGANIZE_JOURNAL_MAX_BYTES = 524288;
export function assetQueryMaxBytes(query: string): number {
  return query === 'bank.get' ? 262144 : query === 'inventory.get' ? 131072 : 65536;
}
