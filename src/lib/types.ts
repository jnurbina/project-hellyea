// === Core Game Types ===

export type TerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'ruins';

export interface Tile {
  q: number; // column
  r: number; // row
  terrain: TerrainType;
  elevation: number;
  resourceType?: 'wood' | 'stone' | 'iron' | 'food' | 'water';
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
  respawnTimer: number; // 0 = alive, >0 = respawning
  inventory: (Card | null)[];
  owner: string; // player id
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
  plains:   { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#2a2a2a', elevation: 0 },
  forest:   { moveCost: 2, blocksLoS: false, reducesVis: 1, color: '#1a2a1a', elevation: 0.1 },
  mountain: { moveCost: 3, blocksLoS: true,  reducesVis: 0, color: '#3a3a3a', elevation: 0.5 },
  water:    { moveCost: 99, blocksLoS: false, reducesVis: 0, color: '#0a0a1a', elevation: -0.1 },
  ruins:    { moveCost: 1, blocksLoS: false, reducesVis: 0, color: '#2a1a2a', elevation: 0.05 },
};
