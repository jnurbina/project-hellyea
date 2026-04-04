'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useGameStore } from '@/lib/game-store';
import GameHUD from '@/components/game/GameHUD';

// Dynamic import to avoid SSR issues with Three.js
const GameBoard = dynamic(() => import('@/components/game/GameBoard'), { ssr: false });

export default function Home() {
  const [started, setStarted] = useState(false);
  const initGame = useGameStore(s => s.initGame);
  const gameState = useGameStore(s => s.gameState);

  const handleStart = () => {
    initGame(20, 20);
    setStarted(true);
  };

  if (!started || !gameState) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center font-mono">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2 tracking-[0.3em] uppercase">
            Project HellYea
          </h1>
          <p className="text-gray-500 text-sm mb-8">Isometric Turn-Based Strategy</p>
          <button
            onClick={handleStart}
            className="bg-cyan-900/30 hover:bg-cyan-800/50 border border-cyan-500/50 rounded px-8 py-3 text-cyan-400 font-mono text-sm uppercase tracking-wider transition-all hover:shadow-[0_0_20px_rgba(0,255,255,0.2)]"
          >
            Start Game
          </button>
          <p className="text-gray-600 text-[10px] mt-4 font-mono">20×20 • 4 Heroes • Hero Initiative • Pass &amp; Play</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      <GameBoard />
      <GameHUD />
    </div>
  );
}
