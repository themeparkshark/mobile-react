export const PARK_WIKI_IDS: Record<number, string> = {
  1: 'bc4005c5-8c7e-41d7-b349-cdddf1796427', // Universal Studios Hollywood
  2: '75ea578a-adc8-4116-a54d-dccb60765ef9', // Magic Kingdom
  3: 'eb3f4560-2383-4a36-9152-6b3e5ed6bc57', // Universal Studios Florida
  4: '47f90d2c-e191-4239-a466-5892ef59a88b', // EPCOT
  5: '288747d1-8b4f-4a64-867e-ea7c9b27bad8', // Hollywood Studios
  6: '1c84a229-8862-4648-9c71-378ddd2c7693', // Animal Kingdom
  7: '267615cc-8943-4c2a-ae2c-5da728ca591f', // Islands of Adventure
  8: '7340550b-c14d-4def-80bb-acdb51d49a66', // Disneyland Park
  9: 'fe78a026-b91b-470c-b906-9d2266b692da', // Volcano Bay
  10: '12dbb85b-265f-44e6-bccf-f1faa17211fc', // Epic Universe
  13: '832fcd51-ea19-4e77-85c7-75d5843b127c', // Disney California Adventure
};

export const PARK_DISPLAY_ORDER = [
  { id: 2, name: 'Magic Kingdom', group: 'Walt Disney World' },
  { id: 4, name: 'EPCOT', group: 'Walt Disney World' },
  { id: 5, name: 'Hollywood Studios', group: 'Walt Disney World' },
  { id: 6, name: 'Animal Kingdom', group: 'Walt Disney World' },
  { id: 8, name: 'Disneyland', group: 'Disneyland Resort' },
  { id: 13, name: 'California Adventure', group: 'Disneyland Resort' },
  { id: 3, name: 'Universal Studios FL', group: 'Universal Orlando' },
  { id: 7, name: 'Islands of Adventure', group: 'Universal Orlando' },
  { id: 10, name: 'Epic Universe', group: 'Universal Orlando' },
  { id: 9, name: 'Volcano Bay', group: 'Universal Orlando' },
  { id: 1, name: 'Universal Studios Hollywood', group: 'Universal Hollywood' },
];

export const WAIT_COLOR_TIERS = [
  { max: 15, color: '#22C55E', bg: '#F0FDF4', label: 'Walk On' },
  { max: 30, color: '#EAB308', bg: '#FEFCE8', label: 'Short' },
  { max: 60, color: '#F97316', bg: '#FFF7ED', label: 'Moderate' },
  { max: 90, color: '#EF4444', bg: '#FEF2F2', label: 'Long' },
  { max: Infinity, color: '#7C3AED', bg: '#F5F3FF', label: 'Extreme' },
];

export const CLOSED_COLOR = '#6B7280';
export const DOWN_COLOR = '#F59E0B';
export const REFURB_COLOR = '#6B7280';
