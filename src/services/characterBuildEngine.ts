import { CHARACTER_BUILDS, type CharacterBuildId } from '../domain/characterBuild';

export interface CharacterBuildContext {
  build: CharacterBuildId;
  actionDomain: string;
}

/**
 * 构筑只提供情境倾向，不直接修改六维属性。
 * 检定系统可以在生成行动时读取这里的额外上下文。
 */
export function getCharacterBuildContext(context: CharacterBuildContext) {
  const profile = CHARACTER_BUILDS[context.build];

  return {
    profile,
    matchesPreferredDomain: profile.preferredDomains.includes(context.actionDomain),
    tags: profile.actionTags,
  };
}
