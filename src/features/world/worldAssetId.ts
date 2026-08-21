export const worldAssetId = {
  item: (instanceId: string): string => `item:${instanceId}`,
  site: (siteId: string): string => `site:${siteId}`,
  vehicle: (vehicleId: string): string => `vehicle:${vehicleId}`,
  worldItem: (instanceId: string): string => `world-item:${instanceId}`,
} as const;
