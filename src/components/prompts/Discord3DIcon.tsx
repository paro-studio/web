import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

interface Discord3DIconProps {
  className?: string;
  isHovered?: boolean;
}

const DISCORD_SVG_PATH =
  "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z";

export function Discord3DIcon({ className = "h-6 w-6", isHovered = false }: Discord3DIconProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [internalHover, setInternalHover] = useState(false);
  const hovered = isHovered || internalHover;
  const hoveredRef = useRef(hovered);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 32;
    const height = container.clientHeight || 32;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 42);

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x7289da, 2.5);
    dirLight1.position.set(20, 20, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight2.position.set(-20, -10, 20);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x5865f2, 3, 50);
    pointLight.position.set(0, 0, 25);
    scene.add(pointLight);

    // Create 3D Mesh from SVG path
    const loader = new SVGLoader();
    const svgData = loader.parse(`<svg><path d="${DISCORD_SVG_PATH}" /></svg>`);
    const shapePath = svgData.paths[0];

    if (!shapePath) return;

    const shapes = SVGLoader.createShapes(shapePath);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 2.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.4,
      bevelThickness: 0.4,
    };

    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    geometry.center();
    // SVG paths are inverted on Y axis in 3D WebGL coordinate system
    geometry.scale(1, -1, 1);

    // Material with Discord blurple color & glossy metallic finish
    const material = new THREE.MeshStandardMaterial({
      color: 0x5865f2,
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x18191c,
      emissiveIntensity: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation Loop
    let animationFrameId: number;
    let rotationSpeed = 0;
    const baseRotationSpeed = 0.08;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (hoveredRef.current) {
        // Accelerate rotation when hovered
        rotationSpeed = THREE.MathUtils.lerp(rotationSpeed, baseRotationSpeed, 0.1);
        mesh.rotation.y += rotationSpeed;
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, Math.sin(Date.now() * 0.005) * 0.15, 0.1);
      } else {
        // Smoothly decelerate and reset rotation back toward front-facing (y = 0)
        rotationSpeed = THREE.MathUtils.lerp(rotationSpeed, 0, 0.1);
        mesh.rotation.y += rotationSpeed;

        const targetY = Math.round(mesh.rotation.y / (Math.PI * 2)) * (Math.PI * 2);
        mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, targetY, 0.1);
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, 0.1);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handling
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 32;
      const h = container.clientHeight || 32;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`inline-flex items-center justify-center relative overflow-hidden pointer-events-auto ${className}`}
      onMouseEnter={() => setInternalHover(true)}
      onMouseLeave={() => setInternalHover(false)}
      aria-label="3D Discord Icon"
    />
  );
}
