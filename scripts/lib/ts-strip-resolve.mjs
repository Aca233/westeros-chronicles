/**
 * Node 类型剥离加载器的解析补丁。
 *
 * 项目源码使用 tsconfig 风格的无扩展名相对 import（Vite 负责解析），但 node
 * --experimental-strip-types 只认带扩展名的路径。这里在默认解析失败时补上 .ts/.tsx/index.ts，
 * 让检查脚本能直接导入真实实现，而不是在脚本里重实现一遍逻辑再自欺欺人地断言它。
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const hookSource = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const candidate of [base.href + '.ts', base.href + '.tsx', base.href + '/index.ts']) {
        if (existsSync(fileURLToPath(candidate))) return { url: candidate, shortCircuit: true };
      }
    }
    throw error;
  }
}
`;

register(`data:text/javascript,${encodeURIComponent(hookSource)}`, pathToFileURL(import.meta.url).href);
