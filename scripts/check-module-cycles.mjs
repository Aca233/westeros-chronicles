import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const SOURCE_EXTENSIONS = ['.ts', '.tsx']

export function importedSpecifiers(sourceText, fileName) {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true)
  const values = []
  source.forEachChild((node) => {
    const isImport = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
    if (isImport && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      values.push(node.moduleSpecifier.text)
    }
  })
  return values
}

function sourceFiles(rootDir) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && SOURCE_EXTENSIONS.includes(extname(entry.name)) && !entry.name.endsWith('.d.ts')) files.push(absolute)
    }
  }
  visit(rootDir)
  return files.sort()
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const unresolved = resolve(dirname(fromFile), specifier)
  const candidates = extname(unresolved)
    ? [unresolved]
    : [...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => join(unresolved, `index${extension}`))]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

export function findModuleCycles(rootDir) {
  const root = resolve(rootDir)
  const files = sourceFiles(root)
  const fileSet = new Set(files)
  const graph = new Map(files.map((file) => [file, []]))
  for (const file of files) {
    const dependencies = importedSpecifiers(readFileSync(file, 'utf8'), file)
      .map((specifier) => resolveRelativeImport(file, specifier))
      .filter((target) => target && fileSet.has(target))
    graph.set(file, [...new Set(dependencies)].sort())
  }

  let index = 0
  const indexes = new Map()
  const lowLinks = new Map()
  const stack = []
  const onStack = new Set()
  const cycles = []

  const visit = (file) => {
    indexes.set(file, index)
    lowLinks.set(file, index)
    index += 1
    stack.push(file)
    onStack.add(file)

    for (const dependency of graph.get(file) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency)
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)))
      } else if (onStack.has(dependency)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(dependency)))
      }
    }

    if (lowLinks.get(file) !== indexes.get(file)) return
    const component = []
    let member
    do {
      member = stack.pop()
      onStack.delete(member)
      component.push(relative(root, member).replaceAll('\\', '/'))
    } while (member !== file)

    const selfLoop = component.length === 1 && (graph.get(file) ?? []).includes(file)
    if (component.length > 1 || selfLoop) cycles.push(component.sort())
  }

  for (const file of files) if (!indexes.has(file)) visit(file)
  return cycles.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
}

function formatCycle(rootDir, cycle) {
  const prefix = relative(process.cwd(), resolve(rootDir)).replaceAll('\\', '/')
  const paths = cycle.map((file) => prefix && prefix !== '.' ? `${prefix}/${file}` : file)
  return [...paths, paths[0]].join(' -> ')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDir = process.argv[2] ?? 'src'
  const cycles = findModuleCycles(rootDir)
  if (cycles.length) {
    console.error('模块循环依赖：')
    for (const cycle of cycles) console.error(formatCycle(rootDir, cycle))
    process.exitCode = 1
  } else {
    console.log('模块循环依赖检查通过：0 个循环。')
  }
}
