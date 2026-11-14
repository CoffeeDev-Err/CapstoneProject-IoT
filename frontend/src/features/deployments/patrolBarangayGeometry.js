// Boundary-inclusive polygon hit testing, independent of map label placement.
export const pointInBarangay = ({ longitude: x, latitude: y }, geometry) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const inRing = ring => {
    let inside = false
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i]
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy
      const dot = (x - ax) * dx + (y - ay) * dy
      if (length > 0 && Math.abs((x - ax) * dy - (y - ay) * dx) <= 1e-14 && dot >= 0 && dot <= length) return true
      if ((ay > y) !== (by > y) && x < dx * (y - ay) / dy + ax) inside = !inside
    }
    return inside
  }
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  return polygons.some(rings => inRing(rings[0]) && !rings.slice(1).some(inRing))
}

export const barangayAtPoint = (collection, point) => collection.features.find(feature => pointInBarangay(point, feature.geometry))
