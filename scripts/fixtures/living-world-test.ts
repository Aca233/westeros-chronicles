import { createDefaultBody, type LordProfile } from '../../src/types/game';
import { createNedItemState, ordinaryCatalogReady } from './living-world-items';

export { ordinaryCatalogReady };

export function createLivingWorldTestLord(): LordProfile {
  return {
    canonicalCharacterId: 'agot:Stark_3',
    name: '艾德·史塔克',
    house: '史塔克家族',
    dynastyName: '史塔克家族',
    houseWords: '凛冬将至',
    houseSigil: 'house-stark',
    title: '临冬城公爵 · 北境守护',
    age: 35,
    gender: '男',
    culture: 'northman',
    faith: 'old_gods_wnw',
    location: { locationId: 'b_winterfell', sceneLocation: '神木林' },
    locationLabel: '临冬城 · 神木林',
    body: createDefaultBody(),
    overallStatus: '强健',
    items: createNedItemState(),
    goldDragons: 450,
    silverStags: 80,
    baseAttributes: { diplomacy: 12, martial: 17, stewardship: 13, intrigue: 7, learning: 11, prowess: 18 },
    attributes: { diplomacy: 15, martial: 26, stewardship: 15, intrigue: 4, learning: 12, prowess: 21 },
    traits: ['诚实', '公正', '勇敢', '优秀战术家', '威严'],
    traitIds: ['honest', 'just', 'brave', 'education_martial_3', 'authoritative'],
  };
}
