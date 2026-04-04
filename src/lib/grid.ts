// === Octile Grid Engine ===
// 8-way square grid with octagonal visual representation

import { Tile, TerrainType, TERRAIN_CONFIG } from './types';

// 8 directions: N, NE, E, SE, S, SW, W, NW
export const DIRECTIONS = [
  { dq: 0, dr: -1 },  // N
  { dq: 1, dr: -1 },  // NE
  { dq: 1, dr: 0 },   // E
  { dq: 1, dr: 1 },   // SE
  { dq: 0, dr: 1 },   // S
  { dq: -1, dr: 1 },  // SW
  { dq: -1, dr: 0 },  // W
  { dq: -1, dr: -1 }, // NW
] as const;

/**
 * Generate a procedural map using simplex-like noise
 */
export function generateGrid(width: number, height: number, seed = 42): Tile[][] {
  const grid: Tile[][] = [];
  
  // Simple seeded pseudo-random
  const random = seedRandom(seed);
  
  for (let r = 0; r < height; r++) {
    const row: Tile[] = [];
    for (let q = 0; q < width; q++) {
      // Simple noise-based terrain assignment
      const nx = q / width;
      const ny = r / height;
      const noise = pseudoNoise(nx * 4, ny * 4, seed);
      
      let terrain: TerrainType;
      if (noise < 0.15) terrain = 'water';
      else if (noise < 0.35) terrain = 'plains';
      else if (noise < 0.55) terrain = 'forest';
      else if (noise < 0.75) terrain = 'plains';
      else if (noise < 0.88) terrain = 'mountain';
      else terrain = 'ruins';
      
      let resourceType: Tile['resourceType'] = undefined;
      let resourceAmount: Tile['resourceAmount'] = undefined;
      if (terrain === 'forest' && random() > 0.5) {
        resourceType = 'wood';
        resourceAmount = Math.floor(random() * 5) + 1;
      }
      if (terrain === 'mountain' && random() > 0.6) {
        resourceType = random() > 0.7 ? 'iron' : 'stone';
        resourceAmount = Math.floor(random() * 4) + 1;
      }
      if (terrain === 'plains' && random() > 0.7) {
        resourceType = 'food';
        resourceAmount = Math.floor(random() * 6) + 2;
      }
      
      row.push({
        q, r,
        terrain,
        elevation: TERRAIN_CONFIG[terrain].elevation + (random() * 0.05),
        resourceType,
        resourceAmount,
        visible: 'unexplored',
      });
    }
    grid.push(row);
  }
  
  // Ensure spawn corners are plains
  ensureSpawnArea(grid, 1, 1, 3);
  ensureSpawnArea(grid, width - 2, height - 2, 3);
  
  return grid;
}

function ensureSpawnArea(grid: Tile[][], centerQ: number, centerR: number, radius: number) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dq = -radius; dq <= radius; dq++) {
      const r = centerR + dr;
      const q = centerQ + dq;
      if (r >= 0 && r < grid.length && q >= 0 && q < grid[0].length) {
        grid[r][q].terrain = 'plains';
        grid[r][q].elevation = 0;
        if (Math.abs(dr) <= 1 && Math.abs(dq) <= 1) {
          grid[r][q].resourceType = undefined;
        }
      }
    }
  }
}

/**
 * Get valid neighbors for a tile (8-connected)
 */
export function getNeighbors(grid: Tile[][], q: number, r: number): Tile[] {
  const neighbors: Tile[] = [];
  for (const dir of DIRECTIONS) {
    const nq = q + dir.dq;
    const nr = r + dir.dr;
    if (nr >= 0 && nr < grid.length && nq >= 0 && nq < grid[0].length) {
      neighbors.push(grid[nr][nq]);
    }
  }
  return neighbors;
}

/**
 * A* pathfinding on octile grid
 */
export function findPath(
  grid: Tile[][],
  startQ: number, startR: number,
  endQ: number, endR: number,
  maxCost: number = Infinity
): { q: number; r: number }[] | null {
  const key = (q: number, r: number) => `${q},${r}`;
  const start = key(startQ, startR);
  const end = key(endQ, endR);
  
  if (start === end) return [{ q: startQ, r: startR }];
  
  const open = new Map<string, { q: number; r: number; g: number; f: number }>();
  const closed = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  
  open.set(start, { q: startQ, r: startR, g: 0, f: octileDistance(startQ, startR, endQ, endR) });
  gScore.set(start, 0);
  
  while (open.size > 0) {
    // Find lowest f-score
    let current: { q: number; r: number; g: number; f: number } | null = null;
    let currentKey = '';
    for (const [k, v] of open) {
      if (!current || v.f < current.f) { current = v; currentKey = k; }
    }
    if (!current) break;
    
    if (currentKey === end) {
      // Reconstruct path
      const path: { q: number; r: number }[] = [];
      let step: string | undefined = end;
      while (step) {
        const [sq, sr] = step.split(',').map(Number);
        path.unshift({ q: sq, r: sr });
        step = cameFrom.get(step);
      }
      return path;
    }
    
    open.delete(currentKey);
    closed.add(currentKey);
    
    for (const dir of DIRECTIONS) {
      const nq = current.q + dir.dq;
      const nr = current.r + dir.dr;
      const nKey = key(nq, nr);
      
      if (closed.has(nKey)) continue;
      if (nr < 0 || nr >= grid.length || nq < 0 || nq >= grid[0].length) continue;
      
      const tile = grid[nr][nq];
      const moveCost = TERRAIN_CONFIG[tile.terrain].moveCost;
      if (moveCost >= 99) continue; // impassable
      
      const isDiagonal = dir.dq !== 0 && dir.dr !== 0;
      const stepCost = moveCost * (isDiagonal ? 1.414 : 1);
      const tentativeG = (gScore.get(currentKey) || 0) + stepCost;
      
      if (tentativeG > maxCost) continue;
      
      if (!gScore.has(nKey) || tentativeG < (gScore.get(nKey) || Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, currentKey);
        const f = tentativeG + octileDistance(nq, nr, endQ, endR);
        open.set(nKey, { q: nq, r: nr, g: tentativeG, f });
      }
    }
  }
  
  return null; // no path found
}

/**
 * Octile distance heuristic
 */
export function octileDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dx = Math.abs(q1 - q2);
  const dy = Math.abs(r1 - r2);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Line of sight using Bresenham's adapted for octile grid
 */
export function hasLineOfSight(grid: Tile[][], q1: number, r1: number, q2: number, r2: number): boolean {
  const tiles = bresenhamLine(q1, r1, q2, r2);
  for (let i = 1; i < tiles.length - 1; i++) { // skip start and end
    const { q, r } = tiles[i];
    if (r < 0 || r >= grid.length || q < 0 || q >= grid[0].length) return false;
    if (TERRAIN_CONFIG[grid[r][q].terrain].blocksLoS) return false;
  }
  return true;
}

/**
 * Calculate visible tiles from a position
 */
export function calculateVisibility(grid: Tile[][], q: number, r: number, range: number): Set<string> {
  const visible = new Set<string>();
  visible.add(`${q},${r}`);
  
  // Cast rays in all directions
  const steps = range * 8; // more steps = smoother circle
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const endQ = Math.round(q + Math.cos(angle) * range);
    const endR = Math.round(r + Math.sin(angle) * range);
    
    const line = bresenhamLine(q, r, endQ, endR);
    for (const point of line) {
      if (point.r < 0 || point.r >= grid.length || point.q < 0 || point.q >= grid[0].length) break;
      visible.add(`${point.q},${point.r}`);
      if (TERRAIN_CONFIG[grid[point.r][point.q].terrain].blocksLoS && !(point.q === q && point.r === r)) break;
    }
  }
  
  return visible;
}

// === Utilities ===

function bresenhamLine(q1: number, r1: number, q2: number, r2: number): { q: number; r: number }[] {
  const points: { q: number; r: number }[] = [];
  let dq = Math.abs(q2 - q1);
  let dr = Math.abs(r2 - r1);
  let q = q1, r = r1;
  const sq = q1 < q2 ? 1 : -1;
  const sr = r1 < r2 ? 1 : -1;
  let err = dq - dr;
  
  while (true) {
    points.push({ q, r });
    if (q === q2 && r === r2) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; q += sq; }
    if (e2 < dq) { err += dq; r += sr; }
  }
  
  return points;
}

function seedRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pseudoNoise(x: number, y: number, seed: number): number {
  // Simple value noise
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  
  const hash = (a: number, b: number) => {
    let h = seed + a * 374761393 + b * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
  };
  
  const v00 = hash(ix, iy);
  const v10 = hash(ix + 1, iy);
  const v01 = hash(ix, iy + 1);
  const v11 = hash(ix + 1, iy + 1);
  
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  
  return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
}
