import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const BRAND = '#28aa97'

interface Props {
  position?: [number, number, number]
  scale?: number
  spinSpeed?: number
}

/**
 * Builds a clean map-pin silhouette as a 2D `THREE.Shape`:
 *   - A circular head of radius 1 centered at (0, 1)
 *   - Two straight lines from the tangent points of that circle down to a
 *     sharp tip at (0, TIP_Y). Computed as true tangents so the seam between
 *     tail and head is G1-smooth (no visible kink when extruded).
 *   - A small through-hole in the head center — mimics the inner dot from
 *     the 2D YoovaLogo wordmark, giving the extruded pin its donut face.
 *
 * The resulting Shape is roughly 2.7 units tall before centering.
 */
function buildPinShape(): THREE.Shape {
  const HEAD_CY = 1
  const HEAD_R = 1
  const TIP_Y = -1.7
  const HOLE_R = 0.28

  // Angle on the head circle where the tangent from the tip touches it.
  // arcsin(r / |CP|) where CP is tip → circle-center distance.
  const tanAngle = -Math.asin(HEAD_R / (HEAD_CY - TIP_Y))
  const rightX = HEAD_R * Math.cos(tanAngle)
  const rightY = HEAD_CY + HEAD_R * Math.sin(tanAngle)

  const shape = new THREE.Shape()
  shape.moveTo(0, TIP_Y)
  shape.lineTo(rightX, rightY)
  // Sweep CCW from the right tangent point, up and over the top, to the
  // mirrored left tangent point.
  shape.absarc(0, HEAD_CY, HEAD_R, tanAngle, Math.PI - tanAngle, false)
  shape.lineTo(0, TIP_Y)

  const hole = new THREE.Path()
  hole.absarc(0, HEAD_CY, HOLE_R, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  return shape
}

/**
 * A brand-accurate 3D map pin, generated at runtime from the YoovaLogo pin
 * silhouette — no glb, no texture download, zero runtime asset weight.
 *
 * Rotates continuously on its Y axis. Because the form is an extrusion, at
 * 90° / 270° you see the bevelled edge rather than the full face — this is
 * intentional and reads as an enamel lapel-pin look rather than a solid orb.
 */
export default function YoovaLogoPin3D({
  position = [0, 0.5, 0],
  scale = 1.3,
  spinSpeed = 0.6,
}: Props) {
  const groupRef = useRef<THREE.Group>(null!)

  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildPinShape(), {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.08,
      bevelSegments: 6,
      curveSegments: 64,
    })
    g.center()
    g.computeVertexNormals()
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: BRAND,
        roughness: 0.45,
        metalness: 0.15,
      }),
    [],
  )

  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * spinSpeed
  })

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <mesh geometry={geometry} material={material} />
    </group>
  )
}
