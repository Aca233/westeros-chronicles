import {
  Box3,
  CircleGeometry,
  PlaneGeometry,
  Mesh,
  Object3D,
  ShaderMaterial,
  ShadowMaterial,
  Vector3,
} from 'three'

import { cinematicSunSourceDirection } from './landmarkLightingProfile.ts'

export const LANDMARK_CONTACT_SHADOW_NAME = 'agot-landmark-contact-shadow'
export const LANDMARK_GROUND_SHADOW_LAYER = 2

export function createLandmarkContactShadow(model: Object3D): Mesh | null {
  model.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(model)
  if (bounds.isEmpty()) return null
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) return null
  if (size.x <= 0 || size.z <= 0) return null

  const geometry = new CircleGeometry(1, 48)
  const material = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float d = length((vUv - 0.5) * 2.0);
        float alpha = (1.0 - smoothstep(0.0, 1.0, d)) * 0.28;
        gl_FragColor = vec4(0.065, 0.062, 0.058, alpha);
      }
    `,
  })
  const shadow = new Mesh(geometry, material)
  shadow.name = LANDMARK_CONTACT_SHADOW_NAME
  shadow.layers.set(LANDMARK_GROUND_SHADOW_LAYER)
  shadow.rotation.x = -Math.PI / 2
  const [sunEast, sunSouth] = cinematicSunSourceDirection()
  const horizontalLength = Math.hypot(sunEast, sunSouth) || 1
  const baseSize = Math.max(size.x, size.z)
  const shadowLength = Math.max(baseSize * 0.34, Math.min(size.y * 0.32, baseSize * 0.9))
  const shadowEast = -sunEast / horizontalLength * shadowLength
  const shadowSouth = -sunSouth / horizontalLength * shadowLength
  shadow.position.set(
    center.x + shadowEast,
    Math.max(size.y * 0.002, 0.02),
    center.z - shadowSouth,
  )
  shadow.scale.set(Math.max(size.x * 1.24, baseSize * 1.12), Math.max(size.z * 0.96, baseSize * 0.76), 1)
  shadow.castShadow = false
  shadow.receiveShadow = false
  shadow.renderOrder = -10
  shadow.frustumCulled = true
  return shadow
}


export const LANDMARK_SHADOW_RECEIVER_NAME = 'agot-landmark-shadow-receiver'

export function createLandmarkShadowReceiver(model: Object3D): Mesh | null {
  model.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(model)
  if (bounds.isEmpty()) return null
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) return null
  if (size.x <= 0 || size.z <= 0) return null

  const [sunEast, sunSouth, sunUp] = cinematicSunSourceDirection()
  const horizontalLength = Math.hypot(sunEast, sunSouth) || 1
  const projectedLength = Math.min(
    Math.max(size.y * horizontalLength / Math.max(sunUp, 0.2), Math.max(size.x, size.z) * 0.35),
    Math.max(size.x, size.z) * 1.8,
  )
  const shadowEast = -sunEast / horizontalLength * projectedLength * 0.5
  const shadowSouth = -sunSouth / horizontalLength * projectedLength * 0.5
  const width = size.x + Math.abs(shadowEast) * 2 + size.x * 0.35
  const depth = size.z + Math.abs(shadowSouth) * 2 + size.z * 0.35

  const material = new ShadowMaterial({
    color: 0x17130d,
    opacity: 0.22,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const receiver = new Mesh(new PlaneGeometry(width, depth), material)
  receiver.name = LANDMARK_SHADOW_RECEIVER_NAME
  receiver.layers.set(LANDMARK_GROUND_SHADOW_LAYER)
  receiver.rotation.x = -Math.PI / 2
  receiver.position.set(
    center.x + shadowEast,
    Math.max(size.y * 0.0025, 0.025),
    center.z - shadowSouth,
  )
  receiver.castShadow = false
  receiver.receiveShadow = true
  receiver.renderOrder = -20
  receiver.frustumCulled = true
  return receiver
}
