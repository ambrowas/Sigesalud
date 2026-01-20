type FacilityMarkerProps = {
  x: number
  y: number
  title: string
  facilityType?: string | null
  active?: boolean
  onClick?: () => void
}

export default function FacilityMarker({ x, y, title, facilityType, active, onClick }: FacilityMarkerProps) {
  const safeX = Math.min(1, Math.max(0, x))
  const safeY = Math.min(1, Math.max(0, y))

  return (
    <button
      type="button"
      className={`map-marker${active ? ' active' : ''}`}
      data-type={facilityType ?? 'UNKNOWN'}
      style={{ left: `${safeX * 100}%`, top: `${safeY * 100}%` }}
      title={title}
      aria-label={title}
      onClick={onClick}
    />
  )
}
