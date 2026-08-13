import { useEffect, useMemo } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'

const isValidCoordinate = (latitude, longitude) => (
  latitude !== null
  && latitude !== undefined
  && latitude !== ''
  && longitude !== null
  && longitude !== undefined
  && longitude !== ''
  && Number.isFinite(Number(latitude))
  && Number.isFinite(Number(longitude))
  && Number(latitude) >= -90
  && Number(latitude) <= 90
  && Number(longitude) >= -180
  && Number(longitude) <= 180
)

function FitReportMap({ positions }) {
  const map = useMap()

  useEffect(() => {
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize()

      if (positions.length > 1) {
        map.fitBounds(positions, {
          padding: [28, 28],
          maxZoom: 17,
          animate: true,
        })
        return
      }

      if (positions.length === 1) {
        map.setView(positions[0], 17, { animate: true })
      }
    }, 120)

    return () => window.clearTimeout(resizeTimer)
  }, [map, positions])

  return null
}

function ReportLocationMap({ incident, markerLabel = 'Reported location', routePoints = [] }) {
  const latitude = incident?.latitude
  const longitude = incident?.longitude
  const incidentPosition = useMemo(
    () => (
      isValidCoordinate(latitude, longitude)
        ? [Number(latitude), Number(longitude)]
        : null
    ),
    [latitude, longitude],
  )
  const routePositions = useMemo(
    () => routePoints
      .filter((point) => isValidCoordinate(point.latitude, point.longitude))
      .map((point) => [Number(point.latitude), Number(point.longitude)]),
    [routePoints],
  )
  const mapPositions = useMemo(
    () => incidentPosition ? [...routePositions, incidentPosition] : routePositions,
    [incidentPosition, routePositions],
  )
  const mapCenter = incidentPosition || routePositions[routePositions.length - 1] || null

  if (!mapCenter) {
    return (
      <div className="report-location-map__empty">
        No valid GPS coordinates were saved for this report.
      </div>
    )
  }

  return (
    <div className="report-location-map">
      <MapContainer
        center={mapCenter}
        zoom={17}
        scrollWheelZoom
        className="report-location-map__canvas"
      >
        <FitReportMap positions={mapPositions} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routePositions.length > 1 && (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }}
          />
        )}

        {routePositions.length > 0 && (
          <CircleMarker
            center={routePositions[0]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
          >
            <Tooltip direction="top">Route start</Tooltip>
          </CircleMarker>
        )}

        {routePositions.length > 1 && (
          <CircleMarker
            center={routePositions[routePositions.length - 1]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
          >
            <Tooltip direction="top">Route end</Tooltip>
          </CircleMarker>
        )}

        {incidentPosition && (
          <CircleMarker
            center={incidentPosition}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top">
              {markerLabel}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      <div className="report-location-map__legend" aria-label="Map legend">
        {incidentPosition && (
          <span><i className="report-map-dot report-map-dot--incident" />{markerLabel}</span>
        )}
        {routePositions.length > 0 && (
          <>
            <span><i className="report-map-dot report-map-dot--start" />Route start</span>
            <span><i className="report-map-line" />Officer route</span>
          </>
        )}
      </div>
    </div>
  )
}

export default ReportLocationMap
