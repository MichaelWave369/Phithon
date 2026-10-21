import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

const cli = resolve("src/cli.js");
const main = resolve("examples/packages/main.phi");
const args = (parts) => execFileSync(process.execPath, [cli, ...parts], { encoding: "utf8", timeout: 10000 });

test("R4 example executes local modules with imports, exports and dependencies", () => {
  const output = args([main]);
  assert.match(output, /3 x 3 = 9/);
  assert.match(output, /2 x \(3 x 3\) = 18/);
  assert.match(output, /Mean of 10 and 20 = 15/);
  assert.match(output, /3-4-5 hypotenuse = 5/);
});
test("CLI check resolves package graph without executing", () => {
  const output = args(["check", main]);
  assert.match(output, /Syntax OK/);
  assert.match(output, /2 modules/);
  assert.doesNotMatch(output, /3 x 3 = 9/);
});
test("local modular programs support CLI execution and static checking", () => {
  assert.match(args(["check", main]), /2 modules/);
});
test("legacy standalone CLI and integrity receipt checks still work", () => {
  const program = resolve("examples/hello.phi");
  assert.match(args([program]), /Welcome to PhiThon/);
  assert.match(args(["check", program]), /0 modules/);
});
test("manifest filenames and source have safe bounds", async () => {
  const manifest = JSON.parse(await readFile(resolve("examples/packages/phithon.pack.json"), "utf8"));
  assert.equal(manifest.schema, "phithon.package.v1");
  assert.deepEqual(Object.keys(manifest.modules), ["numbers", "geometry"]);
});
