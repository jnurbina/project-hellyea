'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, CameraConfig } from '@/lib/game-store';
import { octileDistance } from '@/lib/grid';
import OctileTileMesh from './OctileTile';

/**
 * Full camera controller:
 * - Animates to store's cameraConfig on turn change
 * - Left-drag rotates, right-drag pans, scroll zooms
 * - WASD pans, QE rotates (all relative to current angle)
 * - User input interrupts the snap animation
 */
function CameraController() {
  const { camera, gl } = useThree();
  const cameraConfig = useGameStore(s => s.cameraConfig);

  // Live camera state (refs so they persist across frames without re-renders)
  const targetRef = useRef(new THREE.Vector3(10, 0, 10));
  const angleRef = useRef(Math.PI / 4);
  const zoomRef = useRef(60);
  const distanceRef = useRef(15);

  // Animation state
  const animatingRef = useRef(false);
  const animTargetRef = useRef<CameraConfig | null>(null);
  const animProgressRef = useRef(0);

  // Input state
  const keysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef<'left' | 'right' | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragDistRef = useRef(0);

  const PAN_SPEED = 0.3;
  const ROTATE_SPEED = 0.02;
  const MOUSE_ROTATE_SPEED = 0.008;
  const MOUSE_PAN_SPEED = 0.05;
  const ELEVATION = 15;

  // When store pushes a new cameraConfig, start animating toward it
  useEffect(() => {
    if (!cameraConfig) return;
    animTargetRef.current = cameraConfig;
    animProgressRef.current = 0;
    animatingRef.current = true;
  }, [cameraConfig]);

  // Expose drag state for click suppression
  useEffect(() => {
    (window as any).__cameraDragDist = dragDistRef;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => { keysRef.current.add(e.key.toLowerCase()); };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key.toLowerCase()); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      animatingRef.current = false; // user took control
      zoomRef.current = Math.max(20, Math.min(120, zoomRef.current - e.deltaY * 0.08));
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

      animatingRef.current = false; // user took control

      if (drag === 'left') {
        angleRef.current -= dx * MOUSE_ROTATE_SPEED;
      } else {
        const angle = angleRef.current;
        const rightX = Math.cos(angle);
        const rightZ = -Math.sin(angle);
        const forwardX = -Math.sin(angle);
        const forwardZ = -Math.cos(angle);
        const zf = MOUSE_PAN_SPEED / (zoomRef.current * 0.02);
        targetRef.current.x -= (dx * rightX + dy * forwardX) * zf;
        targetRef.current.z -= (dx * rightZ + dy * forwardZ) * zf;
      }
    };
    const onMouseUp = () => { isDraggingRef.current = null; };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const keys = keysRef.current;

    // WASD/QE interrupts animation
    if (keys.size > 0) animatingRef.current = false;

    // Keyboard controls
    const angle = angleRef.current;
    const fX = -Math.sin(angle), fZ = -Math.cos(angle);
    const rX = Math.cos(angle), rZ = -Math.sin(angle);
    if (keys.has('w')) { targetRef.current.x += fX * PAN_SPEED; targetRef.current.z += fZ * PAN_SPEED; }
    if (keys.has('s')) { targetRef.current.x -= fX * PAN_SPEED; targetRef.current.z -= fZ * PAN_SPEED; }
    if (keys.has('a')) { targetRef.current.x -= rX * PAN_SPEED; targetRef.current.z -= rZ * PAN_SPEED; }
    if (keys.has('d')) { targetRef.current.x += rX * PAN_SPEED; targetRef.current.z += rZ * PAN_SPEED; }
    if (keys.has('q')) angleRef.current -= ROTATE_SPEED;
    if (keys.has('e')) angleRef.current += ROTATE_SPEED;

    // Snap animation (smooth lerp toward target config)
    if (animatingRef.current && animTargetRef.current) {
      animProgressRef.current = Math.min(1, animProgressRef.current + delta * 2.5);
      const t = smoothstep(animProgressRef.current);

      targetRef.current.lerp(animTargetRef.current.target, t * 0.15);
      angleRef.current = THREE.MathUtils.lerp(angleRef.current, animTargetRef.current.angle, t * 0.15);
      zoomRef.current = THREE.MathUtils.lerp(zoomRef.current, animTargetRef.current.zoom, t * 0.15);

      if (animProgressRef.current >= 1) animatingRef.current = false;
    }

    // Apply to camera
    const ortho = camera as THREE.OrthographicCamera;
    const dist = distanceRef.current;
    camera.position.set(
      targetRef.current.x + Math.sin(angleRef.current) * dist,
      ELEVATION,
      targetRef.current.z + Math.cos(angleRef.current) * dist
    );
    camera.lookAt(targetRef.current);
    ortho.zoom = zoomRef.current;
    ortho.updateProjectionMatrix();
  });

  return null;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function GameScene() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHero = useGameStore(s => s.selectedHero);
  const hoveredTile = useGameStore(s => s.hoveredTile);
  const currentPath = useGameStore(s => s.currentPath);
  const activePlayerId = useGameStore(s => s.activePlayerId);
  const selectHero = useGameStore(s => s.selectHero);
  const setHoveredTile = useGameStore(s => s.setHoveredTile);
  const clearHover = useGameStore(s => s.clearHover);
  const moveHero = useGameStore(s => s.moveHero);
  const attackHero = useGameStore(s => s.attackHero);

  const allHeroes = useMemo(() =>
    gameState ? Object.values(gameState.players).flatMap(p => [...p.heroes]) : [],
    [gameState]
  );
  const selectedHeroData = allHeroes.find(h => h.id === selectedHero);

  const pathSet = useMemo(() => {
    if (!currentPath) return new Set<string>();
    return new Set(currentPath.map(p => `${p.q},${p.r}`));
  }, [currentPath]);

  const heroPositions = useMemo(() => {
    const map = new Map<string, { heroId: string; color: string; owner: string }>();
    allHeroes.forEach(hero => {
      if (!hero.alive) return;
      const key = `${hero.position.q},${hero.position.r}`;
      const color = hero.owner === 'player1' ? '#00ccff' : '#ff4444';
      map.set(key, { heroId: hero.id, color, owner: hero.owner });
    });
    return map;
  }, [allHeroes]);

  if (!gameState) return null;

  const { grid, mapWidth, mapHeight } = gameState;

  return (
    <>
      <OrthographicCamera makeDefault zoom={60} position={[10, 15, 30]} />
      <CameraController />

      {/* Lighting — noir */}
      <ambientLight intensity={0.25} color="#334455" />
      <directionalLight position={[15, 25, 10]} intensity={0.7} color="#99aacc" />
      <directionalLight position={[-10, 15, -10]} intensity={0.25} color="#223344" />

      <fog attach="fog" args={['#060810', 35, 70]} />

      {/* Grid */}
      {grid.map((row, r) =>
        row.map((tile, q) => {
          const tileKey = `${q},${r}`;
          const heroOnTile = heroPositions.get(tileKey);

          let isAttackable = false;
          if (selectedHeroData && heroOnTile && heroOnTile.owner !== activePlayerId && !selectedHeroData.hasAttacked) {
            const dist = octileDistance(selectedHeroData.position.q, selectedHeroData.position.r, q, r);
            if (dist <= selectedHeroData.stats.rng) isAttackable = true;
          }

          return (
            <OctileTileMesh
              key={tileKey}
              tile={tile}
              isHighlighted={hoveredTile?.q === q && hoveredTile?.r === r}
              isPath={pathSet.has(tileKey)}
              isSelected={heroOnTile?.heroId === selectedHero}
              hasHero={!!heroOnTile && tile.visible === 'visible'}
              heroColor={heroOnTile?.color}
              isEnemy={!!heroOnTile && heroOnTile.owner !== activePlayerId}
              isAttackable={isAttackable}
              onClick={() => {
                // Suppress clicks if user was dragging
                if (((window as any).__cameraDragDist?.current ?? 0) > 8) return;
                if (isAttackable && selectedHero) {
                  attackHero(selectedHero, heroOnTile!.heroId);
                } else if (heroOnTile && heroOnTile.owner === activePlayerId) {
                  selectHero(heroOnTile.heroId);
                } else if (selectedHero) {
                  moveHero(selectedHero, q, r);
                }
              }}
              onPointerEnter={() => setHoveredTile(q, r)}
              onPointerLeave={clearHover}
            />
          );
        })
      )}
    </>
  );
}

export default function GameBoard() {
  return (
    <div className="w-full h-full bg-black">
      <Canvas>
        <GameScene />
      </Canvas>
    </div>
  );
}
