# PhiPack R4: local reusable PhiThon modules

PhiPack is a **small local-only module system** for sharing reusable source between .phi programs. It is intentionally not a remote package registry, installer, executable Node plugin system, or Python compatibility layer.

## Hello, imports

An entry program can import a named module:

```phi
import numbers
print(numbers_triple(7))
```

The library file numbers.phi exports reusable bindings:

```phi
export let multiplier = 3

export fn triple(value) {
  return value * multiplier
}
```

The importer sees exported names with a **module-name prefix**, such as `numbers_triple` and `numbers_multiplier`. Private functions and variables stay inside the module's own lexical scope. Module functions retain access to their private variables. Nested modules are supported:

```phi
# geometry.phi
import numbers
export fn double_triple(x) {
  return numbers_triple(x) * 2
}
```

An import can appear in a program or within a block. Imports are scoped; repeating the same import in the same scope is an error. Module dependencies are checked for cycles. Modules can use existing built-in `use math` / `use nbg` declarations.

## Manifest

For local CLI use, put `phithon.pack.json` **next to the entry .phi file**:

```json
{
  "schema": "phithon.package.v1",
  "name": "my-local-libraries",
  "version": "0.1.0",
  "modules": {
    "numbers": "numbers.phi",
    "geometry": "geometry.phi"
  }
}
```

Names are ASCII identifiers up to 40 characters. Module filenames must be **single basenames** matching simple safe .phi filenames. Paths containing directories, parent traversal, URLs, or absolute paths are rejected. Symlinked module files and symlinked manifests are rejected. Each module is capped at 40,000 UTF-8 bytes; the registry is limited to 32 entries and 200,000 bytes in total.

R4 never searches registries or downloads modules; it reads only files explicitly listed in the adjacent manifest. An absent manifest means there are no local modules; a malformed manifest fails closed.

## Commands

```sh
npm run phi -- examples/packages/main.phi
npm run phi -- check examples/packages/main.phi
```

`check` tokenizes/parses the main source and module source, verifies imports and cycles, and refuses executable top-level statements in libraries **without executing PhiThon statements**. A library's top-level may contain `let`, `fn`, `export let`, `export fn`, `import`, and `use`; top-level variable initializers are evaluated when imported during ordinary execution, so only import libraries you trust.

In the browser, open **Library Workshop**. Edit individual module sources, then use Run. To reproduce the program locally, save the main .phi, each library .phi and the manifest into a shared directory. This is a manual multi-file export, not a ZIP installer or cloud registry.

## Intentional limitations

- Only explicit local module name imports are supported. No HTTP imports, Python-style dotted module paths, dynamic filenames or arbitrary JS modules.
- Modules have independent lexical scopes with prefixed exported bindings, not Python `from ... import` syntax.
- R4 imports are evaluated when first used within a program execution. No persistent module cache across separate program runs.
- A package's source files must be trusted. Neither Node subprocess boundaries nor browser Web Workers are hardened hostile-code sandboxes.
- **R2 receipts do not include imported module source hashes.** R4 therefore blocks receipt generation for runs where any local module registry was loaded rather than producing misleading records. Standalone module-free receipts continue to work; a future receipt schema can properly bind the full module dependency tree.
- There is no package publishing, dependency installer, semver resolution or remote registry.

**Ledger above ego:** unresolved dependencies and unbound receipts must fail visibly.
