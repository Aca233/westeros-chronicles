import { MeshoptSimplifier } from 'meshoptimizer'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
if (!Array.isArray(input.indices) || !Array.isArray(input.positions)) throw new Error('indices/positions must be arrays')
if (!(input.targetRatio > 0 && input.targetRatio < 1)) throw new Error('targetRatio must be between zero and one')
await MeshoptSimplifier.ready
const indices = Uint32Array.from(input.indices)
const positions = Float32Array.from(input.positions)
const targetCount = Math.max(3, Math.floor(indices.length * input.targetRatio / 3) * 3)
let [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, targetCount, 1e-2, ['LockBorder'])
let mode = 'lock-border'
if (simplified.length / indices.length > 0.40) {
  ;[simplified, error] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, targetCount, 5e-2)
  mode = 'sloppy-fallback'
}
process.stdout.write(JSON.stringify({ indices: Array.from(simplified), error, mode }))
