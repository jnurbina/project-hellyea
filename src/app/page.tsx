'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useGameStore } from '@/lib/game-store';
import GameHUD from '@/components/game/GameHUD';

// Dynamic import to avoid SSR issues with Three.js
const GameBoard = dynamic(() => import('@/components/game/GameBoard'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#1e2024]" />
});

// Global audio functions for SFX (accessible from other components)
let playSfxSelect: () => void = () => {};
let playSfxBlur: () => void = () => {};
export const playSelectSound = () => playSfxSelect();
export const playBlurSound = () => playSfxBlur();

export default function Home() {
  const [started, setStarted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const initGame = useGameStore(s => s.initGame);
  const gameState = useGameStore(s => s.gameState);

  // Audio refs
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxSelectRef = useRef<HTMLAudioElement | null>(null);
  const sfxBlurRef = useRef<HTMLAudioElement | null>(null);

  // Wait for client mount before rendering Canvas
  useEffect(() => {
    setMounted(true);
  }, []);

  // Set up global SFX functions
  useEffect(() => {
    playSfxSelect = () => {
      if (sfxSelectRef.current) {
        sfxSelectRef.current.currentTime = 0;
        sfxSelectRef.current.play().catch(() => {});
      }
    };
    playSfxBlur = () => {
      if (sfxBlurRef.current) {
        sfxBlurRef.current.currentTime = 0;
        sfxBlurRef.current.play().catch(() => {});
      }
    };
  }, []);

  const handleStart = useCallback(() => {
    // Play select sound
    if (sfxSelectRef.current) {
      sfxSelectRef.current.currentTime = 0;
      sfxSelectRef.current.play().catch(() => {});
    }
    // Start BGM
    if (bgmRef.current) {
      bgmRef.current.volume = 0.3;
      bgmRef.current.play().catch(() => {});
    }
    initGame(16, 16);
    setStarted(true);
  }, [initGame]);

  if (!mounted) {
    return <div className="h-screen w-screen bg-black" />;
  }

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
          <p className="text-gray-600 text-[10px] mt-4 font-mono">16×16 • 4 Heroes • Hero Initiative • Pass &amp; Play</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      {/* Audio elements */}
      <audio ref={bgmRef} src="/bgm.mp3" loop preload="auto" />
      <audio ref={sfxSelectRef} src="/sfxInputSelect.mp3" preload="auto" />
      <audio ref={sfxBlurRef} src="/sfxInputBlur.mp3" preload="auto" />

      <GameBoard />
      <GameHUD />
    </div>
  );
}
