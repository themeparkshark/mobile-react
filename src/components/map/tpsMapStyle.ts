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
    { id: 'sand', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': '#f6dea4' } },
    // Forest floor under the planted trees (see decorations.ts).
    { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'wetland']]],
      paint: { 'fill-color': '#63ad45' } },
    { id: 'water-foam', type: 'line', source: 'omt', 'source-layer': 'water',
      paint: { 'line-color': '#e8fbff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 19, 9] } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#4cc2ea' } },
    { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water',
      paint: { 'line-color': '#2b98cc', 'line-width': 1.2 } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: { 'line-color': '#4cc2ea', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 19, 6] } },
    { id: 'plaza', type: 'fill', source: 'omt', 'source-layer': 'transportation',
      filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#fbf2dc', 'fill-outline-color': '#e7d5ad' } },
    { id: 'path-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['in', ['get', 'class'], ['literal', PATHS]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#e7d5ad', 'line-width': w(2, 15) } },
    { id: 'road-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['!', ['in', ['get', 'class'], ['literal', NOT_ROADS]]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#cdbf9f', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 2, 19,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 44, 30]] } },
    { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['in', ['get', 'class'], ['literal', PATHS]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fcf3de', 'line-width': w(1, 12) } },
    { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['all', line, ['!', ['in', ['get', 'class'], ['literal', NOT_ROADS]]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#e9e1cf', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1, 19,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 38, 25]] } },
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
      paint: { 'line-color': '#9a7650', 'line-width': 2, 'line-dasharray': [2, 1.5] } },
    // A sliver of front wall under each roof, always toward the bottom of the
    // screen, gives buildings a little illustrated depth.
    { id: 'bldg-wall', type: 'fill', source: 'omt', 'source-layer': 'building',
      paint: { 'fill-color': '#c8b08a', 'fill-translate': [0, 3], 'fill-translate-anchor': 'viewport' } },
    // One calm roof tone (OpenMapTiles merges buildings at z14, so per-building
    // colors would paint a whole block one hue). Pins and park props bring color.
    { id: 'bldg', type: 'fill', source: 'omt', 'source-layer': 'building',
      paint: { 'fill-color': '#eee2c8' } },
    { id: 'bldg-ink', type: 'line', source: 'omt', 'source-layer': 'building', minzoom: 15,
      paint: { 'line-color': '#8f7a5c', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.6] } },
  ],
};

