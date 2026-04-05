// === Core Game Types ===

export type TerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'ruins';

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

export interface Hero {
  id: string;
  name: string;
  lore: string;
  archetype: 'str' | 'int' | 'agi';
  stats: HeroStats;
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
  resourceType?: Exclude<Tile['resourceType'], undefined>; // What resource it holds if resourcePouch
  resourceAmount?: number; // Current amount in pouch
  maxResourceAmount?: number; // Max capacity of resourcePouch
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
}

export interface Player {
  id: string;
  name: string;
  heroes: [Hero, Hero];
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
export const TERRAIN_CONFIG: Record<TerrainType, {
  moveCost: number;
  blocksLoS: boolean;
  reducesVis: number;
  color: string;
  elevation: number;
}> = {
  plains:   { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#3a3c40', elevation: 0 },
  forest:   { moveCost: 2, blocksLoS: false, reducesVis: 1, color: '#2a3a2a', elevation: 0.15 },
  mountain: { moveCost: 3, blocksLoS: true,  reducesVis: 0, color: '#4a4c50', elevation: 0.5 },
  water:    { moveCost: 99, blocksLoS: false, reducesVis: 0, color: '#1a2030', elevation: -0.1 },
  ruins:    { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#3a2a3a', elevation: 0.08 },
};
