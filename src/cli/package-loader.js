/**
 * PhiPack local-only package manifest loader (Node CLI).
 *
 * A package is an optional phithon.pack.json beside the entry .phi file.
 * Module paths are strictly single basenames in the same directory.
 * We never resolve URLs, run installers, traverse parent folders, or
 * follow symlinks to module source. No dependency downloads.
 */
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateModuleRegistry } from "../language/package.js";

const MANIFEST = "phithon.pack.json";
const SOURCE_FILE = /^[A-Za-z0-9_-]+\.phi$/;
const PACKAGE_NAME = /^[a-z][a-z0-9-]{0,47}$/;

function sameKeys(obj, expected) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).sort();
  return keys.length === expected.length &&
    expected.slice().sort().every((name, i) => keys[i] === name);
}

/**
 * Returns the declared module sources; an absent manifest means no modules.
 * Existing malformed or unreadable manifests fail closed.
 */
export async function loadProjectModules(entryFile) {
  const folder = dirname(entryFile);
  const manifestPath = join(folder, MANIFEST);
  let meta;
  try { meta = await lstat(manifestPath); }
  catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 8192) {
    throw new Error("PhiPack: manifest must be a regular file at most 8 KiB");
  }
  const raw = await readFile(manifestPath, "utf8");
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("PhiPack: invalid JSON manifest"); }
  if (!sameKeys(data, ["schema", "name", "version", "modules"]) ||
      data.schema !== "phithon.package.v1" ||
      typeof data.name !== "string" || !PACKAGE_NAME.test(data.name) ||
      typeof data.version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.version) ||
      !data.modules || typeof data.modules !== "object" || Array.isArray(data.modules)) {
    throw new Error("PhiPack: expected schema/name/version/modules");
  }
  const sources = Object.create(null);
  const declarations = Object.entries(data.modules);
  if (declarations.length > 32) throw new Error("PhiPack: module limit exceeded");
  let totalBytes = 0;
  for (const [name, filename] of declarations) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ||
        typeof filename !== "string" || !SOURCE_FILE.test(filename)) {
      throw new Error("PhiPack: invalid module mapping for " + name);
    }
    const path = join(folder, filename);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 40_000) {
      throw new Error("PhiPack: module must be a regular .phi file under 40 KB");
    }
    totalBytes += info.size;
    if (totalBytes > 200_000) throw new Error("PhiPack: total module file size exceeds 200 KB");
    const source = await readFile(path, "utf8");
    if (Buffer.byteLength(source, "utf8") > 40_000) throw new Error("PhiPack: module too large");
    sources[name] = source;
  }
  validateModuleRegistry(sources);
  return sources;
}
