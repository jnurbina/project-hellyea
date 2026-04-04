// === Game State Store (Zustand) ===

import { create } from 'zustand';
import { GameState, Hero, TurnAction, Tile, Player, HeroStats } from './types';
import { generateGrid, findPath, calculateVisibility } from './grid';

interface GameStore {
  // State
  gameState: GameState | null;
  selectedHero: string | null;
  hoveredTile: { q: number; r: number } | null;
  currentPath: { q: number; r: number }[] | null;
  localPlayerId: string;
  
  // Actions
  initGame: (mapWidth?: number, mapHeight?: number) => void;
  selectHero: (heroId: string | null) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  moveHero: (heroId: string, q: number, r: number) => void;
  submitTurn: () => void;
  updateVisibility: () => void;
}

const DEFAULT_HEROES: { name: string; lore: string; archetype: Hero['archetype']; stats: HeroStats }[] = [
  {
    name: 'Kael',
    lore: 'A swift blade from the outer wastes.',
    archetype: 'agi',
    stats: { hp: 80, maxHp: 80, atk: 12, def: 6, mov: 5, rng: 1, vis: 6, spd: 8 },
  },
  {
    name: 'Morrigan',
    lore: 'Fire walks with her.',
    archetype: 'int',
    stats: { hp: 60, maxHp: 60, atk: 18, def: 4, mov: 3, rng: 4, vis: 7, spd: 5 },
  },
  {
    name: 'Gort',
    lore: 'Mountain-born. Mountain-hard.',
    archetype: 'str',
    stats: { hp: 120, maxHp: 120, atk: 15, def: 12, mov: 3, rng: 1, vis: 4, spd: 3 },
  },
  {
    name: 'Vesper',
    lore: 'Sees all. Says nothing.',
    archetype: 'int',
    stats: { hp: 70, maxHp: 70, atk: 10, def: 5, mov: 4, rng: 3, vis: 9, spd: 6 },
  },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedHero: null,
  hoveredTile: null,
  currentPath: null,
  localPlayerId: 'player1',
  
  initGame: (mapWidth = 20, mapHeight = 20) => {
    const grid = generateGrid(mapWidth, mapHeight, Date.now());
    
    const makeHero = (template: typeof DEFAULT_HEROES[0], id: string, owner: string, q: number, r: number): Hero => ({
      id,
      name: template.name,
      lore: template.lore,
      archetype: template.archetype,
      stats: { ...template.stats },
      position: { q, r },
      alive: true,
      respawnTimer: 0,
      inventory: [null, null, null, null, null, null],
      owner,
    });
    
    const player1: Player = {
      id: 'player1',
      name: 'Player 1',
      heroes: [
        makeHero(DEFAULT_HEROES[0], 'p1-hero1', 'player1', 2, 2),
        makeHero(DEFAULT_HEROES[2], 'p1-hero2', 'player1', 3, 3),
      ],
      resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 },
      hand: [],
      deck: [],
      buildings: [],
      actionsSubmitted: false,
    };
    
    const player2: Player = {
      id: 'player2',
      name: 'Player 2',
      heroes: [
        makeHero(DEFAULT_HEROES[1], 'p2-hero1', 'player2', mapWidth - 3, mapHeight - 3),
        makeHero(DEFAULT_HEROES[3], 'p2-hero2', 'player2', mapWidth - 4, mapHeight - 4),
      ],
      resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 },
      hand: [],
      deck: [],
      buildings: [],
      actionsSubmitted: false,
    };
    
    const gameState: GameState = {
      phase: 'planning',
      turn: 1,
      grid,
      players: { player1, player2 },
      pendingActions: { player1: [], player2: [] },
      mapWidth,
      mapHeight,
    };
    
    set({ gameState });
    // Calculate initial visibility
    get().updateVisibility();
  },
  
  selectHero: (heroId) => {
    set({ selectedHero: heroId, currentPath: null });
  },
  
  setHoveredTile: (q, r) => {
    const { gameState, selectedHero } = get();
    if (!gameState || !selectedHero) {
      set({ hoveredTile: { q, r } });
      return;
    }
    
    // Find the selected hero
    const player = gameState.players[get().localPlayerId];
    const hero = player?.heroes.find(h => h.id === selectedHero);
    if (!hero || !hero.alive) {
      set({ hoveredTile: { q, r } });
      return;
    }
    
    // Calculate path
    const path = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, hero.stats.mov);
    set({ hoveredTile: { q, r }, currentPath: path });
  },
  
  clearHover: () => set({ hoveredTile: null, currentPath: null }),
  
  moveHero: (heroId, q, r) => {
    const { gameState } = get();
    if (!gameState) return;
    
    const player = gameState.players[get().localPlayerId];
    const hero = player?.heroes.find(h => h.id === heroId);
    if (!hero || !hero.alive) return;
    
    const path = findPath(gameState.grid, hero.position.q, hero.position.r, q, r, hero.stats.mov);
    if (!path) return;
    
    // Move the hero
    hero.position = { q, r };
    
    set({ gameState: { ...gameState }, selectedHero: null, currentPath: null });
    get().updateVisibility();
  },
  
  submitTurn: () => {
    // TODO: Submit to server for simultaneous resolution
    const { gameState } = get();
    if (!gameState) return;
    
    set({
      gameState: {
        ...gameState,
        turn: gameState.turn + 1,
      },
    });
  },
  
  updateVisibility: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState) return;
    
    const player = gameState.players[localPlayerId];
    if (!player) return;
    
    // Reset all tiles to explored (not visible)
    for (const row of gameState.grid) {
      for (const tile of row) {
        if (tile.visible === 'visible') tile.visible = 'explored';
      }
    }
    
    // Calculate visibility for each hero
    for (const hero of player.heroes) {
      if (!hero.alive) continue;
      const visibleTiles = calculateVisibility(gameState.grid, hero.position.q, hero.position.r, hero.stats.vis);
      for (const key of visibleTiles) {
        const [tq, tr] = key.split(',').map(Number);
        if (tr >= 0 && tr < gameState.grid.length && tq >= 0 && tq < gameState.grid[0].length) {
          gameState.grid[tr][tq].visible = 'visible';
        }
      }
    }
    
    set({ gameState: { ...gameState } });
  },
}));
