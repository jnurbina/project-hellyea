'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, CameraConfig, MoveAnimation } from '@/lib/game-store';
import OctileTileMesh from './OctileTile';

// === Camera Controller ===

function CameraController() {
  const { camera, gl } = useThree();
  const cameraConfig = useGameStore(s => s.cameraConfig);
  const resolutionLocked = useGameStore(s => s.resolutionLocked);

  const targetRef = useRef(new THREE.Vector3(10, 0, 10));
  const angleRef = useRef(Math.PI / 4);
  const zoomRef = useRef(120);
  const distanceRef = useRef(12);
  const animatingRef = useRef(false);
  const animTargetRef = useRef<CameraConfig | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef<'left' | 'right' | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragDistRef = useRef(0);

  const ELEVATION = 12;

  // When store pushes a new cameraConfig, snap to it
  useEffect(() => {
    if (!cameraConfig) return;
    animTargetRef.current = { ...cameraConfig, target: cameraConfig.target.clone() };
    animatingRef.current = true;
  }, [cameraConfig]);

  useEffect(() => {
    (window as any).__cameraDragDist = dragDistRef;
    (window as any).__cameraDebug = { targetRef, angleRef, zoomRef, distanceRef };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(30, Math.min(200, zoomRef.current - e.deltaY * 0.15));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isDraggingRef.current = 'left';
      else if (e.button === 2) isDraggingRef.current = 'right';
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      dragDistRef.current = 0;
    };
    const onMouseMove = (e: MouseEvent) => {
      const drag = isDraggingRef.current;
      if (!drag) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      dragDistRef.current += Math.abs(dx) + Math.abs(dy);
      
      // Any drag interrupts animation
      if (drag === 'left' || !useGameStore.getState().resolutionLocked) {
        animatingRef.current = false;
      }

      if (drag === 'left') {
        angleRef.current -= dx * 0.008;
      } else if (!useGameStore.getState().resolutionLocked) {
        const a = angleRef.current;
        const zf = 0.04 / (zoomRef.current * 0.015);
        targetRef.current.x -= (dx * Math.cos(a) + dy * -Math.sin(a)) * zf;
        targetRef.current.z -= (dx * -Math.sin(a) + dy * -Math.cos(a)) * zf;
      }
    };
    const onMouseUp = () => { isDraggingRef.current = null; };
    const onCtx = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onCtx);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const keys = keysRef.current;
    const locked = useGameStore.getState().resolutionLocked;

    // Keyboard interrupts animation (only if unlocked)
    if (!locked && keys.size > 0) animatingRef.current = false;

    // WASD pan only during planning
    if (!locked) {
      const a = angleRef.current;
      const spd = 0.3;
      if (keys.has('w')) { targetRef.current.x += -Math.sin(a) * spd; targetRef.current.z += -Math.cos(a) * spd; }
      if (keys.has('s')) { targetRef.current.x -= -Math.sin(a) * spd; targetRef.current.z -= -Math.cos(a) * spd; }
      if (keys.has('a')) { targetRef.current.x -= Math.cos(a) * spd; targetRef.current.z -= -Math.sin(a) * spd; }
      if (keys.has('d')) { targetRef.current.x += Math.cos(a) * spd; targetRef.current.z += -Math.sin(a) * spd; }
    }
    if (keys.has('q')) angleRef.current -= 0.02;
    if (keys.has('e')) angleRef.current += 0.02;

    // Smooth camera animation — actually reaches the target
    if (animatingRef.current && animTargetRef.current) {
      const lerpSpeed = 4 * delta; // ~4x per second, frame-rate independent
      const t = Math.min(lerpSpeed, 1);

      targetRef.current.lerp(animTargetRef.current.target, t);
      angleRef.current = THREE.MathUtils.lerp(angleRef.current, animTargetRef.current.angle, t);
      zoomRef.current = THREE.MathUtils.lerp(zoomRef.current, animTargetRef.current.zoom, t);

      // Stop when close enough
      const distToTarget = targetRef.current.distanceTo(animTargetRef.current.target);
      if (distToTarget < 0.05 && Math.abs(zoomRef.current - animTargetRef.current.zoom) < 0.5) {
        targetRef.current.copy(animTargetRef.current.target);
        zoomRef.current = animTargetRef.current.zoom;
        angleRef.current = animTargetRef.current.angle;
        animatingRef.current = false;
        
        // Signal that camera arrived (for resolution pacing)
        useGameStore.getState().onCameraArrived?.();
      }
    }

    const ortho = camera as THREE.OrthographicCamera;
    camera.position.set(
      targetRef.current.x + Math.sin(angleRef.current) * distanceRef.current,
      ELEVATION,
      targetRef.current.z + Math.cos(angleRef.current) * distanceRef.current
    );
    camera.lookAt(targetRef.current);
    ortho.zoom = zoomRef.current;
    ortho.updateProjectionMatrix();
  });

  return null;
}

// === Action Toolbar (HTML overlay anchored to hero's 3D position) ===

function ActionToolbar({ heroId }: { heroId: string }) {
  const gameState = useGameStore(s => s.gameState);
  const queuedActions = useGameStore(s => s.queuedActions);
  const setActionMode = useGameStore(s => s.setActionMode);

  const hero = useMemo(() => {
    if (!gameState) return null;
    return Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === heroId);
  }, [gameState, heroId]);

  if (!hero) return null;

  const queued = queuedActions[heroId];
  const hasQueuedMove = !!queued?.moveDest;
  const hasQueuedAttack = !!queued?.attackTargetId;

  return (
    <group position={[hero.position.q + 0.55, 0.5, hero.position.r]}>
      <Html center style={{ pointerEvents: 'auto' }}>
        <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
          {!hasQueuedMove && (
            <button
              onClick={(e) => { e.stopPropagation(); setActionMode('move'); }}
              className="w-7 h-7 rounded bg-green-900/80 hover:bg-green-700/90 border border-green-500/60 flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
              title="Move"
            >
              🥾
            </button>
          )}
          {hasQueuedMove && (
            <div className="w-7 h-7 rounded bg-green-900/30 border border-green-800/40 flex items-center justify-center text-[10px] text-green-600">✓</div>
          )}
          {!hasQueuedAttack && (
            <button
              onClick={(e) => { e.stopPropagation(); setActionMode('attack'); }}
              className="w-7 h-7 rounded bg-red-900/80 hover:bg-red-700/90 border border-red-500/60 flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
              title="Attack"
            >
              ⚔️
            </button>
          )}
          {hasQueuedAttack && (
            <div className="w-7 h-7 rounded bg-red-900/30 border border-red-800/40 flex items-center justify-center text-[10px] text-red-600">✓</div>
          )}
        </div>
      </Html>
    </group>
  );
}

// === Animated Hero ===

function AnimatedHero({ animation }: { animation: MoveAnimation }) {
  const meshRef = useRef<THREE.Group>(null);
  const tickMoveAnimation = useGameStore(s => s.tickMoveAnimation);
  const gameState = useGameStore(s => s.gameState);

  const hero = useMemo(() => {
    if (!gameState) return null;
    return Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === animation.heroId);
  }, [gameState, animation.heroId]);

  const color = hero?.owner === 'player1' ? '#00ccff' : '#ff4444';

  useFrame((_, delta) => {
    const anim = useGameStore.getState().moveAnimation;
    if (!anim || !meshRef.current) return;
    const from = anim.path[anim.currentIndex];
    const to = anim.path[Math.min(anim.currentIndex + 1, anim.path.length - 1)];
    const t = anim.progress;
    meshRef.current.position.set(
      from.q + (to.q - from.q) * t,
      Math.sin(t * Math.PI) * 0.12 + 0.15,
      from.r + (to.r - from.r) * t
    );
    tickMoveAnimation(delta);
  });

  return (
    <group ref={meshRef} position={[animation.path[0].q, 0.15, animation.path[0].r]}>
      <mesh position={[0, 0.2, 0]}>
        <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// === Game Scene ===

function GameScene() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHeroId = useGameStore(s => s.selectedHeroId);
  const actionMode = useGameStore(s => s.actionMode);
  const moveTiles = useGameStore(s => s.moveTiles);
  const attackTiles = useGameStore(s => s.attackTiles);
  const hoveredTile = useGameStore(s => s.hoveredTile);
  const currentPath = useGameStore(s => s.currentPath);
  const pendingTarget = useGameStore(s => s.pendingTarget);
  const moveAnimation = useGameStore(s => s.moveAnimation);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const queuedActions = useGameStore(s => s.queuedActions);
  const phase = useGameStore(s => s.phase);
  const handleTileClick = useGameStore(s => s.handleTileClick);
  const setHoveredTile = useGameStore(s => s.setHoveredTile);
  const clearHover = useGameStore(s => s.clearHover);

  const allHeroes = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );

  const pathSet = useMemo(() => {
    if (!currentPath) return new Set<string>();
    return new Set(currentPath.map(p => `${p.q},${p.r}`));
  }, [currentPath]);

  const queuedMoveIndicators = useMemo(() => {
    const indicators: { q: number; r: number }[] = [];
    for (const [heroId, action] of Object.entries(queuedActions)) {
      if (action.moveDest) indicators.push(action.moveDest);
    }
    return new Set(indicators.map(i => `${i.q},${i.r}`));
  }, [queuedActions]);

  const heroPositions = useMemo(() => {
    const map = new Map<string, { heroId: string; color: string; owner: string }>();
    allHeroes.forEach(hero => {
      if (!hero.alive) return;
      if (moveAnimation?.heroId === hero.id) return;
      const key = `${hero.position.q},${hero.position.r}`;
      const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
      map.set(key, { heroId: hero.id, color, owner: hero.owner });
    });
    return map;
  }, [allHeroes, moveAnimation]);

  if (!gameState) return null;
  const { grid, mapWidth, mapHeight } = gameState;

  return (
    <>
      <OrthographicCamera makeDefault zoom={120} position={[10, 12, 25]} />
      <CameraController />

      {/* Lighting */}
      <ambientLight intensity={0.6} color="#778899" />
      <directionalLight position={[20, 30, 15]} intensity={1.2} color="#bbccdd" />
      <directionalLight position={[-15, 20, -10]} intensity={0.5} color="#667788" />
      <hemisphereLight color="#667788" groundColor="#333344" intensity={0.4} />

      {/* Ground planes */}
      <mesh position={[mapWidth / 2 - 0.5, -0.5, mapHeight / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[mapWidth * 3, mapHeight * 3]} />
        <meshStandardMaterial color="#32353a" roughness={0.75} metalness={0.25} />
      </mesh>
      <mesh position={[mapWidth / 2 - 0.5, -0.08, mapHeight / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[mapWidth + 2, mapHeight + 2]} />
        <meshStandardMaterial color="#282a2e" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Grid */}
      {grid.map((row, r) =>
        row.map((tile, q) => {
          const tileKey = `${q},${r}`;
          const heroOnTile = heroPositions.get(tileKey);
          const isMoveRange = moveTiles.has(tileKey);
          const isAttackRange = attackTiles.has(tileKey);
          const isPending = pendingTarget?.q === q && pendingTarget?.r === r;
          const isActiveHero = heroOnTile?.heroId === selectedHeroId;
          const hasQueuedMove = queuedMoveIndicators.has(tileKey);

          return (
            <OctileTileMesh
              key={tileKey}
              tile={tile}
              isHighlighted={hoveredTile?.q === q && hoveredTile?.r === r}
              isPath={pathSet.has(tileKey)}
              isSelected={isActiveHero}
              hasHero={!!heroOnTile && tile.visible === 'visible'}
              heroColor={heroOnTile?.color}
              isEnemy={!!heroOnTile && heroOnTile.owner !== planningPlayerId}
              isMoveRange={isMoveRange}
              isAttackRange={isAttackRange}
              isPending={isPending}
              hasQueuedMove={hasQueuedMove}
              onClick={() => {
                if (((window as any).__cameraDragDist?.current ?? 0) > 8) return;
                handleTileClick(q, r);
              }}
              onPointerEnter={() => setHoveredTile(q, r)}
              onPointerLeave={clearHover}
            />
          );
        })
      )}

      {/* Action toolbar for selected hero */}
      {phase === 'planning' && selectedHeroId && actionMode === 'idle' && (
        <ActionToolbar heroId={selectedHeroId} />
      )}

      {moveAnimation && <AnimatedHero animation={moveAnimation} />}
    </>
  );
}

// === Debug ===

function DebugOverlay() {
  const [stats, setStats] = useState({ x: 0, z: 0, angle: 0, zoom: 0 });
  useEffect(() => {
    const iv = setInterval(() => {
      const d = (window as any).__cameraDebug;
      if (!d) return;
      setStats({ x: d.targetRef.current.x, z: d.targetRef.current.z, angle: (d.angleRef.current * 180 / Math.PI) % 360, zoom: d.zoomRef.current });
    }, 200);
    return () => clearInterval(iv);
  }, []);
  const phase = useGameStore(s => s.phase);
  const round = useGameStore(s => s.round);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const resolutionIndex = useGameStore(s => s.resolutionIndex);
  const resolutionOrder = useGameStore(s => s.resolutionOrder);
  const queuedActions = useGameStore(s => s.queuedActions);

  return (
    <div className="absolute top-16 right-4 z-50 pointer-events-none">
      <div className="bg-black/80 border border-gray-700 rounded px-3 py-2 font-mono text-[10px] text-gray-400 space-y-0.5 min-w-[220px]">
        <div className="text-gray-500 font-bold mb-1">DEBUG</div>
        <div>cam: ({stats.x.toFixed(1)}, {stats.z.toFixed(1)}) ∠{stats.angle.toFixed(0)}° z{stats.zoom.toFixed(0)}</div>
        <div className="border-t border-gray-800 mt-1 pt-1">round: {round} | phase: {phase}</div>
        <div>planning: {planningPlayerId}</div>
        <div>queued: {Object.keys(queuedActions).length}</div>
        {phase === 'resolution' && <div>resolving: {resolutionIndex}/{resolutionOrder.length}</div>}
      </div>
    </div>
  );
}

export default function GameBoard() {
  const [showDebug, setShowDebug] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === '`' || e.key === '~') { e.preventDefault(); setShowDebug(p => !p); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="w-full h-full bg-[#1e2024] relative">
      <Canvas>
        <GameScene />
      </Canvas>
      {showDebug && <DebugOverlay />}
      <div className="absolute bottom-2 right-2 text-gray-600 text-[9px] font-mono pointer-events-none">` debug</div>
    </div>
  );
}
