import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox'
import type { MapRef } from 'react-map-gl/mapbox'
import { DashboardStore } from '@/types'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

interface MarketMapProps {
  stores: DashboardStore[]
  regionName?: string
}

function pinColor(onShelf: number) {
  if (onShelf <= 3) return { fill: '#ef4444', ring: '#fee2e2' }
  if (onShelf === 4) return { fill: '#f59e0b', ring: '#fef3c7' }
  return { fill: '#10b981', ring: '#d1fae5' }
}

function statusLabel(onShelf: number) {
  if (onShelf <= 3) return 'Critical'
  if (onShelf === 4) return 'Needs Attention'
  return 'Good'
}

export function MarketMap({ stores, regionName }: MarketMapProps) {
  const mapRef = useRef<MapRef>(null)
  const navigate = useNavigate()
  const [hoveredStore, setHoveredStore] = useState<DashboardStore | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const title = `Region Coverage — ${regionName ?? 'All Regions'}`
  const storesWithCoords = stores.filter(s => s.latitude && s.longitude)

  useEffect(() => {
    if (!mapLoaded) return
    const map = mapRef.current
    if (!map || storesWithCoords.length === 0) return

    if (storesWithCoords.length === 1) {
      map.flyTo({
        center: [storesWithCoords[0].longitude!, storesWithCoords[0].latitude!],
        zoom: 11,
        duration: 800,
      })
      return
    }

    const lngs = storesWithCoords.map(s => s.longitude!)
    const lats = storesWithCoords.map(s => s.latitude!)
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, duration: 800, maxZoom: 13 },
    )
  }, [stores, mapLoaded])

  return (
    <div>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">
          {stores.length} store{stores.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ height: 300 }}>
        <MapGL
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: -99.5, latitude: 31.0, zoom: 5.2 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          onLoad={() => setMapLoaded(true)}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {storesWithCoords.map(store => {
            const colors = pinColor(store.onShelf)
            const isCritical = store.onShelf <= 3

            return (
              <Marker
                key={store.id}
                longitude={store.longitude!}
                latitude={store.latitude!}
                anchor="center"
              >
                <div
                  className="relative cursor-pointer"
                  onMouseEnter={() => setHoveredStore(store)}
                  onMouseLeave={() => setHoveredStore(null)}
                  onClick={() => navigate(`/stores/${store.id}`)}
                  style={{ width: 20, height: 20 }}
                >
                  {isCritical && (
                    <span
                      className="absolute inset-0 rounded-full animate-ping opacity-50"
                      style={{ backgroundColor: colors.fill }}
                    />
                  )}
                  <div
                    className="absolute inset-0 rounded-full border-2 flex items-center justify-center"
                    style={{ backgroundColor: colors.ring, borderColor: colors.fill }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors.fill }}
                    />
                  </div>
                </div>
              </Marker>
            )
          })}

          {hoveredStore && hoveredStore.longitude && hoveredStore.latitude && (
            <Popup
              longitude={hoveredStore.longitude}
              latitude={hoveredStore.latitude}
              anchor="bottom"
              offset={16}
              closeButton={false}
              closeOnClick={false}
            >
              <div className="px-3 py-2.5" style={{ minWidth: 168 }}>
                <p className="text-sm font-semibold text-gray-900 mb-1 leading-tight">
                  {hoveredStore.name}
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {hoveredStore.rep}
                </p>
                <div className="flex justify-between text-xs gap-3">
                  <span className="text-gray-500">On shelf</span>
                  <span className="font-medium text-gray-900">{hoveredStore.onShelf} bottles</span>
                </div>
                <div className="flex justify-between text-xs gap-3 mt-0.5">
                  <span className="text-gray-500">Days supply</span>
                  <span className="font-medium" style={{ color: pinColor(hoveredStore.onShelf).fill }}>
                    {hoveredStore.daysOfSupply !== null ? `${Math.round(hoveredStore.daysOfSupply)}d` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs gap-3 mt-0.5">
                  <span className="text-gray-500">Status</span>
                  <span className="font-semibold" style={{ color: pinColor(hoveredStore.onShelf).fill }}>
                    {statusLabel(hoveredStore.onShelf)}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/stores/${hoveredStore.id}`)}
                  className="mt-2.5 w-full text-center text-xs font-medium text-accent hover:underline"
                >
                  View store →
                </button>
              </div>
            </Popup>
          )}
        </MapGL>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-5">
        {[
          { color: '#ef4444', label: 'Critical (≤3 bottles)' },
          { color: '#f59e0b', label: 'Needs Attention (4)' },
          { color: '#10b981', label: 'Good (5+)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
