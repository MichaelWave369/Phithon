/**
 * PhiThon R4 local module analysis.
 * These checks parse files and inspect dependencies only. They do not execute
 * module initializers, functions, or PhiThon top-level statements.
 */
import { parse } from "./core.js";

const IDENT = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_MODULES = 32;
const MAX_MODULE_CHARS = 40_000;
const MAX_REGISTRY_CHARS = 200_000;

export function validateModuleRegistry(modules = {}) {
  if (modules === null || typeof modules !== "object" || Array.isArray(modules)) {
    throw new TypeError("PhiPack: modules must be an object");
  }
  const names = Object.keys(modules);
  if (names.length > MAX_MODULES) throw new TypeError("PhiPack: too many modules (limit 32)");
  let total = 0;
  for (const name of names) {
    if (!IDENT.test(name)) throw new TypeError("PhiPack: invalid module name " + name);
    const source = modules[name];
    if (typeof source !== "string" || source.length > MAX_MODULE_CHARS) {
      throw new TypeError("PhiPack: module exceeds 40,000 chars: " + name);
    }
    total += source.length;
  }
  if (total > MAX_REGISTRY_CHARS) throw new TypeError("PhiPack: modules exceed 200,000 chars");
  return names;
}

function findImports(nodes) {
  const names = [];
  const walk = node => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.tag === "import") names.push(node.name);
    // Walk statement bodies and branches only. Expressions cannot import.
    if (node.tag === "fn" || node.tag === "block" || node.tag === "while") {
      walk(node.body);
    } else if (node.tag === "if") {
      walk(node.yes);
      walk(node.no);
    } else if (node.tag === "export") {
      walk(node.declaration);
    }
  };
  walk(nodes);
  return names;
}

/** Pure syntax and static dependency inspection, no PhiThon execution. */
export function analyzePackage(entrySource, modules = {}) {
  if (typeof entrySource !== "string" || entrySource.length > 100_000) {
    throw new TypeError("PhiPack: entry source too large or invalid");
  }
  const names = validateModuleRegistry(modules);
  const graph = Object.create(null);
  const tree = parse(entrySource);
  const entryImports = findImports(tree);
  for (const name of names) {
    const ast = parse(modules[name]);
    const exports = new Set();
    for (const node of ast) {
      if (!["empty", "let", "fn", "export", "import", "use"].includes(node.tag)) {
        throw new TypeError("PhiPack: module " + name + " has executable top-level statement");
      }
      if (node.tag === "export") {
        if (exports.has(node.declaration.name)) {
          throw new TypeError("PhiPack: duplicate export " + name + "_" + node.declaration.name);
        }
        exports.add(node.declaration.name);
      }
    }
    graph[name] = findImports(ast);
  }

  const visited = new Set(), visiting = new Set(), order = [];
  function visit(name, parents = []) {
    if (!Object.hasOwn(graph, name)) throw new TypeError("PhiPack: unresolved import " + name);
    if (visiting.has(name)) throw new TypeError("PhiPack: circular import " + [...parents, name].join(" -> "));
    if (visited.has(name)) return;
    if (parents.length >= 16) throw new TypeError("PhiPack: import depth exceeds 16");
    visiting.add(name);
    for (const dependency of graph[name]) visit(dependency, [...parents, name]);
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }
  for (const name of entryImports) visit(name);
  // Scan even unused modules so malformed package files never silently pass check.
  for (const name of names) visit(name);
  return { valid: true, statements: tree.length, modules: names.length, imports: entryImports, order };
}
