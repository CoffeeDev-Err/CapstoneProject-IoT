import { createLeafletMapHtml } from './leafletMapHtml';

describe('Leaflet map document', () => {
  it('keeps the secure bridge, map modes, and initial personnel payload', () => {
    const html = createLeafletMapHtml({
      latitude: 17.42,
      longitude: 121.76,
      currentPersonnelId: 'PNP-001',
      isDark: true,
      mapPersonnel: [{
        id: 'PNP-001',
        badge: '001',
        name: 'Officer One',
        rank: 'PO1',
        locationName: 'Centro',
        status: 'On Duty',
        lastUpdated: '2026-08-28T00:00:00.000Z',
        latitude: 17.42,
        longitude: 121.76,
        photoUrl: 'https://example.test/officer.jpg',
        emergencyActive: false,
        operationActive: false,
        outsideBoundary: false,
      }],
    });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("event.source!==window.parent");
    expect(html).toContain('set-map-mode');
    expect(html).toContain('satelliteLayer');
    expect(html).toContain('PNP-001');
    expect(html).toContain('setView([17.42,121.76],15)');
  });
});
