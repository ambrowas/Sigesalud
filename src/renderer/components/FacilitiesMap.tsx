import { useEffect, useMemo, useState } from 'react'
import FacilityMarker from './FacilityMarker'

type MapPos = { zone: 'INSULAR' | 'CONTINENTAL'; x: number; y: number }
type FacilityRow = {
  facility_id: string
  name: string
  facility_type?: string | null
  map_pos?: MapPos | null
}

type FacilitiesMapProps = {
  facilities: FacilityRow[]
  selectedId?: string | null
  onSelect?: (facilityId: string) => void
}

type MapRaster = {
  data: Uint8ClampedArray
  width: number
  height: number
}

const mapUrl = new URL('../assets/maps/ge.svg', import.meta.url).toString()
const LAND_ALPHA_MIN = 40
const LAND_GREEN_MIN = 90
const LAND_GREEN_DELTA = 12
const scanAngles = Array.from({ length: 16 }, (_value, idx) => (Math.PI * 2 * idx) / 16)

const legend = [
  { type: 'HOSPITAL', label: 'Hospital' },
  { type: 'CLINIC', label: 'Clinica' },
  { type: 'HEALTH_CENTER', label: 'Centro de salud' },
  { type: 'LAB', label: 'Laboratorio' }
]

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}

function isLandPixel(raster: MapRaster, px: number, py: number) {
  if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return false
  const idx = (py * raster.width + px) * 4
  const r = raster.data[idx]
  const g = raster.data[idx + 1]
  const b = raster.data[idx + 2]
  const a = raster.data[idx + 3]
  if (a < LAND_ALPHA_MIN) return false
  if (g < LAND_GREEN_MIN) return false
  return g > r + LAND_GREEN_DELTA && g > b + LAND_GREEN_DELTA
}

function snapToLand(x: number, y: number, raster: MapRaster) {
  const px0 = Math.round(clampUnit(x) * (raster.width - 1))
  const py0 = Math.round(clampUnit(y) * (raster.height - 1))
  if (isLandPixel(raster, px0, py0)) {
    return { x: clampUnit(x), y: clampUnit(y) }
  }

  const maxRadius = Math.round(Math.min(raster.width, raster.height) * 0.12)
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (const angle of scanAngles) {
      const px = px0 + Math.round(Math.cos(angle) * radius)
      const py = py0 + Math.round(Math.sin(angle) * radius)
      if (isLandPixel(raster, px, py)) {
        return {
          x: clampUnit(px / (raster.width - 1)),
          y: clampUnit(py / (raster.height - 1))
        }
      }
    }
  }

  return { x: clampUnit(x), y: clampUnit(y) }
}

export default function FacilitiesMap({ facilities, selectedId, onSelect }: FacilitiesMapProps) {
  const [mapRaster, setMapRaster] = useState<MapRaster | null>(null)

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const width = image.naturalWidth || 1000
      const height = image.naturalHeight || 917
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(image, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      setMapRaster({ data: imageData.data, width, height })
    }
    image.src = mapUrl
    return () => {
      cancelled = true
    }
  }, [])

  const markers = useMemo(() => {
    return facilities
      .map(facility => {
        const pos = facility.map_pos
        if (!pos) return null
        return { ...facility, map_pos: pos }
      })
      .filter(Boolean) as Array<FacilityRow & { map_pos: MapPos }>
  }, [facilities])

  const snappedMarkers = useMemo(() => {
    if (!mapRaster) return markers
    return markers.map(facility => {
      const snapped = snapToLand(facility.map_pos.x, facility.map_pos.y, mapRaster)
      return { ...facility, map_pos: { ...facility.map_pos, ...snapped } }
    })
  }, [markers, mapRaster])

  return (
    <div className="facilities-map-panel">
      <div className="facilities-map">
        <img src={mapUrl} alt="Mapa de Guinea Ecuatorial" className="map-image" />
        {snappedMarkers.map(facility => (
          <FacilityMarker
            key={facility.facility_id}
            x={facility.map_pos.x}
            y={facility.map_pos.y}
            title={facility.name}
            facilityType={facility.facility_type ?? null}
            active={facility.facility_id === selectedId}
            onClick={onSelect ? () => onSelect(facility.facility_id) : undefined}
          />
        ))}
      </div>
      <div className="map-legend">
        {legend.map(item => (
          <div className="legend-item" data-type={item.type} key={item.type}>
            <span className="legend-dot" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
