'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, CameraConfig, MoveAnimation, DamageIndicator, GatherAnimation, AttackAnimation } from '@/lib/game-store';
import OctileTileMesh from './OctileTile';

// === Camera Controller ===

function CameraController() {
  const { camera, gl } = useThree();
  const cameraConfig = useGameStore(s => s.cameraConfig);
  const cameraConfigVersion = useGameStore(s => s.cameraConfigVersion);
  const resolutionLocked = useGameStore(s => s.resolutionLocked);
  const onCameraArrived = useGameStore(s => s.onCameraArrived);

  const targetRef = useRef(new THREE.Vector3(10, 0, 10));
  const angleRef = useRef(Math.PI / 4);
  const zoomRef = useRef(120);
  const distanceRef = useRef(12);
  const animatingRef = useRef(false);
  const animTargetRef = useRef<CameraConfig | null>(null);
  const pendingAnimRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef<'left' | 'right' | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragDistRef = useRef(0);

  const ELEVATION = 12;

  useEffect(() => {
    if (!cameraConfig) return;
    animTargetRef.current = { ...cameraConfig, target: cameraConfig.target.clone() };
    pendingAnimRef.current = true;
  }, [cameraConfigVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (window as any).__cameraDragDist = dragDistRef;
    // Ortho bounds are static based on canvas size - use defaults that match OrthographicCamera
    (window as any).__cameraDebug = {
      targetRef,
      angleRef,
      zoomRef,
      distanceRef,
      orthoLeft: -10,
      orthoRight: 10,
      orthoTop: 10,
      orthoBottom: -10
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(66, Math.min(200, zoomRef.current - e.deltaY * 0.15));
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
      
      if (drag === 'left' || !useGameStore.getState().resolutionLocked) {
        // Only left drag or non-resolution pan interrupts animation
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

    // Pick up pending animation (set by useEffect, immune to mouse race)
    if (pendingAnimRef.current) {
      pendingAnimRef.current = false;
      animatingRef.current = true;
    }

    // Only camera-control keys (WASD/QE) interrupt animation
    const cameraKeys = ['w', 'a', 's', 'd', 'q', 'e'];
    const hasCameraKey = cameraKeys.some(k => keys.has(k));
    if (!locked && hasCameraKey) animatingRef.current = false;

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
        
        onCameraArrived?.(); // Notify store that camera has arrived
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
  const hasQueuedAttack = !!queued?.attackTargetTile;
  const hasQueuedGather = !!queued?.gatherTile;
  const hasBuiltTC = !!queued?.builtTC;

  // Gather locks out move/attack, move/attack lock out gather, building TC locks out all
  const gatherLocksActions = hasQueuedGather || hasBuiltTC;
  const actionsLockGather = hasQueuedMove || hasQueuedAttack || hasBuiltTC;

  // Check if hero is on a resource tile with resources
  const tile = gameState ? gameState.grid[hero.position.r]?.[hero.position.q] : null;
  // Also check pouch capacity
  const pouch = hero.inventory.resourcePouch;
  const currentPouchTotal = pouch?.resources
    ? Object.values(pouch.resources).reduce((sum, n) => sum + (n || 0), 0)
    : (pouch?.resourceAmount || 0);
  const hasSpace = currentPouchTotal < 5;
  const canGather = !!(tile?.resourceType && (tile.resourceAmount ?? 0) > 0) && hasSpace && !actionsLockGather;

  // If gather is queued or TC was built, show action used indicator
  if (hasQueuedGather || hasBuiltTC) {
    const indicatorColor = hasBuiltTC ? 'amber' : 'yellow';
    return (
      <group position={[hero.position.q + 0.55, 0.5, hero.position.r]}>
        <Html center zIndexRange={[0, 0]} style={{ pointerEvents: 'auto' }}>
          <div style={{ zIndex: -1, position: 'relative' }} className="flex flex-col gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className={`w-7 h-7 rounded bg-${indicatorColor}-900/30 border border-${indicatorColor}-800/40 flex items-center justify-center text-[10px] text-${indicatorColor}-600`}>
              {hasBuiltTC ? '🏰' : '✓'}
            </div>
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={[hero.position.q + 0.55, 0.5, hero.position.r]}>
      <Html center zIndexRange={[0, 0]} style={{ pointerEvents: 'auto' }}>
        <div style={{ zIndex: -1, position: 'relative' }} className="flex flex-col gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
          {/* Move Button */}
          {!hasQueuedMove && !gatherLocksActions && (
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
          {/* Attack Button */}
          {!hasQueuedAttack && !gatherLocksActions && (
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
          {/* Gather Button */}
          {canGather && (
            <button
              onClick={(e) => { e.stopPropagation(); setActionMode('gather'); }}
              className="w-7 h-7 rounded bg-yellow-900/80 hover:bg-yellow-700/90 border border-yellow-500/60 flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
              title="Gather Resources"
            >
              ⛏️
            </button>
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

  const { entity, entityType } = useMemo(() => {
    if (!gameState) return { entity: null, entityType: 'hero' as const };
    const hero = Object.values(gameState.players).flatMap(p => p.heroes).find(h => h.id === animation.heroId);
    if (hero) return { entity: hero, entityType: 'hero' as const };
    const unit = Object.values(gameState.players).flatMap(p => p.units).find(u => u.id === animation.heroId);
    if (unit) return { entity: unit, entityType: unit.unitType };
    return { entity: null, entityType: 'hero' as const };
  }, [gameState, animation.heroId]);

  const color = entity?.owner === 'player1' ? '#00ccff' : '#ff4444';

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

  // Render appropriate model based on entity type
  const renderModel = () => {
    if (entityType === 'scout') {
      return (
        <>
          <mesh position={[0, 0.2, 0]}>
            <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
        </>
      );
    } else if (entityType === 'farmer') {
      return (
        <>
          <mesh position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshStandardMaterial color="#44aa44" emissive="#44aa44" emissiveIntensity={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <coneGeometry args={[0.18, 0.12, 8]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
          </mesh>
        </>
      );
    } else {
      // Hero (default)
      return (
        <mesh position={[0, 0.2, 0]}>
          <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
        </mesh>
      );
    }
  };

  return (
    <group ref={meshRef} position={[animation.path[0].q, 0.15, animation.path[0].r]}>
      {renderModel()}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// === Floating Damage Indicator (HTML overlay) ===

function FloatingDamageIndicator({ indicator }: { indicator: DamageIndicator }) {
  const [offsetY, setOffsetY] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const animDuration = indicator.amount === 'MISS' ? 1200 : 1000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / animDuration;

      if (progress < 1) {
        setOffsetY(0.8 * progress); // Float up
        setOpacity(1 - progress); // Fade out
        requestAnimationFrame(animate);
      } else {
        setOffsetY(0.8);
        setOpacity(0);
      }
    };
    requestAnimationFrame(animate);
  }, [indicator]);

  const isMiss = indicator.amount === 'MISS';
  const text = isMiss ? 'MISS!' : `-${indicator.amount}`;
  const color = isMiss ? '#ff4444' : '#ffffff';
  const shadowColor = isMiss ? 'rgba(255,0,0,0.4)' : 'rgba(0,0,0,0.8)';

  return (
    <group position={[indicator.q, 0.5 + offsetY, indicator.r]}>
      <Html center style={{ pointerEvents: 'none', opacity }}>
        <div
          className="font-bold text-lg select-none"
          style={{
            color,
            textShadow: `0 0 8px ${shadowColor}, 0 0 4px ${shadowColor}`,
            whiteSpace: 'nowrap',
            animation: isMiss ? 'bounce 0.4s infinite alternate' : 'none',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  );
}

// === Path Line Visualization ===

function PathLine({ path, color = '#00ff88', grid }: { path: { q: number; r: number }[]; color?: string; grid?: import('@/lib/types').Tile[][] }) {
  const lineObj = useMemo(() => {
    if (!path || path.length < 2) return null;
    const points = path.map(p => {
      const elevation = grid?.[p.r]?.[p.q]?.elevation ?? 0;
      return new THREE.Vector3(p.q, elevation + 0.15, p.r);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    return new THREE.Line(geometry, material);
  }, [path, color, grid]);

  if (!lineObj) return null;

  return <primitive object={lineObj} />;
}

// === Ghost Unit Preview ===

function GhostUnit({ position, color, elevation = 0, unitType = 'hero' }: { position: { q: number; r: number }; color: string; elevation?: number; unitType?: 'hero' | 'farmer' }) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={meshRef} position={[position.q, elevation + 0.15, position.r]}>
      {/* Ghost body - different shape for hero vs farmer */}
      {unitType === 'farmer' ? (
        <>
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshStandardMaterial color="#44aa44" transparent opacity={0.4} emissive="#44aa44" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.12, 0.1, 8]} />
            <meshStandardMaterial color="#8B4513" transparent opacity={0.4} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.2, 0]}>
          <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
          <meshStandardMaterial color={color} transparent opacity={0.4} emissive={color} emissiveIntensity={0.3} />
        </mesh>
      )}
      {/* Ghost ring */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.25, 16]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {/* Destination marker */}
      <mesh position={[0, 0.5, 0]}>
        <coneGeometry args={[0.08, 0.15, 4]} />
        <meshStandardMaterial color={color} transparent opacity={0.6} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// === Town Center Mesh ===

function TownCenterMesh({ position, owner, isSelected, onClick }: {
  position: { q: number; r: number };
  owner: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = owner === 'player1' ? '#00aadd' : '#dd4444';
  const emissiveIntensity = isSelected ? 0.8 : 0.3;

  return (
    <group position={[position.q, 0, position.r]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.4, 0.45, 0.1, 8]} />
        <meshStandardMaterial color="#333333" roughness={0.7} />
      </mesh>
      {/* Main building body */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      {/* Dome roof */}
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity * 0.8}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      {/* Selection ring */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.55, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.8} />
        </mesh>
      )}
      {/* Owner indicator flag */}
      <mesh position={[0.25, 0.8, 0]}>
        <boxGeometry args={[0.02, 0.3, 0.02]} />
        <meshStandardMaterial color="#444444" />
      </mesh>
      <mesh position={[0.32, 0.85, 0]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// === Unit Mesh (Scout/Farmer) ===

function UnitMesh({ unit, isSelected, isHovered, isEnemy, onClick, onPointerEnter, onPointerLeave }: {
  unit: import('@/lib/types').Unit;
  isSelected: boolean;
  isHovered: boolean;
  isEnemy: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const gameState = useGameStore(s => s.gameState);

  // Scouts are now team-colored (blue for player1, red for player2)
  const ownerColor = unit.owner === 'player1' ? '#00ccff' : '#ff4444';
  // Scouts use team color, Farmers use green
  const bodyColor = unit.unitType === 'scout' ? ownerColor : '#44aa44';
  const elevation = gameState?.grid[unit.position.r]?.[unit.position.q]?.elevation ?? 0;

  // Highlight intensity based on hover/select state
  const ringIntensity = isSelected ? 1.0 : isHovered ? 0.6 : 0.3;
  const bodyEmissive = isSelected ? 0.6 : isHovered ? 0.5 : 0.3;

  useFrame((_, delta) => {
    if (meshRef.current && unit.unitType === 'scout') {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  if (!unit.alive) return null;

  return (
    <group
      ref={meshRef}
      position={[unit.position.q, elevation, unit.position.r]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* Base ring showing owner - brightens on hover/select */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.28, 12]} />
        <meshStandardMaterial
          color={ownerColor}
          emissive={ownerColor}
          emissiveIntensity={ringIntensity}
          transparent
          opacity={isHovered || isSelected ? 1.0 : 0.8}
        />
      </mesh>

      {unit.unitType === 'scout' ? (
        <>
          {/* Scout: Small aggressive figure with sword icon - team-colored */}
          <mesh position={[0, 0.2, 0]}>
            <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={bodyColor}
              emissiveIntensity={bodyEmissive}
              roughness={0.5}
            />
          </mesh>
          {/* Sword indicator */}
          <mesh position={[0.12, 0.25, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.04, 0.18, 0.02]} />
            <meshStandardMaterial color="#cccccc" metalness={0.8} roughness={0.2} />
          </mesh>
        </>
      ) : (
        <>
          {/* Farmer: Rounder, friendlier shape */}
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={bodyColor}
              emissiveIntensity={bodyEmissive}
              roughness={0.6}
            />
          </mesh>
          {/* Hat */}
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.12, 0.1, 8]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
          </mesh>
          {/* Pouch indicator if carrying resources */}
          {unit.resourcePouch && Object.values(unit.resourcePouch).some(v => v && v > 0) && (
            <mesh position={[0.1, 0.1, 0]}>
              <sphereGeometry args={[0.06, 8, 6]} />
              <meshStandardMaterial color="#aa8855" roughness={0.7} />
            </mesh>
          )}
        </>
      )}

      {/* HP bar for all units - below unit, always facing camera, behind menus/modals */}
      <Html position={[0, 0.02, 0]} center zIndexRange={[0, 0]} style={{ pointerEvents: 'none', zIndex: -1 }}>
        <div className="w-8 h-1 bg-gray-800/80 rounded-full overflow-hidden border border-gray-700/50">
          <div
            className="h-full transition-all"
            style={{
              width: `${(unit.stats.hp / unit.stats.maxHp) * 100}%`,
              backgroundColor: unit.stats.hp > unit.stats.maxHp * 0.5 ? '#00cc66' : unit.stats.hp > unit.stats.maxHp * 0.25 ? '#cc9900' : '#cc3333',
            }}
          />
        </div>
      </Html>

      {/* Hover indicator (subtle bounce arrow) */}
      {isHovered && !isSelected && (
        <mesh position={[0, 0.55, 0]}>
          <coneGeometry args={[0.05, 0.08, 4]} />
          <meshStandardMaterial
            color={isEnemy ? '#ff6666' : ownerColor}
            emissive={isEnemy ? '#ff6666' : ownerColor}
            emissiveIntensity={0.6}
            transparent
            opacity={0.7}
          />
        </mesh>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <mesh position={[0, 0.55, 0]}>
          <coneGeometry args={[0.06, 0.1, 4]} />
          <meshStandardMaterial
            color={ownerColor}
            emissive={ownerColor}
            emissiveIntensity={0.8}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
    </group>
  );
}

// === Gather Sparkle Animation ===

function GatherSparkleAnimation({ animation }: { animation: GatherAnimation }) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; opacity: number }[]>([]);

  useEffect(() => {
    // Generate sparkle particles
    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 0.4,
      y: 0,
      opacity: 1,
    }));
    setParticles(newParticles);

    // Animate particles rising and fading
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / 1200;

      if (progress < 1) {
        setParticles(prev => prev.map(p => ({
          ...p,
          y: progress * 1.2,
          opacity: 1 - progress,
        })));
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [animation]);

  const RESOURCE_COLORS: Record<string, string> = {
    wood: '#8B4513',
    stone: '#808080',
    iron: '#C0C0C0',
    food: '#FFD700',
    water: '#00CED1',
  };

  const color = RESOURCE_COLORS[animation.resourceType] || '#FFD700';

  return (
    <group position={[animation.q, 0.5, animation.r]}>
      {/* Rising sparkles */}
      {particles.map(p => (
        <mesh key={p.id} position={[p.x, p.y, (Math.random() - 0.5) * 0.3]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={p.opacity} />
        </mesh>
      ))}
      {/* Center glow */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
      {/* Floating text indicator */}
      <Html center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div
          className="font-bold text-sm select-none animate-bounce"
          style={{
            color,
            textShadow: '0 0 8px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
          }}
        >
          +{animation.amount} ✨
        </div>
      </Html>
    </group>
  );
}

// === Attack Animation ===

function AttackAnimationEffect({ animation }: { animation: AttackAnimation }) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());

  useFrame(() => {
    const elapsed = Date.now() - startTime.current;
    const duration = animation.type === 'melee' ? 400 : 600;
    const newProgress = Math.min(1, elapsed / duration);
    setProgress(newProgress);
  });

  const { attackerPos, targetPos, type, damage } = animation;

  if (type === 'melee') {
    // Melee: attacker lunges toward target and back
    const lungeProgress = progress < 0.5 ? progress * 2 : 2 - progress * 2;
    const attackerX = attackerPos.q + (targetPos.q - attackerPos.q) * lungeProgress * 0.6;
    const attackerZ = attackerPos.r + (targetPos.r - attackerPos.r) * lungeProgress * 0.6;

    // Target recoils on impact (when progress > 0.4)
    const recoilProgress = progress > 0.4 ? Math.min(1, (progress - 0.4) / 0.3) : 0;
    const recoilDir = { q: targetPos.q - attackerPos.q, r: targetPos.r - attackerPos.r };
    const recoilMag = Math.sqrt(recoilDir.q ** 2 + recoilDir.r ** 2) || 1;
    const targetX = targetPos.q + (recoilDir.q / recoilMag) * recoilProgress * 0.15 * (1 - Math.max(0, (progress - 0.7) / 0.3));
    const targetZ = targetPos.r + (recoilDir.r / recoilMag) * recoilProgress * 0.15 * (1 - Math.max(0, (progress - 0.7) / 0.3));

    return (
      <group>
        {/* Lunge trail effect */}
        {progress < 0.6 && (
          <mesh position={[attackerX, 0.3, attackerZ]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.6 * (1 - progress)} />
          </mesh>
        )}
        {/* Impact flash at target */}
        {progress > 0.35 && progress < 0.7 && (
          <mesh position={[targetX, 0.4, targetZ]}>
            <sphereGeometry args={[0.25 * (1 - (progress - 0.35) / 0.35), 12, 12]} />
            <meshBasicMaterial color={damage === 'MISS' ? '#ff4444' : '#ffffff'} transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    );
  } else {
    // Ranged: projectile travels from attacker to target
    const projX = attackerPos.q + (targetPos.q - attackerPos.q) * progress;
    const projZ = attackerPos.r + (targetPos.r - attackerPos.r) * progress;
    const projY = 0.5 + Math.sin(progress * Math.PI) * 0.8; // Arc trajectory

    return (
      <group>
        {/* Projectile */}
        {progress < 0.95 && (
          <mesh position={[projX, projY, projZ]}>
            <coneGeometry args={[0.05, 0.2, 6]} />
            <meshStandardMaterial color="#ffcc00" emissive="#ff8800" emissiveIntensity={0.8} />
          </mesh>
        )}
        {/* Trail particles */}
        {progress > 0.1 && progress < 0.9 && (
          <mesh position={[projX - (targetPos.q - attackerPos.q) * 0.1, projY - 0.1, projZ - (targetPos.r - attackerPos.r) * 0.1]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.5} />
          </mesh>
        )}
        {/* Impact at target */}
        {progress > 0.9 && (
          <mesh position={[targetPos.q, 0.4, targetPos.r]}>
            <sphereGeometry args={[0.2 * (1 - (progress - 0.9) / 0.1), 12, 12]} />
            <meshBasicMaterial color={damage === 'MISS' ? '#ff4444' : '#ffcc00'} transparent opacity={0.9} />
          </mesh>
        )}
      </group>
    );
  }
}

// === Game Scene ===

function GameScene() {
  const gameState = useGameStore(s => s.gameState);
  const selectedHeroId = useGameStore(s => s.selectedHeroId);
  const actionMode = useGameStore(s => s.actionMode);
  const moveTiles = useGameStore(s => s.moveTiles);
  const attackTiles = useGameStore(s => s.attackTiles);
  const placementTiles = useGameStore(s => s.placementTiles);
  const hoveredTile = useGameStore(s => s.hoveredTile);
  const currentPath = useGameStore(s => s.currentPath);
  const pendingTarget = useGameStore(s => s.pendingTarget);
  const moveAnimation = useGameStore(s => s.moveAnimation);
  const gatherAnimation = useGameStore(s => s.gatherAnimation);
  const attackAnimation = useGameStore(s => s.attackAnimation);
  const damageIndicators = useGameStore(s => s.damageIndicators);
  const planningPlayerId = useGameStore(s => s.planningPlayerId);
  const queuedActions = useGameStore(s => s.queuedActions);
  const phase = useGameStore(s => s.phase);
  const showInventoryPanel = useGameStore(s => s.showInventoryPanel);
  const handleTileClick = useGameStore(s => s.handleTileClick);
  const setHoveredTile = useGameStore(s => s.setHoveredTile);
  const clearHover = useGameStore(s => s.clearHover);
  const selectedBuildingId = useGameStore(s => s.selectedBuildingId);
  const selectBuilding = useGameStore(s => s.selectBuilding);

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

      {/* Lighting — consistent regardless of camera rotation (high ambient, low directional) */}
      <ambientLight intensity={0.85} color="#aabbcc" />
      <directionalLight position={[0, 50, 0]} intensity={0.6} color="#ffffff" />
      <hemisphereLight color="#889999" groundColor="#444455" intensity={0.5} />

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
          const isPlacementTile = placementTiles.has(tileKey);
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
              isPlacementTile={isPlacementTile}
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

      {/* Queued move paths and ghost units for current planning player (heroes and farmers) */}
      {phase === 'planning' && Object.entries(queuedActions).map(([entityId, action]) => {
        if (!action.movePath || action.movePath.length < 2) return null;
        const hero = allHeroes.find(h => h.id === entityId);
        const unit = !hero ? Object.values(gameState.players).flatMap(p => p.units).find(u => u.id === entityId) : null;
        const entity = hero || unit;
        if (!entity || entity.owner !== planningPlayerId) return null;
        const dest = action.movePath[action.movePath.length - 1];
        const destElevation = grid[dest.r]?.[dest.q]?.elevation ?? 0;
        const entityColor = entity.owner === 'player1' ? '#00ccff' : '#ff4444';
        const isFarmer = unit?.unitType === 'farmer';
        return (
          <group key={`queued-${entityId}`}>
            <PathLine path={action.movePath} color={isFarmer ? '#44aa44' : entityColor} grid={grid} />
            <GhostUnit position={dest} color={entityColor} elevation={destElevation} unitType={isFarmer ? 'farmer' : 'hero'} />
          </group>
        );
      })}

      {/* Path line preview for move action (current hover/selection) */}
      {phase === 'planning' && actionMode === 'move' && currentPath && currentPath.length >= 2 && (
        <PathLine path={currentPath} color="#00ff88" grid={grid} />
      )}

      {/* Ghost unit at move destination (current hover/selection) */}
      {phase === 'planning' && actionMode === 'move' && currentPath && currentPath.length >= 2 && selectedHeroId && (() => {
        const selectedHero = allHeroes.find(h => h.id === selectedHeroId);
        const dest = currentPath[currentPath.length - 1];
        const destElevation = grid[dest.r]?.[dest.q]?.elevation ?? 0;
        const heroColor = selectedHero?.owner === 'player1' ? '#00ccff' : '#ff4444';
        return <GhostUnit position={dest} color={heroColor} elevation={destElevation} />;
      })()}

      {/* Wireframe TC preview during placement */}
      {phase === 'planning' && actionMode === 'place_tc' && hoveredTile && placementTiles.has(`${hoveredTile.q},${hoveredTile.r}`) && (
        <group position={[hoveredTile.q, grid[hoveredTile.r][hoveredTile.q].elevation, hoveredTile.r]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial transparent opacity={0} />
            <Edges color="#ffaa44" threshold={15} />
          </mesh>
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial transparent opacity={0} />
            <Edges color="#ffaa44" threshold={15} />
          </mesh>
        </group>
      )}

      {/* Action toolbar for selected hero (hidden when inventory is open) */}
      {phase === 'planning' && selectedHeroId && actionMode === 'idle' && !showInventoryPanel && (
        <ActionToolbar heroId={selectedHeroId} />
      )}

      {moveAnimation && <AnimatedHero animation={moveAnimation} />}
      {gatherAnimation && <GatherSparkleAnimation animation={gatherAnimation} />}
      {attackAnimation && <AttackAnimationEffect animation={attackAnimation} />}

      {/* Town Centers and other buildings */}
      {Object.values(gameState.players).flatMap(player =>
        player.buildings
          .filter(b => b.type === 'town_center')
          .map(building => (
            <TownCenterMesh
              key={building.id}
              position={building.position}
              owner={building.owner}
              isSelected={selectedBuildingId === building.id}
              onClick={() => selectBuilding(building.id)}
            />
          ))
      )}

      {/* Units (Scouts and Farmers) */}
      {Object.values(gameState.players).flatMap(player =>
        player.units
          .filter(u => u.alive && moveAnimation?.heroId !== u.id)
          .map(unit => {
            const isOwnUnit = unit.owner === planningPlayerId;
            const isSelected = useGameStore.getState().selectedUnitId === unit.id;
            const isHovered = hoveredTile?.q === unit.position.q && hoveredTile?.r === unit.position.r;
            return (
              <UnitMesh
                key={unit.id}
                unit={unit}
                isSelected={isSelected}
                isHovered={isHovered}
                isEnemy={!isOwnUnit}
                onClick={() => {
                  if (isOwnUnit && unit.unitType === 'farmer') {
                    useGameStore.getState().selectUnit(unit.id);
                  }
                }}
                onPointerEnter={() => setHoveredTile(unit.position.q, unit.position.r)}
                onPointerLeave={clearHover}
              />
            );
          })
      )}

      {damageIndicators.map(d => (
        <FloatingDamageIndicator key={d.id} indicator={d} />
      ))}
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
  const debugSpawnScout = useGameStore(s => s.debugSpawnScout);
  const debugSpawnFarmer = useGameStore(s => s.debugSpawnFarmer);
  const debugPlaceTC = useGameStore(s => s.debugPlaceTC);
  const debugAddResources = useGameStore(s => s.debugAddResources);

  const btnClass = "px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[9px] pointer-events-auto";

  return (
    <div className="absolute top-16 right-4 z-50 pointer-events-none">
      <div className="bg-black/80 border border-gray-700 rounded px-3 py-2 font-mono text-[10px] text-gray-400 space-y-0.5 min-w-[220px]">
        <div className="text-gray-500 font-bold mb-1">DEBUG</div>
        <div>cam: ({stats.x.toFixed(1)}, {stats.z.toFixed(1)}) ∠{stats.angle.toFixed(0)}° z{stats.zoom.toFixed(0)}</div>
        <div className="border-t border-gray-800 mt-1 pt-1">round: {round} | phase: {phase}</div>
        <div>planning: {planningPlayerId}</div>
        <div>queued: {Object.keys(queuedActions).length}</div>
        {phase === 'resolution' && <div>resolving: {resolutionIndex}/{resolutionOrder.length}</div>}

        {phase === 'planning' && (
          <>
            <div className="border-t border-gray-800 mt-2 pt-2 text-gray-500 font-bold">SPAWN</div>
            <div className="flex gap-1 flex-wrap">
              <button className={btnClass} onClick={debugSpawnScout}>Scout</button>
              <button className={btnClass} onClick={debugSpawnFarmer}>Farmer</button>
              <button className={btnClass} onClick={debugPlaceTC}>TC</button>
            </div>
            <div className="text-gray-500 font-bold mt-1">RESOURCES</div>
            <div className="flex gap-1">
              <button className={btnClass} onClick={() => debugAddResources(1)}>+1 All</button>
              <button className={btnClass} onClick={() => debugAddResources(10)}>+10 All</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GameBoard() {
  const [showDebug, setShowDebug] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === '`' || e.key === '~') { e.preventDefault(); setShowDebug(p => !p); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Handle WebGL context loss by forcing remount
  const handleContextLost = useCallback((event: Event) => {
    event.preventDefault();
    console.warn('WebGL context lost, will restore...');
  }, []);

  const handleContextRestored = useCallback(() => {
    console.log('WebGL context restored, remounting canvas...');
    setCanvasKey(k => k + 1);
  }, []);

  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);
      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      };
    }
  }, [canvasKey, handleContextLost, handleContextRestored]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1e2024] relative">
      <Canvas
        key={canvasKey}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#1e2024');
          // Prevent context loss from being fatal
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
        }}
      >
        <GameScene />
      </Canvas>
      {showDebug && <DebugOverlay />}
      <div className="absolute bottom-2 right-2 text-gray-600 text-[9px] font-mono pointer-events-none">` debug</div>
    </div>
  );
}
