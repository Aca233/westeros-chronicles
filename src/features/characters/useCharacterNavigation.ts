import { useCallback, useReducer } from 'react';
import type { CharacterId } from './types';

export interface CharacterNavigationState {
  selectedCharacterId: CharacterId | null;
  history: Array<CharacterId | null>;
}

export type CharacterNavigationAction =
  | { type: 'open'; characterId: CharacterId }
  | { type: 'back' }
  | { type: 'player' };

export const initialCharacterNavigationState: CharacterNavigationState = {
  selectedCharacterId: null,
  history: [],
};

export function characterNavigationReducer(
  state: CharacterNavigationState,
  action: CharacterNavigationAction,
): CharacterNavigationState {
  if (action.type === 'player') return initialCharacterNavigationState;
  if (action.type === 'open') {
    if (state.selectedCharacterId === action.characterId) return state;
    return {
      selectedCharacterId: action.characterId,
      history: [...state.history, state.selectedCharacterId],
    };
  }
  if (state.history.length === 0) return state;
  return {
    selectedCharacterId: state.history[state.history.length - 1] ?? null,
    history: state.history.slice(0, -1),
  };
}

export function useCharacterNavigation() {
  const [state, dispatch] = useReducer(characterNavigationReducer, initialCharacterNavigationState);
  const openCharacter = useCallback((characterId: CharacterId) => dispatch({ type: 'open', characterId }), []);
  const goBack = useCallback(() => dispatch({ type: 'back' }), []);
  const returnToPlayer = useCallback(() => dispatch({ type: 'player' }), []);
  return {
    ...state,
    canGoBack: state.history.length > 0,
    openCharacter,
    goBack,
    returnToPlayer,
  };
}
