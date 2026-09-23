import type React from 'react';
import { BriefcaseBusiness, Coins, MapPin, PackageOpen, Users } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { economyFor, itemPackageFor, type CharacterCreationDraft } from '../../features/characters/customCharacterStart';
import { previewStartingItems } from '../../features/characters/creationApproaches';
import type { CreatorPanel } from './creatorTypes';

const PACKAGE_LABELS = {
  commoner: '寻常行装',
  traveler: '旅人行装',
  retainer: '侍从行装',
  knight: '武装骑士行装',
  scholar: '识字人行装',
} as const;

export function CreationLifePanel({
  draft,
  roleLabel,
  originLabel,
  experienceLabel,
  livelihoodLabel,
  situationLabel,
  catalogState,
  onRetryCatalog,
  onEdit,
}: {
  draft: CharacterCreationDraft;
  roleLabel: string;
  originLabel: string;
  experienceLabel: string;
  livelihoodLabel: string;
  situationLabel: string;
  catalogState: 'loading' | 'ready' | 'error';
  onRetryCatalog: () => void;
  onEdit: (panel: CreatorPanel) => void;
}) {
  const money = economyFor(draft);
  const packageId = itemPackageFor(draft);
  const itemState = catalogState === 'ready' && draft.location ? previewStartingItems(draft) : undefined;
  const items = itemState ? Object.values(itemState.instances).map((instance) => ({
    instance,
    name: instance.customName ?? ITEM_CATALOG.get(instance.definitionId)?.name ?? instance.definitionId,
    placement: itemState.placements[instance.instanceId],
  })) : [];

  return <section data-creator-life>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow">Character Record</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">{draft.name || '这个人'}眼下怎样生活</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-parchment-dim">把姓名之外真正影响日子的事放在一起：靠什么糊口，带着什么，身在何处，又认识谁。点开任一栏即可修改。</p></div>
      <button type="button" onClick={() => onEdit('traits')} className="btn-decree shrink-0">挑选本事与特质</button>
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      <LifeSection icon={<BriefcaseBusiness className="h-4 w-4" />} title="身份与生计" onEdit={() => onEdit('background')}>
        <p className="text-sm text-parchment">{roleLabel}，{originLabel}出身，经历过{experienceLabel}。</p>
        <p className="mt-2 text-xs leading-relaxed text-parchment-dim">目前靠{livelihoodLabel}生活；这是开局已有的谋生方式，不限制之后尝试别的事。</p>
      </LifeSection>

      <LifeSection icon={<Coins className="h-4 w-4" />} title="手头钱财" onEdit={() => onEdit('background')}>
        <p className="font-display text-2xl text-gold-bright">{money.gold} 金龙 <span className="text-base text-parchment-dim">{money.silver} 银鹿</span></p>
        <p className="mt-2 text-xs leading-relaxed text-parchment-faint">由身份和当前生计按开局经济规则计算。</p>
      </LifeSection>

      <LifeSection icon={<MapPin className="h-4 w-4" />} title="所在之处与难处" onEdit={() => onEdit('situation')}>
        <p className="text-sm text-parchment">{draft.location?.name ?? '尚未选择地点'} · {situationLabel}</p>
        <p className="mt-2 text-xs leading-relaxed text-parchment-dim">{situationText(draft)}</p>
      </LifeSection>

      <LifeSection icon={<Users className="h-4 w-4" />} title="与谁有关" onEdit={() => onEdit('relations')}>
        {draft.relations.length === 0 && !draft.kinship
          ? <p className="text-sm leading-relaxed text-parchment-dim">还没有预设关系。可以独自开局，也可以连接一位真实存在的人。</p>
          : <ul className="space-y-1.5 text-sm text-parchment">{draft.relations.map((relation) => <li key={`${relation.kind}:${relation.targetId}`}>{relationName(relation.kind)}：{relation.targetName}</li>)}{draft.kinship && <li>{draft.kinship.kind === 'cadet_branch' ? '旁支血缘' : '私生血缘'}：{draft.kinship.targetName}{draft.kinship.publiclyKnown ? '（公开）' : '（知情有限）'}</li>}</ul>}
      </LifeSection>
    </div>

    <section className="mt-3 border border-hairline bg-ink/35 p-4" data-starting-items>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 font-serif text-base text-gold"><PackageOpen className="h-4 w-4" />实际行装</h3><p className="mt-1 text-xs text-parchment-faint">{PACKAGE_LABELS[packageId]} · 随身、穿戴与寄存处分别列出</p></div>
        <button type="button" onClick={() => onEdit('background')} className="text-xs text-gold underline underline-offset-4">修改来源</button>
      </div>
      {catalogState === 'loading' && <p className="mt-4 text-xs text-parchment-dim">正在读取普通装备资料…</p>}
      {catalogState === 'error' && <div className="mt-4 flex items-center gap-3 text-xs text-rubric-bright"><span>行装清单没有读出来。</span><button type="button" onClick={onRetryCatalog} className="text-gold underline underline-offset-4">重试</button></div>}
      {catalogState === 'ready' && !draft.location && <p className="mt-4 text-xs text-parchment-dim">先选定落脚地点，才能安排行装、驮马和寄存处。</p>}
      {items.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map(({ instance, name, placement }) => <div key={instance.instanceId} className="border-l-2 border-gold-deep/60 bg-ink/55 px-3 py-2"><span className="block text-sm text-parchment">{name}</span><span className="mt-1 block text-[10px] text-parchment-faint">{placementLabel(placement, itemState!)}</span></div>)}</div>}
      {itemState && (Object.values(itemState.vehicles).length > 0 || Object.values(itemState.sites).length > 0) && <div className="mt-3 border-t border-hairline pt-3 text-xs text-parchment-dim">
        {Object.values(itemState.vehicles).map((vehicle) => <p key={vehicle.id}>运输：{vehicle.name} · {vehicle.description}</p>)}
        {Object.values(itemState.sites).map((site) => <p key={site.id}>储物：{site.name} · {site.description}</p>)}
      </div>}
    </section>
  </section>;
}

function LifeSection({ icon, title, onEdit, children }: { icon: React.ReactNode; title: string; onEdit: () => void; children: React.ReactNode }) {
  return <section className="border border-hairline bg-ink/35 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-serif text-base text-gold">{icon}{title}</h3><button type="button" onClick={onEdit} className="text-xs text-gold underline underline-offset-4">编辑</button></div>{children}</section>;
}

function relationName(kind: CharacterCreationDraft['relations'][number]['kind']) {
  return kind === 'acquaintance' ? '熟人' : kind === 'employer' ? '雇主' : '效忠对象';
}

function situationText(draft: CharacterCreationDraft) {
  const place = draft.location?.name ?? '所选地点';
  if (draft.situation === 'lodging') return `暂时借宿在${place}，只有一处存放个人物品的位置。`;
  if (draft.situation === 'awaiting_work') return `正在${place}候差，眼下没有替你接受任何差事。`;
  if (draft.situation === 'making_living') return `正在${place}靠当前生计谋生，日子还没有稳定下来。`;
  return `刚抵达${place}，下一步去哪里、答应谁，都留给玩家决定。`;
}

function placementLabel(placement: ReturnType<typeof previewStartingItems>['placements'][string], state: ReturnType<typeof previewStartingItems>) {
  if (placement.type === 'equipped') return '已经穿戴或持用';
  if (placement.type === 'carried') return '随身携带';
  if (placement.type === 'site') return `存放在${state.sites[placement.siteId]?.name ?? '储物处'}`;
  if (placement.type === 'vehicle') return `放在${state.vehicles[placement.vehicleId]?.name ?? '运输工具'}上`;
  if (placement.type === 'character') return '由他人持有';
  return '当前遗失';
}
