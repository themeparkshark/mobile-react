/**
 * Theme Park Shark cartoon map: an illustrated-park-map look drawn live from
 * OpenStreetMap vector tiles (OpenMapTiles schema, served free by OpenFreeMap).
 * Cream walkways, green lawns, textured tree cover, bright water with a foam
 * shoreline, soft pastel roofs with ink outlines. No labels: game pins are the
 * labels. Keep it calm so markers pop.
 */
const PATHS = ['path', 'track', 'pedestrian'];
const NOT_ROADS = [...PATHS, 'rail', 'transit', 'ferry'];
const line = ['==', ['geometry-type'], 'LineString'];
const w = (z15: number, z19: number, base = 1.6) => ['interpolate', ['exponential', base], ['zoom'], 15, z15, 19, z19];

export const TPS_MAP_STYLE = {
  version: 8,
  sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f1e5c6' } },
    { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      paint: { 'fill-color': ['match', ['get', 'class'],
        'residential', '#ece0c1', 'theme_park', '#f4e9cd', 'zoo', '#e2eab9',
        'pitch', '#a9d46c', 'playground', '#b7dc86', 'cemetery', '#b7d78c', '#eee2c4'] } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#b4d97b' } },
    { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-color': '#a8d36c' } },
    { id: 'grass-tufts', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-pattern': 'tps-grass', 'fill-opacity': 0.55 } },
    { id: 'sand', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': '#f6dea4' } },
    { id: 'wood-shadow', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'wetland']]],
      paint: { 'fill-color': '#4c9437', 'fill-translate': [0, 3] } },
    { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'wetland']]],
      paint: { 'fill-color': '#6db64b' } },
    { id: 'wood-trees', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 14,
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'wetland']]],
      paint: { 'fill-pattern': 'tps-trees' } },
    { id: 'water-foam', type: 'line', source: 'omt', 'source-layer': 'water',
      paint: { 'line-color': '#e8fbff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 19, 9] } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#4cc2ea' } },
    { id: 'water-ripples', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 15,
      paint: { 'fill-pattern': 'tps-water', 'fill-opacity': 0.7 } },
    { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water',
      paint: { 'line-color': '#2b98cc', 'line-width': 1.2 } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: { 'line-color': '#4cc2ea', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 19, 6] } },
    { id: 'plaza', type: 'fill', source: 'omt', 'source-layer': 'transportation',
      filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#fbf2dc', 'fill-outline-color': '#dcc79c' } },
    { id: 'path-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['in', ['get', 'class'], ['literal', PATHS]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#dcc699', 'line-width': w(2, 16) } },
    { id: 'road-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['!', ['in', ['get', 'class'], ['literal', NOT_ROADS]]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#bdb49c', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 2, 19,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 44, 30]] } },
    { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['in', ['get', 'class'], ['literal', PATHS]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff7e2', 'line-width': w(1, 12) } },
    { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['!', ['in', ['get', 'class'], ['literal', NOT_ROADS]]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#dedbd3', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1, 19,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 38, 25]] } },
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
      paint: { 'line-color': '#9a7650', 'line-width': 2, 'line-dasharray': [2, 1.5] } },
    { id: 'bldg-shadow', type: 'fill', source: 'omt', 'source-layer': 'building',
      paint: { 'fill-color': 'rgba(80,60,40,0.22)', 'fill-translate': [2.5, 3.5] } },
    // One calm roof tone (OpenMapTiles merges buildings at z14, so per-building
    // colors would paint a whole block one hue). Pins and park props bring color.
    { id: 'bldg', type: 'fill', source: 'omt', 'source-layer': 'building',
      paint: { 'fill-color': '#e8d8bb' } },
    { id: 'bldg-ink', type: 'line', source: 'omt', 'source-layer': 'building', minzoom: 15,
      paint: { 'line-color': '#5c4a5e', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.6] } },
  ],
};

/** Hand-drawn textures the style's fill-pattern layers reference. */
export const MAP_PATTERNS = {
  'tps-trees': require('../../../assets/images/map/map-trees.png'),
  'tps-grass': require('../../../assets/images/map/map-grass.png'),
  'tps-water': require('../../../assets/images/map/map-water.png'),
};
