import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { Asset } from 'expo-asset';

interface SharkAvatar3DProps {
  heading: number; // compass heading in degrees
  size?: number;
}

export default function SharkAvatar3D({ heading, size = 100 }: SharkAvatar3DProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const rendererRef = useRef<Renderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sharkRef = useRef<THREE.Object3D | null>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  const onContextCreate = useCallback(async (gl: any) => {
    // Create renderer
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      50,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Add strong lighting for visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Fill light from front
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
    frontLight.position.set(0, 0, 10);
    scene.add(frontLight);

    // Add a subtle fill light from below
    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.5);
    fillLight.position.set(-2, -5, 2);
    scene.add(fillLight);

    // Hemisphere light for natural outdoor feel
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    // Load the shark model
    try {
      const { GLTFLoader } = await import('three-stdlib');
      const loader = new GLTFLoader();
      
      // Load the model from app assets
      const asset = Asset.fromModule(require('../../assets/models/shark-avatar.glb'));
      await asset.downloadAsync();
      
      if (asset.localUri) {
        const response = await fetch(asset.localUri);
        const arrayBuffer = await response.arrayBuffer();
        
        loader.parse(arrayBuffer, '', (gltf) => {
          const shark = gltf.scene;
          
          // Ensure materials render properly
          shark.traverse((child: any) => {
            if (child.isMesh) {
              // Make sure materials are visible
              if (child.material) {
                child.material.needsUpdate = true;
                // If no color, add a default blue shark color
                if (!child.material.map && !child.material.color) {
                  child.material.color = new THREE.Color(0x4a90d9);
                }
                // Ensure proper lighting
                child.material.metalness = 0.1;
                child.material.roughness = 0.8;
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
          // Center and scale the model
          const box = new THREE.Box3().setFromObject(shark);
          const center = box.getCenter(new THREE.Vector3());
          const modelSize = box.getSize(new THREE.Vector3());
          
          // Center the model
          shark.position.sub(center);
          
          // Scale to fit nicely
          const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
          const scale = 2 / maxDim;
          shark.scale.setScalar(scale);
          
          scene.add(shark);
          sharkRef.current = shark;
          setIsLoaded(true);
          console.log('🦈 3D Shark loaded successfully!');
        }, (error) => {
          console.error('Error loading shark model:', error);
        });
      }
    } catch (error) {
      console.error('Failed to load shark model:', error);
    }

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.016; // ~60fps

      if (sharkRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        // Gentle bobbing animation
        sharkRef.current.position.y = Math.sin(timeRef.current * 2) * 0.1;
        
        // Subtle side-to-side sway
        sharkRef.current.rotation.z = Math.sin(timeRef.current * 1.5) * 0.05;
        
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        gl.endFrameEXP();
      }
    };
    
    animate();
  }, []);

  // Update rotation when heading changes
  useEffect(() => {
    if (sharkRef.current) {
      // Convert heading to radians and apply rotation
      // Heading: 0 = North, 90 = East, etc.
      const radians = THREE.MathUtils.degToRad(-heading + 180);
      sharkRef.current.rotation.y = radians;
    }
  }, [heading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  glView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
