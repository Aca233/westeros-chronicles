import React from 'react'
import { Castle, Navigation, X } from 'lucide-react'
import type { CharacterId } from '../characters/types'
import type { CountyWorldView } from '../world/worldSelectors'
import { CountyWorldDetails } from './CountyWorldDetails'
import type { CountyViewModel } from './countyViewModel'

interface CountyDetailsProps {
  view: CountyViewModel
  worldView?: CountyWorldView
  characterNames: ReadonlyMap<string, string>
  assetNames: ReadonlyMap<string, string>
  onSelectLocation: (countyId: string, locationId: string) => void
  onSelectCharacter: (characterId: CharacterId) => void
  onOpenAsset: (assetId: string) => void
  onPrefillTravel: (destinationId: string, destinationName: string) => void
  onClose: () => void
}

export const CountyDetails: React.FC<CountyDetailsProps> = ({
  view,
  worldView,
  characterNames,
  assetNames,
  onSelectLocation,
  onSelectCharacter,
  onOpenAsset,
  onPrefillTravel,
  onClose,
}) => (
  <aside className="map-county-details" aria-label="伯爵领详情">
    <div className="map-details-handle" aria-hidden="true" />
    <button type="button" className="map-details-close" onClick={onClose} aria-label="关闭伯爵领详情">
      <X className="h-4 w-4" />
    </button>
    <div className="map-details-scroll">
      <header className="map-details-heading">
        <span className="map-details-type-icon"><Castle className="h-5 w-5" /></span>
        <div>
          <p>{[
            view.hegemonName,
            view.empireName,
            view.kingdomName,
            view.duchyName,
          ].filter(Boolean).join(' · ') || '领地资料'}</p>
          <h2>{view.name}</h2>
        </div>
      </header>

      <button type="button" className="map-travel-action" onClick={() => onPrefillTravel(view.primaryLocationId, view.name)}>
        <Navigation className="h-4 w-4" />
        <span>把这里写入行动</span>
      </button>

      <section className="map-details-section">
        <h3>伯爵领内地点</h3>
        <div className="map-county-location-list">
          {view.locations.map((location) => (
            <button
              key={location.id}
              type="button"
              data-primary={location.isPrimary}
              onClick={() => onSelectLocation(view.id, location.id)}
            >
              {location.name}
            </button>
          ))}
        </div>
      </section>

      {worldView ? (
        <CountyWorldDetails
          view={worldView}
          characterNames={characterNames}
          assetNames={assetNames}
          onSelectCharacter={onSelectCharacter}
          onOpenAsset={onOpenAsset}
        />
      ) : (
        <section className="map-details-section">
          <h3>当前情报</h3>
          <p>领地权属、人物与资产资料尚未载入。</p>
        </section>
      )}
    </div>
  </aside>
)
