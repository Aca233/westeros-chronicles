import React from 'react';
import { Boxes, Castle, Crown, History, Shield, UserRound } from 'lucide-react';
import type { CharacterId } from '../characters/types';
import type { CountyWorldView } from '../world/worldSelectors';

export interface CountyWorldDetailsProps {
  view: CountyWorldView;
  characterNames: ReadonlyMap<string, string>;
  assetNames: ReadonlyMap<string, string>;
  onSelectCharacter: (characterId: CharacterId) => void;
  onOpenAsset: (assetId: string) => void;
}

function characterLabel(id: CharacterId, names: ReadonlyMap<string, string>): string {
  return names.get(id) ?? '姓名资料未能解析';
}

function assetLabel(id: string, names: ReadonlyMap<string, string>, fallback: string): string {
  return names.get(id) ?? fallback;
}

export const CountyWorldDetails: React.FC<CountyWorldDetailsProps> = ({
  view,
  characterNames,
  assetNames,
  onSelectCharacter,
  onOpenAsset,
}) => (
  <div className="space-y-4" data-county-world-details>
    <section className="map-details-section">
      <h3>领地权属</h3>
      <div className="map-intel-list">
        {view.lawfulHolderId ? (
          <button type="button" onClick={() => onSelectCharacter(view.lawfulHolderId!)}>
            <Crown />
            <span><small>法理领主</small><strong>{characterLabel(view.lawfulHolderId, characterNames)}</strong></span>
          </button>
        ) : <p>法理领主资料未能解析。</p>}
        {view.controllerId ? (
          <button type="button" onClick={() => onSelectCharacter(view.controllerId!)}>
            <Shield />
            <span><small>{view.isContested ? '争议中的实际控制者' : '实际控制者'}</small><strong>{characterLabel(view.controllerId, characterNames)}</strong></span>
          </button>
        ) : <p>实际控制者资料未能解析。</p>}
      </div>
    </section>

    <section className="map-details-section map-local-intelligence">
      <h3>当前重要人物</h3>
      <div className="map-intel-list">
        {view.characterIds.map((characterId) => (
          <button key={characterId} type="button" onClick={() => onSelectCharacter(characterId)}>
            <UserRound />
            <span><small>已确认位于本伯爵领</small><strong>{characterLabel(characterId, characterNames)}</strong></span>
          </button>
        ))}
        {view.characterIds.length === 0 && <p>当前没有已确认的重要人物。</p>}
      </div>
    </section>

    <section className="map-details-section map-local-intelligence">
      <h3>据点、车辆与重要资产</h3>
      <div className="map-intel-list">
        {view.siteAssetIds.map((assetId) => (
          <button key={assetId} type="button" onClick={() => onOpenAsset(assetId)}>
            <Castle />
            <span><small>城堡、城市或村庄</small><strong>{assetLabel(assetId, assetNames, '未记录名称的据点')}</strong></span>
          </button>
        ))}
        {view.vehicleAssetIds.map((assetId) => (
          <button key={assetId} type="button" onClick={() => onOpenAsset(assetId)}>
            <Boxes />
            <span><small>运输工具</small><strong>{assetLabel(assetId, assetNames, '未记录名称的运输工具')}</strong></span>
          </button>
        ))}
        {view.itemAssetIds.map((assetId) => (
          <button key={assetId} type="button" onClick={() => onOpenAsset(assetId)}>
            <Boxes />
            <span><small>重要物品</small><strong>{assetLabel(assetId, assetNames, '未记录名称的重要物品')}</strong></span>
          </button>
        ))}
        {view.siteAssetIds.length + view.vehicleAssetIds.length + view.itemAssetIds.length === 0 && <p>当前没有已确认的资产位置记录。</p>}
      </div>
    </section>

    <section className="map-details-section map-local-intelligence">
      <h3>近期事件</h3>
      <div className="map-intel-list">
        {view.events.slice(-5).reverse().map((event) => (
          <div key={event.id}>
            <History />
            <span><small>{event.date.year}.{event.date.month}.{event.date.day}</small><strong>{event.reason}</strong></span>
          </div>
        ))}
        {view.events.length === 0 && <p>当前没有已确认的近期事件。</p>}
      </div>
    </section>
  </div>
);
