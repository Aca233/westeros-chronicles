import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/services/api.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { parseModelOutput } = await import(moduleUrl);

const branchBundle = await build({
  entryPoints: ['src/services/branchOptions.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const branchModuleUrl = `data:text/javascript;base64,${Buffer.from(branchBundle.outputFiles[0].text).toString('base64')}`;
const { normalizeBranchOptions } = await import(branchModuleUrl);

test('分支解析会移除模型自行嵌套的 choice 标签', () => {
  const parsed = parseModelOutput(
    `<narrate>正文。</narrate>
<branch>
<choice id="1">依照礼节引导劳勃国王入主堡大厅</choice>
<choice id="2">趁国王初至，前往临冬城地下墓窖</choice>
<choice id="3">命罗柏与侍卫妥善安置王室卫队</choice>
</branch>`,
    2,
    '继续',
  );

  assert.deepEqual(parsed.branches, [
    '依照礼节引导劳勃国王入主堡大厅',
    '趁国王初至，前往临冬城地下墓窖',
    '命罗柏与侍卫妥善安置王室卫队',
  ]);
});

test('分支解析会拆开模型写在同一行的多个编号选项', () => {
  const parsed = parseModelOutput(
    '<narrate>正文。</narrate><branch>1. 留在大厅观察 2. 前往马厩查问 3. 召来学士商议</branch>',
    2,
    '继续',
  );

  assert.deepEqual(parsed.branches, [
    '留在大厅观察',
    '前往马厩查问',
    '召来学士商议',
  ]);
});

test('已保存的旧选项在显示前也会清除泄漏标签并拆分', () => {
  assert.deepEqual(normalizeBranchOptions([
    '<choice id="1">进入大厅</choice>',
    '<choice id="2">前往墓窖</choice><choice id="3">召集侍卫</choice>',
  ]), ['进入大厅', '前往墓窖', '召集侍卫']);
});
