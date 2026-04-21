import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import ParticleField from './ParticleField'

/**
 * The hero's R3F scene.
 *
 *  - One Canvas, DPR capped lower on mobile to keep fill-rate sane.
 *  - Particle count halved on small viewports — fewer fragments to draw.
 *  - `events={undefined}`: the canvas is purely decorative, skip the raycaster cost.
 */
const isMobileViewport =
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches

export default function HeroScene() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, isMobileViewport ? 1.25 : 1.5]}
      camera={{ position: [0, 0, 7.5], fov: 55, near: 0.1, far: 50 }}
      style={{ background: 'transparent' }}
      events={undefined}>
      <Suspense fallback={null}>
        <color attach="background" args={[0, 0, 0]} />
        <fog attach="fog" args={['#05080a', 8, 18]} />
        <ambientLight intensity={0.5} />
        <ParticleField count={isMobileViewport ? 750 : 1500} radius={8} />
      </Suspense>
    </Canvas>
  )
}
