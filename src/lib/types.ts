// === Core Game Types ===

export type TerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'ruins';

// === Time of Day System ===

export type TimeOfDay = 'morn' | 'noon' | 'dusk' | 'night';

export const TIME_OF_DAY_CYCLE: TimeOfDay[] = ['morn', 'noon', 'dusk', 'night'];

export interface HeroDebuffs {
  movPenalty: number;     // -1 per day without food
  spdPenalty: number;     // -2 per day without food
  rngPenalty: number;     // -1 per day without water
  atkPenalty: number;     // -3 per day without water
  hpPenaltyPercent: number; // -25% HP per day without food or water (stacks)
  daysWithoutFood: number;
  daysWithoutWater: number;
}

export const HERO_CONSUMPTION = { food: 1, water: 1 };
export const SCOUT_CONSUMPTION = { food: 0.5, water: 0 };
export const FARMER_CONSUMPTION = { food: 0, water: 0.5 };

export const HERO_STARVATION_DEBUFFS = {
  noFood: { movPenalty: 1, spdPenalty: 2, hpPercent: 25 },
  noWater: { rngPenalty: 1, atkPenalty: 3, hpPercent: 25 },
};

export const UNIT_STARVATION_DEBUFFS = {
  scout: {
    noFood: { movPenalty: 1, spdPenalty: 2, hpPercent: 25 },
  },
  farmer: {
    noWater: { movPenalty: 1, gatherPenalty: 1, hpPercent: 25 },
  },
};

export interface Tile {
  q: number; // column
  r: number; // row
  terrain: TerrainType;
  elevation: number;
  resourceType?: 'wood' | 'stone' | 'iron' | 'food' | 'water';
  resourceAmount?: number;
  buildingId?: string;
  visible: 'unexplored' | 'explored' | 'visible';
}

export interface HeroStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;  // tiles per turn
  rng: number;  // attack range
  vis: number;  // line of sight range
  spd: number;  // turn priority
}

// === Unit System (Scout/Farmer) ===

export type UnitType = 'scout' | 'farmer';

export interface UnitStats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;
  rng: number;
  vis: number;
  spd: number;
  pouchCapacity: number;  // Farmer: 10, Scout: 0
  gatherMin: number;      // Farmer: 2, Scout: 0
  gatherMax: number;      // Farmer: 3, Scout: 0
}

export interface UnitDebuffs {
  movPenalty: number;     // Stacks from starvation
  spdPenalty: number;     // Stacks from starvation
  atkPenalty: number;     // Stacks from dehydration
  rngPenalty: number;     // Stacks from dehydration
  gatherPenalty: number;  // Farmer dehydration
}

export interface Unit {
  id: string;
  unitType: UnitType;
  owner: string;
  position: { q: number; r: number };
  stats: UnitStats;
  baseStats: UnitStats;   // Original stats before debuffs
  debuffs: UnitDebuffs;
  alive: boolean;

  // Farmer-specific
  resourcePouch?: {
    wood?: number;
    stone?: number;
    iron?: number;
    food?: number;
    water?: number;
  };

  // Scout-specific (AI behavior)
  lastKnownPosition?: { q: number; r: number };  // Where enemy was last seen
  lkpTurnsRemaining?: number;  // Turns until LKP expires (max 3)
  currentTargetId?: string;    // ID of unit being pursued
  controlledBy?: string;       // For Mind Control - original owner if controlled
  controlTurnsRemaining?: number;  // Turns until control ends
}

// Default stats for unit types
export const UNIT_STATS: Record<UnitType, UnitStats> = {
  scout: {
    hp: 30, maxHp: 30,
    atk: 6, def: 2,
    mov: 5, rng: 1, vis: 5, spd: 7,
    pouchCapacity: 0, gatherMin: 0, gatherMax: 0,
  },
  farmer: {
    hp: 25, maxHp: 25,
    atk: 0, def: 1,
    mov: 4, rng: 0, vis: 3, spd: 4,
    pouchCapacity: 16, gatherMin: 2, gatherMax: 3,
  },
};

// Training costs
export const UNIT_COSTS: Record<UnitType, { food: number; water: number; wood: number; stone: number }> = {
  scout: { food: 1, water: 0, wood: 1, stone: 1 },
  farmer: { food: 0, water: 1.5, wood: 1, stone: 0 },
};

// Daily upkeep (fractional)
export const UNIT_UPKEEP: Record<UnitType, { food: number; water: number }> = {
  scout: { food: 0.5, water: 0 },
  farmer: { food: 0, water: 0.5 },
};

// Max units per type per player
export const UNIT_CAPS: Record<UnitType, number> = {
  scout: 2,
  farmer: 2,
};

export interface Hero {
  id: string;
  name: string;
  lore: string;
  archetype: 'str' | 'int' | 'agi';
  stats: HeroStats;
  baseStats: HeroStats;  // Original stats before debuffs
  debuffs: HeroDebuffs;
  position: { q: number; r: number };
  alive: boolean;
  respawnTimer: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  inventory: Inventory; // Changed from (Card | null)[] to Inventory
  owner: string;
}

export type ItemType = 'head' | 'body' | 'hands' | 'feet' | 'resourcePouch' | 'accessory';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  resourceType?: Exclude<Tile['resourceType'], undefined>; // Legacy single-type (deprecated)
  resourceAmount?: number; // Legacy single amount (deprecated)
  maxResourceAmount?: number; // Max capacity of resourcePouch (default 5)
  // Multi-resource pouch support: holds any combo of resources totaling up to maxResourceAmount
  resources?: {
    wood?: number;
    stone?: number;
    iron?: number;
    food?: number;
    water?: number;
  };
  // Add other item properties like stat boosts, effects, etc. later
}

export interface Inventory {
  head: Item | null;
  body: Item | null;
  hands: Item | null;
  feet: Item | null;
  resourcePouch: Item | null; // Holds 5 of one resource type
  accessory: Item | null;
}

export interface Card {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  category: 'combat' | 'movement' | 'environment' | 'buff' | 'economy' | 'vision' | 'wild';
  cost?: number;
  effect: Record<string, unknown>;
}

export interface Building {
  id: string;
  type: 'town_center' | 'watchtower' | 'wall' | 'forge' | 'farm' | 'well';
  position: { q: number; r: number };
  owner: string;
  hp: number;
  maxHp: number;
  constructedAt: number; // Round when constructed
}

export interface Player {
  id: string;
  name: string;
  heroes: [Hero, Hero];
  units: Unit[];  // Scouts and Farmers
  resources: {
    wood: number;
    stone: number;
    iron: number;
    food: number;
    water: number;
  };
  hand: Card[];
  deck: Card[];
  buildings: Building[];
  actionsSubmitted: boolean;
}

export interface TurnAction {
  heroId: string;
  move?: { q: number; r: number };
  attack?: { targetId: string };
  settlement?: {
    type: 'build' | 'train' | 'upgrade' | 'craft';
    payload: Record<string, unknown>;
  };
  cardPlay?: { cardId: string; target?: string };
}

export interface GameState {
  phase: 'lobby' | 'hero_select' | 'planning' | 'resolution' | 'game_over';
  turn: number;
  grid: Tile[][];
  players: Record<string, Player>;
  pendingActions: Record<string, TurnAction[]>; // per player
  winner?: string;
  mapWidth: number;
  mapHeight: number;
}

// Terrain properties
// Note: moveCost is base cost (1 for all passable terrain). Mountain ascension cost is handled in pathfinding.
export const TERRAIN_CONFIG: Record<TerrainType, {
  moveCost: number;
  blocksLoS: boolean;
  reducesVis: number;
  color: string;
  elevation: number;
}> = {
  plains:   { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#3a3c40', elevation: 0 },
  forest:   { moveCost: 1, blocksLoS: false, reducesVis: 1, color: '#2a3a2a', elevation: 0.15 },
  mountain: { moveCost: 1, blocksLoS: true,  reducesVis: 0, color: '#4a4c50', elevation: 0.5 },
  water:    { moveCost: 99, blocksLoS: false, reducesVis: 0, color: '#1a2030', elevation: -0.1 },
  ruins:    { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#3a2a3a', elevation: 0.08 },
};
