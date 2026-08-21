const DARK_LANDMARK_TEXTURE_FILL: Readonly<Record<string, number>> = {
  harrenhal: 0.12,
  pyke: 0.09,
  dragonstone: 0.05,
  'storms-end': 0.04,
  winterfell: 0.025,
}

const HARRENHAL_DARK_MATERIAL = /(?:building_special_HH_|building_special_Harrenhal_wall)/i

export function landmarkTextureFill(landmarkId: string | undefined, materialName: string): number {
  if (!landmarkId) return 0
  if (landmarkId === 'harrenhal' && !HARRENHAL_DARK_MATERIAL.test(materialName)) return 0
  return DARK_LANDMARK_TEXTURE_FILL[landmarkId] ?? 0
}
