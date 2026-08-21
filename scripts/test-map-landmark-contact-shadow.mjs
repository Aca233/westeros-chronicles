import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  ShadowMaterial,
} from 'three'

import {
  LANDMARK_CONTACT_SHADOW_NAME,
  LANDMARK_GROUND_SHADOW_LAYER,
  createLandmarkContactShadow,
  createLandmarkShadowReceiver,
} from '../src/features/map/landmarks/landmarkContactShadow.ts'

test('接触阴影从模型本地包围盒生成柔和椭圆且不写深度', () => {
  const model = new Group()
  const castle = new Mesh(new BoxGeometry(20, 10, 12), new MeshBasicMaterial())
  castle.position.set(4, 4, -3)
  model.add(castle)
  model.updateMatrixWorld(true)

  const shadow = createLandmarkContactShadow(model)
  assert.ok(shadow)
  assert.equal(shadow.name, LANDMARK_CONTACT_SHADOW_NAME)
  assert.equal(shadow.layers.mask, 1 << LANDMARK_GROUND_SHADOW_LAYER)
  assert.ok(shadow.material instanceof ShaderMaterial)
  assert.equal(shadow.material.transparent, true)
  assert.equal(shadow.material.depthWrite, false)
  assert.equal(shadow.castShadow, false)
  assert.equal(shadow.receiveShadow, false)
  assert.ok(shadow.scale.x > shadow.scale.y)
  assert.ok(shadow.position.y > 0)
  assert.ok(shadow.position.y < 1, '阴影应贴近 locator 地面而不是模型最低点')
  assert.equal(shadow.material.depthTest, false)
  assert.ok(shadow.position.x > 4, '西北太阳应把软影推向东侧')
  assert.ok(shadow.position.z < -3, '西北太阳应把软影推向南侧')
  assert.ok(shadow.scale.x >= 22, '方向软影必须大于建筑基底并在低质量档可见')
  assert.match(shadow.material.fragmentShader, /0\.2[0-9]/)
  assert.match(shadow.material.fragmentShader, /smoothstep\(0\.0, 1\.0/)
})

test('透明承接面只显示实时塔楼投影且覆盖太阳背向区域', () => {
  const model = new Group()
  const castle = new Mesh(new BoxGeometry(20, 30, 12), new MeshBasicMaterial())
  castle.position.set(4, 15, -3)
  model.add(castle)
  model.updateMatrixWorld(true)

  const receiver = createLandmarkShadowReceiver(model)
  assert.ok(receiver)
  assert.ok(receiver.material instanceof ShadowMaterial)
  assert.equal(receiver.layers.mask, 1 << LANDMARK_GROUND_SHADOW_LAYER)
  assert.equal(receiver.material.transparent, true)
  assert.equal(receiver.material.depthTest, false)
  assert.equal(receiver.material.depthWrite, false)
  assert.ok(receiver.material.opacity >= 0.18 && receiver.material.opacity <= 0.26)
  assert.equal(receiver.castShadow, false)
  assert.equal(receiver.receiveShadow, true)
  assert.ok(receiver.position.x > 4, '西北太阳应将承接面延伸到东侧')
  assert.ok(receiver.position.z < -3, '西北太阳应将承接面延伸到南侧')
  assert.ok(receiver.geometry.parameters.width > 20)
  assert.ok(receiver.geometry.parameters.height > 12)
})

test('空模型不生成接触阴影', () => {
  assert.equal(createLandmarkContactShadow(new Group()), null)
  assert.equal(createLandmarkShadowReceiver(new Group()), null)
})
