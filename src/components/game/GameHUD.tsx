'use client';

import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '@/lib/game-store';
import { Hero } from '@/lib/types';

export default function GameHUD() {
  const store = useGameStore();
  const { gameState, selectedHero, activePlayerId, endTurn } = store;
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);

  const handleEndTurn = useCallback(() => {
    if (showEndTurnConfirm) {
      endTurn();
      setShowEndTurnConfirm(false);
    } else {
      setShowEndTurnConfirm(true);
    }
  }, [showEndTurnConfirm, endTurn]);

  const handleCancelEndTurn = useCallback(() => {
    setShowEndTurnConfirm(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); handleEndTurn(); }
      if (e.code === 'Escape') {
        if (showEndTurnConfirm) handleCancelEndTurn();
        else store.selectHero(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleEndTurn, handleCancelEndTurn, showEndTurnConfirm, store]);

  if (!gameState || !activePlayerId) return null;

  const player = gameState.players[activePlayerId];
  if (!player) return null;

  const selectedHeroData = player.heroes.find(h => h.id === selectedHero);

  return (
    <div className="absolute inset-0 pointer-events-none font-mono">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 text-xs">
          <div className="text-cyan-400 font-bold mb-1">
            ROUND {gameState.turn} - {gameState.players[activePlayerId]?.name}'s Turn
          </div>
          <div className="text-gray-400">{gameState.phase.toUpperCase()}</div>
        </div>
        
        <div className="pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-2 text-xs flex gap-4">
          {Object.entries(player.resources).map(([key, value]) => (
            <ResourceBadge key={key} label={key.slice(0, 2).toUpperCase()} value={value} />
          ))}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-4 justify-center">
        {player.heroes.map(hero => (
          <HeroCard
            key={hero.id}
            hero={hero}
            isSelected={selectedHero === hero.id}
            onSelect={() => store.selectHero(hero.alive ? hero.id : null)}
          />
        ))}
        
        <button
          onClick={handleEndTurn}
          className="pointer-events-auto bg-cyan-900/50 hover:bg-cyan-800/50 border border-cyan-500/50 rounded px-6 py-3 text-sm text-cyan-400 font-bold uppercase tracking-wider transition-colors self-center"
        >
          End Turn <span className="text-gray-500 text-[10px]">[SPACE]</span>
        </button>
      </div>

      {showEndTurnConfirm && <EndTurnConfirm onConfirm={handleEndTurn} onCancel={handleCancelEndTurn} />}

      {selectedHeroData && (
        <div className="absolute top-20 left-4 pointer-events-auto bg-black/80 border border-cyan-900/50 rounded px-4 py-3 text-xs max-w-[200px]">
          <div className="text-cyan-400 font-bold mb-1">{selectedHeroData.name}</div>
          <div className="text-gray-500 text-[10px] italic mb-2">{selectedHeroData.lore}</div>
          {!selectedHeroData.hasMoved && <div className="text-gray-400">Click a tile to move</div>}
          {!selectedHeroData.hasAttacked && <div className="text-gray-400">Click an enemy to attack</div>}
        </div>
      )}
    </div>
  );
}

function HeroCard({ hero, isSelected, onSelect }: { hero: Hero; isSelected: boolean; onSelect: () => void }) {
  const hasActed = hero.hasMoved && hero.hasAttacked;
  return (
    <div
      className={`pointer-events-auto bg-black/80 border rounded px-4 py-3 text-xs min-w-[200px] cursor-pointer transition-all ${
        isSelected ? 'border-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'border-gray-700 hover:border-gray-500'
      } ${!hero.alive || hasActed ? 'opacity-40' : ''}`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-cyan-400 font-bold uppercase">{hero.name}</span>
        <div className="flex gap-1.5">
          <ActionIndicator label="M" done={hero.hasMoved} />
          <ActionIndicator label="A" done={hero.hasAttacked} />
        </div>
      </div>
      <div className="flex gap-3 text-[10px]">
        <StatBadge label="HP" value={`${hero.stats.hp}/${hero.stats.maxHp}`} />
        <StatBadge label="ATK" value={hero.stats.atk} />
        <StatBadge label="DEF" value={hero.stats.def} />
        <StatBadge label="MOV" value={hero.stats.mov} />
        <StatBadge label="SPD" value={hero.stats.spd} />
      </div>
      {hero.respawnTimer > 0 && <div className="mt-2 text-yellow-500">RESPAWNING ({hero.respawnTimer} turns)</div>}
    </div>
  );
}

const EndTurnConfirm = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-auto">
    <div className="bg-black/90 border border-cyan-500/50 rounded-lg px-8 py-6 text-center shadow-[0_0_30px_rgba(0,255,255,0.15)]">
      <div className="text-cyan-400 text-lg font-bold mb-4">END TURN?</div>
      <div className="text-gray-400 text-xs mb-6">You will pass control to the next player.</div>
      <div className="flex gap-4 justify-center">
        <button onClick={onConfirm} className="bg-cyan-900/50 hover:bg-cyan-700/50 border border-cyan-500 rounded px-6 py-2 text-cyan-400 text-sm uppercase tracking-wider">Confirm</button>
        <button onClick={onCancel} className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600 rounded px-6 py-2 text-gray-400 text-sm uppercase tracking-wider">Cancel</button>
      </div>
    </div>
  </div>
);

const ResourceBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2"><span className="text-gray-400">{label}</span><span className="text-white font-bold">{value}</span></div>
);
const StatBadge = ({ label, value }: { label: string; value: number | string }) => (
  <div><span className="text-gray-500">{label}</span> <span className="text-white">{value}</span></div>
);
const ActionIndicator = ({ label, done }: { label: string; done: boolean }) => (
  <div className={`w-4 h-4 text-center text-[10px] leading-4 rounded-sm ${done ? 'bg-gray-700 text-gray-500' : 'bg-cyan-800 text-cyan-300'}`}>{label}</div>
);
