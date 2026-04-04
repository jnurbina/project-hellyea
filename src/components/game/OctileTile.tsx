'use client';

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Tile, TERRAIN_CONFIG } from '@/lib/types';

// Create octagon geometry (flat, lying on XZ plane)
function createOctagonGeometry(size: number = 0.48): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const sides = 8;
  const angleOffset = Math.PI / 8; // Rotate so flat side faces camera
  
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + angleOffset;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: false,
  });
  
  // Rotate to lie flat on XZ
  geo.rotateX(-Math.PI / 2);
  
  return geo;
}

const octGeo = createOctagonGeometry();

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
  
  // Determine tile color based on visibility and state
  const color = useMemo(() => {
    if (tile.visible === 'unexplored') return '#0a0a0a';
    
    let baseColor = config.color;
    if (tile.visible === 'explored') {
      // Darken explored but not currently visible
      baseColor = darkenColor(baseColor, 0.4);
    }
    
    if (isSelected) return '#00ffff';
    if (isPath) return '#004444';
    if (isHighlighted) return '#1a3a3a';
    
    return baseColor;
  }, [tile.visible, tile.terrain, isHighlighted, isPath, isSelected, config.color]);
  
  // Edge glow color
  const edgeColor = useMemo(() => {
    if (tile.visible === 'unexplored') return '#050505';
    if (isSelected) return '#00ffff';
    if (isPath) return '#007777';
    if (isHighlighted) return '#003333';
    return '#111111';
  }, [tile.visible, isHighlighted, isPath, isSelected]);
  
  const elevation = tile.visible === 'unexplored' ? 0 : tile.elevation;
  
  return (
    <group position={[tile.q, elevation, tile.r]}>
      {/* Tile body */}
      <mesh
        ref={meshRef}
        geometry={octGeo}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPointerEnter(); }}
        onPointerLeave={onPointerLeave}
      >
        <meshStandardMaterial
          color={color}
          emissive={edgeColor}
          emissiveIntensity={0.3}
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>
      
      {/* Resource indicator */}
      {tile.resourceType && tile.visible !== 'unexplored' && (
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial
            color={getResourceColor(tile.resourceType)}
            emissive={getResourceColor(tile.resourceType)}
            emissiveIntensity={0.5}
          />
        </mesh>
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
