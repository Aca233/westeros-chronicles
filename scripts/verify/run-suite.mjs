import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getVerificationSuite, validateVerificationSuites } from './suites.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(join(currentDir, '../../package.json'), 'utf8'));

// 守卫：验证期间任何步骤都不得重写静态数据产物。
// 并行终端里的数据管线（裁剪/导入/编译）曾把退化数据写进树里而不被任何检查发现。
const GUARDED_DATA_ROOTS = ['public/data', 'src/data/generated'];

async function dataTreeFingerprint(logger) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path.split('\\').join('/'));
    }
  }
  for (const root of GUARDED_DATA_ROOTS) {
    if (existsSync(root)) await walk(root);
  }
  files.sort();
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(file);
    digest.update(await readFile(file));
  }
  logger.log?.(`数据树指纹：${files.length} 个文件`);
  return digest.digest('hex');
}

export function executeNpmScript(script) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = npmCli ? [npmCli, 'run', script] : ['run', script];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export async function runVerificationSuite(name, options = {}) {
  const packageScripts = options.packageScripts ?? packageJson.scripts;
  const logger = options.logger ?? console;
  const execute = options.execute ?? executeNpmScript;
  validateVerificationSuites(packageScripts);
  const steps = getVerificationSuite(name);
  const startedAt = Date.now();
  const before = await dataTreeFingerprint(logger);
  let exitCode = 0;
  try {
    for (const [index, current] of steps.entries()) {
      logger.log(`[${index + 1}/${steps.length}] ${name}: ${current.script}`);
      const code = await execute(current.script);
      if (code !== 0) {
        logger.error(`验证失败：${current.script}（退出码 ${code}）`);
        exitCode = code;
        break;
      }
    }
  } finally {
    const after = await dataTreeFingerprint(logger);
    if (before !== after) {
      logger.error('验证守卫：静态数据产物在验证期间被重写（public/data 或 src/data/generated）。'
        + '请勿在验证运行时并行执行导入、裁剪或世界内容编译。');
      exitCode = exitCode || 1;
    }
  }
  if (exitCode === 0) logger.log(`验证完成：${name}（${Date.now() - startedAt}ms）`);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runVerificationSuite(process.argv[2] ?? 'full');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
