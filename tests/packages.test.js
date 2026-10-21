import test from "node:test";
import assert from "node:assert/strict";
import { execute, parse } from "../src/language/core.js";
import { analyzePackage, validateModuleRegistry } from "../src/language/package.js";

const modules = {
  numbers: [
    "use math",
    "export let multiplier = 3",
    "export fn triple(x) { return x * multiplier }",
    "export fn average(a,b) { return math_mean([a,b]) }"
  ].join("\n"),
  geometry: [
    "import numbers",
    "export fn doubled_triple(x) { return numbers_triple(x) * 2 }"
  ].join("\n")
};

test("import and export are first-class syntax", () => {
  const ast = parse("import numbers\nprint(numbers_triple(1))");
  assert.equal(ast[0].tag, "import");
  assert.equal(ast[0].name, "numbers");
  const definitions = parse("export let x = 3\nexport fn f() { return x }");
  assert.deepEqual(definitions.map(x => x.tag), ["export", "export"]);
});

test("user .phi modules support private variables, exports and transitive imports", () => {
  const source = [
    "import geometry",
    "import numbers",
    "print(geometry_doubled_triple(3), numbers_average(4,8))"
  ].join("\n");
  assert.deepEqual(execute(source, { modules }).output, ["18 6"]);
  const analysis = analyzePackage(source, modules);
  assert.deepEqual(analysis.order, ["numbers", "geometry"]);
  assert.equal(analysis.modules, 2);
});

test("a function retains its module's private lexical environment", () => {
  const output = execute("import numbers; print(numbers_triple(2))", { modules }).output;
  assert.deepEqual(output, ["6"]);
  assert.throws(() => execute("import numbers; print(multiplier)", { modules }), /Unknown name/);
});

test("undeclared exports cannot be imported", () => {
  assert.throws(() => execute("import numbers; print(numbers_nonexistent)", { modules }), /Unknown name/);
});

test("import cannot execute module top-level expressions", () => {
  assert.throws(() => execute("import bad", { modules: { bad: 'print("surprise")' } }), /top level permits declarations/);
  assert.throws(() => analyzePackage("import bad", { bad: 'while(true) {}' }), /executable top-level/);
});

test("imports are lexical and cannot be repeated in a scope", () => {
  assert.throws(() => execute("if(true){ import numbers } print(numbers_triple(3))", { modules }), /Unknown name/);
  assert.throws(() => execute("import numbers; import numbers", { modules }), /Already defined/);
});

test("unknown modules and circular dependency chains are rejected", () => {
  assert.throws(() => analyzePackage("import missing", {}), /unresolved import/);
  const circular = { a: "import b\nexport let x=1", b: "import a\nexport let y=2" };
  assert.throws(() => analyzePackage("import a", circular), /circular import/);
  assert.throws(() => execute("import a", { modules: circular }), /Circular module dependency/);
});

test("invalid exports and duplicate module exports fail", () => {
  assert.throws(() => parse("export print(1)"), /export requires/);
  assert.throws(() => execute("export let x=1"), /only valid in module/);
  assert.throws(() => analyzePackage("import bad", { bad: "export let x=1\nexport let x=2" }), /duplicate export/);
});

test("package validation forbids huge or malformed registries", () => {
  assert.throws(() => validateModuleRegistry({ "bad/name": "export let x=1" }), /invalid module/);
  assert.throws(() => validateModuleRegistry({ good: "x".repeat(40_001) }), /40,000/);
  assert.throws(() => validateModuleRegistry([]), /must be an object/);
  assert.throws(() => validateModuleRegistry(Object.fromEntries(Array.from({length:33},(_,i)=>["m"+i,""]))), /too many/);
});

test("legacy 'use math' and 'use nbg' still work unmodified", () => {
  assert.deepEqual(execute("use math; use nbg; print(math_sqrt(9), nbg_neighbors(6,0))").output, ["3 [5, 1]"]);
});

test("package check is syntax-only and never runs imports or while loops", () => {
  const source = "import numbers\nwhile(true){}";
  const analyzed = analyzePackage(source, modules);
  assert.equal(analyzed.valid, true);
  assert.equal(analyzed.statements, 2);
});
