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

// Global audio refs and functions for SFX (accessible from other components)
let bgmAudio: HTMLAudioElement | null = null;
let sfxSelectAudio: HTMLAudioElement | null = null;
let sfxBlurAudio: HTMLAudioElement | null = null;

export const playSelectSound = () => {
  if (sfxSelectAudio) {
    sfxSelectAudio.currentTime = 0;
    sfxSelectAudio.play().catch(() => {});
  }
};
export const playBlurSound = () => {
  if (sfxBlurAudio) {
    sfxBlurAudio.currentTime = 0;
    sfxBlurAudio.play().catch(() => {});
  }
};

type LoadingState = 'idle' | 'loading' | 'ready';

export default function Home() {
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const initGame = useGameStore(s => s.initGame);
  const gameState = useGameStore(s => s.gameState);

  // Wait for client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStart = useCallback(async () => {
    setLoadingState('loading');
    setLoadProgress(0);

    // Create audio elements
    const bgm = new Audio('/bgm.mp3');
    const sfxSelect = new Audio('/sfxInputSelect.mp3');
    const sfxBlur = new Audio('/sfxInputBlur.mp3');

    bgm.loop = true;
    bgm.volume = 0.15;
    sfxSelect.volume = 0.1;
    sfxBlur.volume = 0.1;

    // Track loading progress
    let loaded = 0;
    const totalAssets = 3;

    const onLoad = () => {
      loaded++;
      setLoadProgress(Math.round((loaded / totalAssets) * 100));
    };

    // Load all audio files
    await Promise.all([
      new Promise<void>((resolve) => {
        bgm.addEventListener('canplaythrough', () => { onLoad(); resolve(); }, { once: true });
        bgm.load();
      }),
      new Promise<void>((resolve) => {
        sfxSelect.addEventListener('canplaythrough', () => { onLoad(); resolve(); }, { once: true });
        sfxSelect.load();
      }),
      new Promise<void>((resolve) => {
        sfxBlur.addEventListener('canplaythrough', () => { onLoad(); resolve(); }, { once: true });
        sfxBlur.load();
      }),
    ]);

    // Store refs globally
    bgmAudio = bgm;
    sfxSelectAudio = sfxSelect;
    sfxBlurAudio = sfxBlur;

    // Initialize game
    initGame(16, 16);

    // Small delay for smoother transition
    await new Promise(r => setTimeout(r, 300));

    // Play select sound and start BGM
    sfxSelect.play().catch(() => {});
    bgm.play().catch(() => {});

    setLoadingState('ready');
  }, [initGame]);

  if (!mounted) {
    return <div className="h-screen w-screen bg-black" />;
  }

  // Landing screen
  if (loadingState === 'idle') {
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

  // Loading screen
  if (loadingState === 'loading' || !gameState) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center font-mono w-64">
          <h1 className="text-2xl font-bold text-cyan-400 mb-6 tracking-[0.2em] uppercase">
            Loading
          </h1>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-gray-500 text-xs">{loadProgress}%</p>
        </div>
      </div>
    );
  }

  // Game screen
  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      <GameBoard />
      <GameHUD />
    </div>
  );
}
