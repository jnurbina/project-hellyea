import { Hero } from '@/lib/types';
import { useGameStore } from '@/lib/game-store';

interface TileInfoPanelProps {
  hero: Hero;
}

export default function TileInfoPanel({ hero }: TileInfoPanelProps) {
  const gameState = useGameStore(s => s.gameState);
  if (!gameState) return null;

  const tile = gameState.grid[hero.position.r]?.[hero.position.q];
  if (!tile) return null;

  return (
    <div className="bg-black/80 border border-gray-700 rounded px-3 py-2 text-xs min-w-[180px]">
      <div className="text-gray-400 font-bold mb-1">TILE INFO</div>
      <div>Terrain: {tile.terrain}</div>
      <div>Elevation: {tile.elevation.toFixed(2)}</div>
      {tile.resourceType && (
        <>
          <div>Resource: {tile.resourceType}</div>
          <div>Quantity: {tile.resourceAmount || 0}</div>
        </>
      )}
    </div>
  );
}
