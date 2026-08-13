import * as maplibregl from 'maplibre-gl'

const isFacingNorth = (bearing) => Math.abs((((bearing + 180) % 360) + 360) % 360 - 180) < 0.5

export const addMobileLikeNavigationControls = (map) => {
  map.dragRotate.enable()
  map.touchZoomRotate.enable()
  map.touchZoomRotate.enableRotation()
  map.touchPitch.enable()
  map.keyboard.enable()
  map.keyboard.enableRotation()

  const zoomControl = new maplibregl.NavigationControl({
    showCompass: false,
    showZoom: true,
  })
  const compassControl = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: false,
    visualizePitch: false,
    visualizeRoll: false,
  })

  map.addControl(zoomControl, 'top-left')
  map.addControl(compassControl, 'top-right')

  const compassElement = compassControl._container
  compassElement.classList.add('map-mobile-compass')

  const updateCompassVisibility = () => {
    compassElement.classList.toggle('is-facing-north', isFacingNorth(map.getBearing()))
  }

  map.on('rotate', updateCompassVisibility)
  updateCompassVisibility()

  return () => map.off('rotate', updateCompassVisibility)
}
