import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { findModuleCycles, importedSpecifiers } from './check-module-cycles.mjs'

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'agot-module-cycles-'))
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  return root
}

test('AST 只读取静态 import 与 export-from 声明', () => {
  assert.deepEqual(importedSpecifiers(`
    import type { B } from './b'
    export { c } from './c.ts'
    const lazy = import('./lazy')
    const text = "import './fake'"
  `, 'a.ts'), ['./b', './c.ts'])
})

test('检测并稳定排序三节点循环，忽略外部包', () => {
  const root = fixture({
    'a.ts': "import './b'",
    'b.ts': "export * from './c'",
    'c.ts': "import type { A } from './a'",
    'leaf.ts': "import React from 'react'",
  })
  try {
    assert.deepEqual(findModuleCycles(root), [['a.ts', 'b.ts', 'c.ts']])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无环图返回空数组', () => {
  const root = fixture({
    'a.ts': "import './b'",
    'b.ts': "export * from './leaf'",
    'leaf.ts': "import React from 'react'",
  })
  try {
    assert.deepEqual(findModuleCycles(root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('当前源码静态导入图不存在循环', () => {
  assert.deepEqual(findModuleCycles('src'), [])
})
