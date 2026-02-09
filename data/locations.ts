/**
 * Key locations from Robert M. Pirsig's "Zen and the Art of Motorcycle Maintenance"
 * The journey traces the author's motorcycle trip from Minnesota through the Dakotas
 * and Montana, exploring questions of quality, technology, and consciousness.
 */

export interface Location {
  id: string;
  name: string;
  coordinates: {
    lat: number;
    lng: number;
    elevation?: number; // meters above sea level
  };
  terrainType: 'plains' | 'hills' | 'mountains' | 'canyon' | 'valley' | 'plateau';
  chapterReference: number[]; // Chapters where this location appears
  description: string;
  significance: string; // Why this place matters in the narrative
}

export const locations: Location[] = [
  {
    id: 'minneapolis',
    name: 'Minneapolis, Minnesota',
    coordinates: {
      lat: 44.9778,
      lng: -93.2650,
      elevation: 264,
    },
    terrainType: 'plains',
    chapterReference: [1, 2],
    description: 'The starting point of the journey. Flat Midwestern landscape with urban sprawl giving way to agricultural plains.',
    significance: 'The beginning - where the narrator departs with his son Chris, setting the stage for the philosophical journey ahead.',
  },
  {
    id: 'ellendale',
    name: 'Ellendale, North Dakota',
    coordinates: {
      lat: 46.0019,
      lng: -98.5273,
      elevation: 457,
    },
    terrainType: 'plains',
    chapterReference: [3, 4],
    description: 'Open prairie landscape. Endless horizons and straight highways cutting through wheat fields.',
    significance: 'First overnight stop. The narrator begins to explore the divide between classical and romantic understanding.',
  },
  {
    id: 'jamestown',
    name: 'Jamestown, North Dakota',
    coordinates: {
      lat: 46.9106,
      lng: -98.7084,
      elevation: 456,
    },
    terrainType: 'plains',
    chapterReference: [5, 6],
    description: 'Rolling prairie with the James River valley. Subtle elevation changes in otherwise flat terrain.',
    significance: 'Deepening reflections on technology and the motorcycle as a study in mechanics and reason.',
  },
  {
    id: 'bowman',
    name: 'Bowman, Montana',
    coordinates: {
      lat: 46.1831,
      lng: -103.3949,
      elevation: 906,
    },
    terrainType: 'hills',
    chapterReference: [8, 9],
    description: 'Transition zone from plains to badlands. Rugged hills and eroded landscapes begin to appear.',
    significance: 'The landscape starts to mirror the increasingly complex philosophical terrain being explored.',
  },
  {
    id: 'bozeman',
    name: 'Bozeman, Montana',
    coordinates: {
      lat: 45.6770,
      lng: -111.0429,
      elevation: 1464,
    },
    terrainType: 'valley',
    chapterReference: [10, 11, 12, 13],
    description: 'Mountain valley surrounded by the Bridger, Tobacco Root, and Gallatin ranges. Dramatic elevation changes.',
    significance: 'Critical location - site of the narrator\'s past life as Phaedrus. Where the philosophical crisis reached its peak.',
  },
  {
    id: 'virginia-city',
    name: 'Virginia City, Montana',
    coordinates: {
      lat: 45.2936,
      lng: -111.9408,
      elevation: 1778,
    },
    terrainType: 'mountains',
    chapterReference: [14, 15],
    description: 'Historic gold rush ghost town nestled in mountainous terrain. Steep slopes and narrow valleys.',
    significance: 'A pause in the journey. Ghost town metaphor for abandoned ideas and the haunting nature of the past.',
  },
  {
    id: 'red-lodge',
    name: 'Red Lodge, Montana',
    coordinates: {
      lat: 45.1858,
      lng: -109.2468,
      elevation: 1709,
    },
    terrainType: 'mountains',
    chapterReference: [16, 17],
    description: 'Gateway to Beartooth Highway. Alpine terrain with dramatic peaks and deep valleys.',
    significance: 'Approaching the climax. The physical ascent mirrors the philosophical ascent toward resolution.',
  },
  {
    id: 'beartooth-pass',
    name: 'Beartooth Pass, Montana/Wyoming',
    coordinates: {
      lat: 45.0053,
      lng: -109.4069,
      elevation: 3337,
    },
    terrainType: 'mountains',
    chapterReference: [18, 19, 20],
    description: 'One of the highest and most spectacular highways in America. Alpine tundra, snowfields, and dizzying elevations.',
    significance: 'The summit - both literal and metaphorical. Chris\'s breakdown and the narrator\'s final confrontation with his past self.',
  },
];

/**
 * Helper function to get location by ID
 */
export function getLocationById(id: string): Location | undefined {
  return locations.find(loc => loc.id === id);
}

/**
 * Get locations by terrain type
 */
export function getLocationsByTerrain(terrainType: Location['terrainType']): Location[] {
  return locations.filter(loc => loc.terrainType === terrainType);
}

/**
 * Get locations by chapter
 */
export function getLocationsByChapter(chapter: number): Location[] {
  return locations.filter(loc => loc.chapterReference.includes(chapter));
}

/**
 * Calculate approximate distance between two locations (in km)
 * Uses Haversine formula
 */
export function getDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in km
  const lat1 = loc1.coordinates.lat * Math.PI / 180;
  const lat2 = loc2.coordinates.lat * Math.PI / 180;
  const deltaLat = (loc2.coordinates.lat - loc1.coordinates.lat) * Math.PI / 180;
  const deltaLng = (loc2.coordinates.lng - loc1.coordinates.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
