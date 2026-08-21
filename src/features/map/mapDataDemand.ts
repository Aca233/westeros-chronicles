export function needsCharacterNameData(input: {
  selectedCountyId: string | null
  charactersVisible: boolean
}): boolean {
  return input.selectedCountyId !== null && input.charactersVisible
}

export function needsPoliticalData(input: {
  politicalVisible: boolean
  selectedCountyId: string | null
}): boolean {
  return input.politicalVisible || input.selectedCountyId !== null
}
