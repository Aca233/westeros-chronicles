import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getVerificationSuite, validateVerificationSuites } from './suites.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(join(currentDir, '../../package.json'), 'utf8'));

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
  for (const [index, current] of steps.entries()) {
    logger.log(`[${index + 1}/${steps.length}] ${name}: ${current.script}`);
    const code = await execute(current.script);
    if (code !== 0) {
      logger.error(`验证失败：${current.script}（退出码 ${code}）`);
      return code;
    }
  }
  logger.log(`验证完成：${name}（${Date.now() - startedAt}ms）`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runVerificationSuite(process.argv[2] ?? 'full');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
