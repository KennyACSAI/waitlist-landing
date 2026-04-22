import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const MODEL_URL = '/yoova-pin.glb'

export interface PinMeasurement {
  worldHeight: number
  centerOffsetY: number
  bottomOffsetY: number
}

interface YoovaPinProps {
  positionX?: number
  positionY?: number
  rotationZ?: number
  scale?: number
  spinSpeed?: number
  onMeasured?: (info: PinMeasurement) => void
}

/**
 * Loads the Yoova pin .glb as-is — keeps the original baked PBR colors
 * and textures — and spins it on Y. The only material tweak is enabling
 * alpha-cutout + DoubleSide so the modeled hole in the pin head renders
 * as a real see-through rather than a solid disc.
 *
 * Euler order is XYZ (three.js default): rotation.y spins the pin around
 * its local vertical axis, then rotation.z tilts the whole thing — so a
 * fixed rotationZ with continuously incrementing rotation.y renders as
 * "tilted pin spinning around its own long axis" (what we want for the
 * side pins in the three-pin logo composition).
 */
export default function YoovaPin({
  positionX = 0,
  positionY = -0.6,
  rotationZ = 0,
  scale = 2,
  spinSpeed = 0.6,
  onMeasured,
}: YoovaPinProps) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => {
    ;(loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder)
  })
  // Each instance needs its own Object3D — a single Object3D can only
  // belong to one parent. Without cloning, mounting the second YoovaPin
  // re-parents the shared gltf.scene and the first pin silently empties.
  // Deep clone (true) copies descendants; geometry and materials stay
  // shared by reference so memory/GPU cost is flat across instances.
  const sceneClone = useMemo(() => gltf.scene.clone(true), [gltf])
  const groupRef = useRef<THREE.Group>(null!)
  const reducedMotionRef = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      reducedMotionRef.current = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    sceneClone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      // Shadows fully disabled — no contact shadow plane in the scene.
      mesh.castShadow = false
      mesh.receiveShadow = false
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial
        mat.side = THREE.DoubleSide
        mat.transparent = false
        mat.alphaTest = 0.5
        mat.depthWrite = true
        mat.envMapIntensity = 1.1
        mat.needsUpdate = true
      })
    })

    // One-shot: measure world-space AABB so the layout code can align the
    // DOM placeholder to the pin's actual on-screen footprint. Values are
    // reported RELATIVE to the pin's own world position (via getWorldPosition)
    // so any ancestor transform — e.g. an intro-animation wrapper that
    // offsets the pin during slide-in — doesn't leak into the measurement.
    if (groupRef.current && onMeasured) {
      groupRef.current.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(groupRef.current)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)
      const worldPos = new THREE.Vector3()
      groupRef.current.getWorldPosition(worldPos)
      onMeasured({
        worldHeight: size.y,
        centerOffsetY: center.y - worldPos.y,
        bottomOffsetY: box.min.y - worldPos.y,
      })
    }
  }, [sceneClone, onMeasured])

  useFrame((_, dt) => {
    if (!groupRef.current || reducedMotionRef.current) return
    groupRef.current.rotation.y += dt * spinSpeed
  })

  return (
    <group
      ref={groupRef}
      position={[positionX, positionY, 0]}
      rotation={[0, 0, rotationZ]}
      scale={scale}>
      <primitive object={sceneClone} />
    </group>
  )
}
