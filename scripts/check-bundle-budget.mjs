import assert from 'node:assert/strict';
import { build } from 'vite';

const ENTRY_BUDGET_BYTES = 750 * 1024;
const result = await build({
  mode: 'bundle-budget',
  build: {
    copyPublicDir: false,
    write: false,
    minify: 'esbuild',
  },
});
const outputs = Array.isArray(result) ? result.flatMap((entry) => entry.output) : result.output;
const entry = outputs.find((output) => output.type === 'chunk' && output.isEntry);
assert.ok(entry && entry.type === 'chunk', '构建结果中缺少入口 JavaScript chunk');
const bytes = Buffer.byteLength(entry.code);
assert.ok(
  bytes <= ENTRY_BUDGET_BYTES,
  `首屏入口包 ${Math.ceil(bytes / 1024)} KiB 超过预算 ${ENTRY_BUDGET_BYTES / 1024} KiB`,
);
console.log(JSON.stringify({ status: 'ok', entry: entry.fileName, bytes, budgetBytes: ENTRY_BUDGET_BYTES }));
