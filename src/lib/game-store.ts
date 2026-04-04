// === Game State Store (Zustand) ===

import { create } from 'zustand';
import * as THREE from 'three';
import { GameState, Hero, TurnAction, Tile, Player, HeroStats, TERRAIN_CONFIG } from './types';
import { generateGrid, findPath, calculateVisibility, octileDistance } from './grid';

// Helper to calculate the midpoint of a player's living heroes
const getPlayerHeroMidpoint = (player: Player): THREE.Vector3 => {
  const livingHeroes = player.heroes.filter(h => h.alive);
  if (livingHeroes.length === 0) return new THREE.Vector3();
  const sum = livingHeroes.reduce(
    (acc, hero) => acc.add(new THREE.Vector3(hero.position.q, 0, hero.position.r)),
    new THREE.Vector3()
  );
  return sum.divideScalar(livingHeroes.length);
};

export interface CameraConfig {
  target: THREE.Vector3;
  angle: number;
  zoom: number;
}

interface GameStore {
  // State
  gameState: GameState | null;
  activePlayerId: string | null;
  turnOrder: string[]; // Player IDs in order for the round
  selectedHero: string | null;
  hoveredTile: { q: number; r: number } | null;
  currentPath: { q: number; r: number }[] | null;
  cameraConfig: CameraConfig | null;

  // Actions
  initGame: (mapWidth?: number, mapHeight?: number) => void;
  selectHero: (heroId: string | null) => void;
  setHoveredTile: (q: number, r: number) => void;
  clearHover: () => void;
  moveHero: (heroId: string, q: number, r: number) => void;
  attackHero: (attackerId: string, targetId: string) => void;
  endTurn: () => void;
  updateVisibility: () => void;
}

const DEFAULT_HEROES: { name: string; lore: string; archetype: Hero['archetype']; stats: HeroStats }[] = [
  { name: 'Kael', lore: 'A swift blade from the outer wastes.', archetype: 'agi', stats: { hp: 80, maxHp: 80, atk: 12, def: 6, mov: 5, rng: 1, vis: 6, spd: 8 } },
  { name: 'Morrigan', lore: 'Fire walks with her.', archetype: 'int', stats: { hp: 60, maxHp: 60, atk: 18, def: 4, mov: 3, rng: 4, vis: 7, spd: 5 } },
  { name: 'Gort', lore: 'Mountain-born. Mountain-hard.', archetype: 'str', stats: { hp: 120, maxHp: 120, atk: 15, def: 12, mov: 3, rng: 1, vis: 4, spd: 3 } },
  { name: 'Vesper', lore: 'Sees all. Says nothing.', archetype: 'int', stats: { hp: 70, maxHp: 70, atk: 10, def: 5, mov: 4, rng: 3, vis: 9, spd: 6 } },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  activePlayerId: null,
  turnOrder: [],
  selectedHero: null,
  hoveredTile: null,
  currentPath: null,
  cameraConfig: null,

  initGame: (mapWidth = 20, mapHeight = 20) => {
    const grid = generateGrid(mapWidth, mapHeight, Date.now());
    
    const makeHero = (template: typeof DEFAULT_HEROES[0], id: string, owner: string, q: number, r: number): Hero => ({
      id, name: template.name, lore: template.lore, archetype: template.archetype, stats: { ...template.stats },
      position: { q, r }, alive: true, respawnTimer: 0, hasMoved: false, hasAttacked: false,
      inventory: [null, null, null, null, null, null], owner,
    });
    
    const players: Record<string, Player> = {
      player1: {
        id: 'player1', name: 'Player 1',
        heroes: [ makeHero(DEFAULT_HEROES[0], 'p1-hero1', 'player1', 2, 2), makeHero(DEFAULT_HEROES[2], 'p1-hero2', 'player1', 3, 3) ],
        resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
      },
      player2: {
        id: 'player2', name: 'Player 2',
        heroes: [ makeHero(DEFAULT_HEROES[1], 'p2-hero1', 'player2', mapWidth - 3, mapHeight - 3), makeHero(DEFAULT_HEROES[3], 'p2-hero2', 'player2', mapWidth - 4, mapHeight - 4) ],
        resources: { wood: 10, stone: 5, iron: 2, food: 15, water: 15 }, hand: [], deck: [], buildings: [], actionsSubmitted: false,
      }
    };

    // Determine turn order based on highest speed hero
    const allHeroes = Object.values(players).flatMap(p => p.heroes);
    const fastestHero = allHeroes.sort((a, b) => b.stats.spd - a.stats.spd)[0];
    const firstPlayer = fastestHero.owner;
    const secondPlayer = firstPlayer === 'player1' ? 'player2' : 'player1';
    const turnOrder = [firstPlayer, secondPlayer];

    const gameState: GameState = {
      phase: 'planning', turn: 1, grid, players, pendingActions: { player1: [], player2: [] }, mapWidth, mapHeight,
    };
    
    set({ gameState, activePlayerId: firstPlayer, turnOrder });
    get().updateVisibility();
    get().endTurn(); // Call endTurn to set initial camera
  },
  
  selectHero: (heroId) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === heroId);
    if (hero && hero.owner === activePlayerId) {
      set({ selectedHero: heroId, currentPath: null });
    } else {
      set({ selectedHero: null, currentPath: null });
    }
  },
  
  setHoveredTile: (q, r) => {
    const { gameState, selectedHero } = get();
    if (!gameState || !selectedHero) {
      set({ hoveredTile: { q, r } });
      return;
    }
    
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === selectedHero);
    if (!hero || !hero.alive || hero.hasMoved) {
      set({ hoveredTile: { q, r }, currentPath: null });
      return;
    }
    
    const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r);
    const truncated = fullPath ? truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov) : null;
    set({ hoveredTile: { q, r }, currentPath: truncated });
  },
  
  clearHover: () => set({ hoveredTile: null, currentPath: null }),
  
  moveHero: (heroId, q, r) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;
    
    const player = gameState.players[activePlayerId];
    const hero = player?.heroes.find(h => h.id === heroId);
    if (!hero || !hero.alive || hero.hasMoved) return;
    
    const fullPath = findPath(gameState.grid, hero.position.q, hero.position.r, q, r);
    if (!fullPath || fullPath.length < 2) return;
    
    const truncated = truncatePathToMovement(fullPath, gameState.grid, hero.stats.mov);
    if (!truncated || truncated.length < 2) return;
    
    const dest = truncated[truncated.length - 1];
    hero.position = { q: dest.q, r: dest.r };
    hero.hasMoved = true;
    
    set({ gameState: { ...gameState }, selectedHero: null, currentPath: null });
    get().updateVisibility();
  },

  attackHero: (attackerId: string, targetId: string) => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;

    const attacker = gameState.players[activePlayerId]?.heroes.find(h => h.id === attackerId);
    const targetPlayer = Object.values(gameState.players).find(p => p.heroes.some(h => h.id === targetId));
    const target = targetPlayer?.heroes.find(h => h.id === targetId);

    if (!attacker || !target || attacker.owner === target.owner || attacker.hasAttacked) return;

    const dist = octileDistance(attacker.position.q, attacker.position.r, target.position.q, target.position.r);
    if (dist > attacker.stats.rng) return; // Out of range

    const damage = Math.max(1, attacker.stats.atk - target.stats.def);
    target.stats.hp -= damage;
    if (target.stats.hp <= 0) {
      target.stats.hp = 0;
      target.alive = false;
    }
    attacker.hasAttacked = true;

    set({ gameState: { ...gameState }, selectedHero: null });
  },
  
  endTurn: () => {
    const { gameState, activePlayerId, turnOrder } = get();
    if (!gameState || !activePlayerId) return;

    const currentIndex = turnOrder.indexOf(activePlayerId);
    const nextIndex = (currentIndex + 1) % turnOrder.length;
    const nextPlayerId = turnOrder[nextIndex];

    // If we've completed a full round, increment turn and reset actions
    if (nextIndex === 0) {
      gameState.turn++;
      for (const player of Object.values(gameState.players)) {
        for (const hero of player.heroes) {
          hero.hasMoved = false;
          hero.hasAttacked = false;
        }
      }
    }

    // Set camera for the next player
    const activePlayer = gameState.players[nextPlayerId];
    const opponentId = turnOrder.find(id => id !== nextPlayerId)!;
    const opponent = gameState.players[opponentId];

    const playerMidpoint = getPlayerHeroMidpoint(activePlayer);
    const opponentMidpoint = getPlayerHeroMidpoint(opponent);
    
    const toOpponent = opponentMidpoint.clone().sub(playerMidpoint);
    const angle = Math.atan2(toOpponent.x, toOpponent.z) + Math.PI; // Look from behind

    set({
      gameState: { ...gameState },
      activePlayerId: nextPlayerId,
      selectedHero: null,
      cameraConfig: {
        target: playerMidpoint,
        angle,
        zoom: 60,
      }
    });
  },
  
  updateVisibility: () => {
    const { gameState, activePlayerId } = get();
    if (!gameState || !activePlayerId) return;
    
    const player = gameState.players[activePlayerId];
    if (!player) return;
    
    for (const row of gameState.grid) {
      for (const tile of row) {
        if (tile.visible === 'visible') tile.visible = 'explored';
      }
    }
    
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

function truncatePathToMovement(
  path: { q: number; r: number }[],
  grid: Tile[][],
  maxMov: number
): { q: number; r: number }[] {
  if (path.length <= 1) return path;
  const result = [path[0]];
  let spent = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i];
    const tile = grid[cur.r][cur.q];
    const base = TERRAIN_CONFIG[tile.terrain].moveCost;
    const isDiag = prev.q !== cur.q && prev.r !== cur.r;
    const cost = base * (isDiag ? 1.414 : 1);
    if (spent + cost > maxMov) break;
    spent += cost;
    result.push(cur);
  }
  return result;
}
