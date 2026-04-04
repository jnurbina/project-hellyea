'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent, extend } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Tile, TERRAIN_CONFIG } from '@/lib/types';

// Create octagon geometry (flat, lying on XZ plane)
// Create octagon shape for the tile body
function createOctagonGeometry(size: number = 0.46): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const sides = 8;
  const angleOffset = Math.PI / 8;
  
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + angleOffset;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Edge points for octagon outline
function getOctagonEdgePoints(size: number = 0.46): [number, number, number][] {
  const points: [number, number, number][] = [];
  const sides = 8;
  const angleOffset = Math.PI / 8;
  
  for (let i = 0; i <= sides; i++) {
    const angle = ((i % sides) / sides) * Math.PI * 2 + angleOffset;
    points.push([Math.cos(angle) * size, 0.07, Math.sin(angle) * size]);
  }
  
  return points;
}

const octGeo = createOctagonGeometry();
const octEdgePoints = getOctagonEdgePoints();

interface OctileTileProps {
  tile: Tile;
  isHighlighted: boolean;
  isPath: boolean;
  isSelected: boolean;
  hasHero: boolean;
  heroColor?: string;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export default function OctileTileMesh({
  tile, isHighlighted, isPath, isSelected, hasHero, heroColor,
  onClick, onPointerEnter, onPointerLeave,
}: OctileTileProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const config = TERRAIN_CONFIG[tile.terrain];
  
  // Tile fill color — gun-metal grey base, terrain tinted
  const color = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0c0c0e';
    
    // Gun-metal grey base with terrain tint
    const terrainTints: Record<string, string> = {
      plains:   '#2a2c30',
      forest:   '#1e2a22',
      mountain: '#33353a',
      water:    '#181c2a',
      ruins:    '#2a2430',
    };
    let baseColor = terrainTints[tile.terrain] || '#2a2c30';
    
    if (tile.visible === 'explored') {
      baseColor = darkenColor(baseColor, 0.35);
    }
    
    if (isSelected) return '#003844';
    if (isPath) return '#002a33';
    if (isHighlighted) return '#1e2830';
    
    return baseColor;
  }, [tile.visible, tile.terrain, isHighlighted, isPath, isSelected]);
  
  // Edge line color — light blue accent
  const edgeColor = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0a0a10';
    if (isSelected) return '#00ddff';
    if (isPath) return '#0088aa';
    if (isHighlighted) return '#3388aa';
    if (tile.visible === 'explored') return '#1a1c22';
    return '#3a5060'; // light blue-grey edge
  }, [tile.visible, isHighlighted, isPath, isSelected]);
  
  const elevation = tile.visible === 'unexplored' ? 0 : tile.elevation;
  
  return (
    <group position={[tile.q, elevation, tile.r]}>
      {/* Tile body — semi-transparent gun-metal */}
      <mesh
        ref={meshRef}
        geometry={octGeo}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPointerEnter(); }}
        onPointerLeave={onPointerLeave}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={tile.visible === 'unexplored' ? 0.3 : 0.75}
          roughness={0.7}
          metalness={0.4}
        />
      </mesh>
      
      {/* Tile edge outline — light blue wireframe */}
      <Line
        points={octEdgePoints}
        color={edgeColor}
        lineWidth={1}
        transparent
        opacity={tile.visible === 'unexplored' ? 0.1 : 0.6}
      />
      
      {/* Resource indicator — icon-style markers */}
      {tile.resourceType && tile.visible !== 'unexplored' && (
        <group position={[0, 0.12, 0]}>
          {/* Resource diamond shape */}
          <mesh rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.1, 0.06, 0.1]} />
            <meshStandardMaterial
              color={getResourceColor(tile.resourceType)}
              emissive={getResourceColor(tile.resourceType)}
              emissiveIntensity={0.8}
              transparent
              opacity={0.9}
            />
          </mesh>
          {/* Glow ring under resource */}
          <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.06, 0.1, 8]} />
            <meshBasicMaterial
              color={getResourceColor(tile.resourceType)}
              transparent
              opacity={0.4}
            />
          </mesh>
        </group>
      )}
      
      {/* Hero indicator */}
      {hasHero && (
        <group position={[0, 0.25, 0]}>
          {/* Body */}
          <mesh position={[0, 0.2, 0]}>
            <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
            <meshStandardMaterial
              color={heroColor || '#ffffff'}
              emissive={heroColor || '#ffffff'}
              emissiveIntensity={0.6}
              roughness={0.3}
            />
          </mesh>
          {/* Shadow/glow ring */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.15, 0.22, 16]} />
            <meshStandardMaterial
              color={heroColor || '#ffffff'}
              emissive={heroColor || '#ffffff'}
              emissiveIntensity={0.8}
              transparent
              opacity={0.5}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function getResourceColor(resource: string): string {
  switch (resource) {
    case 'wood': return '#4a3520';
    case 'stone': return '#666666';
    case 'iron': return '#8888aa';
    case 'food': return '#447733';
    case 'water': return '#3344aa';
    default: return '#555555';
  }
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.floor(r * factor).toString(16).padStart(2, '0')}${Math.floor(g * factor).toString(16).padStart(2, '0')}${Math.floor(b * factor).toString(16).padStart(2, '0')}`;
}
