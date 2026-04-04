'use client';

import { useGameStore } from '@/lib/game-store';

export default function GameHUD() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHero = useGameStore(s => s.selectedHero);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const submitTurn = useGameStore(s => s.submitTurn);

  if (!gameState) return null;

  const player = gameState.players[localPlayerId];
  if (!player) return null;

  const selectedHeroData = player.heroes.find(h => h.id === selectedHero);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 font-mono text-xs">
          <div className="text-cyan-400 font-bold mb-1">TURN {gameState.turn}</div>
          <div className="text-gray-400">{gameState.phase.toUpperCase()}</div>
        </div>
        
        {/* Resources */}
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 font-mono text-xs flex gap-4">
          <ResourceBadge label="WD" value={player.resources.wood} color="#4a3520" />
          <ResourceBadge label="ST" value={player.resources.stone} color="#666666" />
          <ResourceBadge label="IR" value={player.resources.iron} color="#8888aa" />
          <ResourceBadge label="FD" value={player.resources.food} color="#447733" />
          <ResourceBadge label="WA" value={player.resources.water} color="#3344aa" />
        </div>
      </div>

      {/* Bottom panel — hero info + actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-4 justify-center">
        {/* Hero cards */}
        {player.heroes.map(hero => (
          <div
            key={hero.id}
            className={`pointer-events-auto bg-black/80 border rounded px-4 py-3 font-mono text-xs min-w-[180px] cursor-pointer transition-all ${
              selectedHero === hero.id
                ? 'border-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]'
                : 'border-gray-700 hover:border-gray-500'
            } ${!hero.alive ? 'opacity-40' : ''}`}
            onClick={() => useGameStore.getState().selectHero(hero.alive ? hero.id : null)}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-cyan-400 font-bold uppercase">{hero.name}</span>
              <span className="text-gray-500">{hero.archetype.toUpperCase()}</span>
            </div>
            <div className="flex gap-3 text-[10px]">
              <StatBadge label="HP" value={`${hero.stats.hp}/${hero.stats.maxHp}`} />
              <StatBadge label="ATK" value={hero.stats.atk} />
              <StatBadge label="DEF" value={hero.stats.def} />
              <StatBadge label="MOV" value={hero.stats.mov} />
              <StatBadge label="RNG" value={hero.stats.rng} />
              <StatBadge label="VIS" value={hero.stats.vis} />
            </div>
            {hero.respawnTimer > 0 && (
              <div className="mt-2 text-yellow-500">RESPAWNING ({hero.respawnTimer} turns)</div>
            )}
          </div>
        ))}
        
        {/* End Turn button */}
        <button
          onClick={submitTurn}
          className="pointer-events-auto bg-cyan-900/50 hover:bg-cyan-800/50 border border-cyan-500/50 rounded px-6 py-3 font-mono text-sm text-cyan-400 font-bold uppercase tracking-wider transition-colors self-center"
        >
          END TURN
        </button>
      </div>

      {/* Selected hero detail */}
      {selectedHeroData && (
        <div className="absolute top-20 left-4 pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-3 font-mono text-xs max-w-[200px]">
          <div className="text-cyan-400 font-bold mb-1">{selectedHeroData.name}</div>
          <div className="text-gray-500 text-[10px] italic mb-2">{selectedHeroData.lore}</div>
          <div className="text-gray-400">Click a tile to move</div>
          <div className="text-gray-500 text-[10px]">Range: {selectedHeroData.stats.mov} tiles</div>
        </div>
      )}
    </div>
  );
}

function ResourceBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <span className="text-gray-500">{label} </span>
      <span className="text-white">{value}</span>
    </div>
  );
}
