import test from "node:test";
import assert from "node:assert/strict";
import { execute, PhiError, parse } from "../src/language/core.js";

test("use math is an actual parsed statement", () => {
  const program = parse("use math\nprint(math_pi())");
  assert.equal(program[0].tag, "use");
  assert.equal(program[0].name, "math");
});

test("math is opt-in, not ambient", () => {
  assert.throws(() => execute("math_sqrt(4)"), /Unknown name 'math_sqrt'/);
  assert.deepEqual(execute("use math; print(math_sqrt(4))").output, ["2"]);
});

test("math functions operate on bounded numeric inputs", () => {
  const out = execute("use math; print(math_abs(-4), math_pow(2, 5), math_mean([3,6,9]), math_clamp(12,0,10))").output;
  assert.deepEqual(out, ["4 32 6 10"]);
  assert.deepEqual(execute("use math; print(math_sum([1,2,3,4]))").output, ["10"]);
  assert.deepEqual(execute("use math; print(math_distance(0,0,3,4))").output, ["5"]);
});

test("math rejects nonfinite results and incorrect types", () => {
  assert.throws(() => execute("use math; math_sqrt(-1)"), /nonnegative/);
  assert.throws(() => execute("use math; math_mean([])"), /bounded numeric array/);
  assert.throws(() => execute("use math; math_sum([1,'wrong'])"), /Expected number/);
  assert.throws(() => execute("use math; math_pow(99,999)"), /Non-finite/);
  assert.throws(() => execute("use math; math_clamp(2,3,1)"), /lower bound exceeds/);
});

test("an imported module is lexical, not global", () => {
  assert.throws(() => execute("if(true){ use math; print(math_abs(-5)) } print(math_abs(-5))"), /Unknown name/);
  assert.deepEqual(execute("if(true){ use math; print(math_abs(-5)) }").output, ["5"]);
});

test("unknown and repeated module imports fail transparently", () => {
  assert.throws(() => execute("use nothing"), /Unknown module/);
  assert.throws(() => execute("use math; use math"), /Already defined/);
});

test("toy NBG graph helpers return deterministic undirected C_n topology", () => {
  const code = "use nbg; print(nbg_neighbors(6,0)); print(nbg_cycle(4))";
  assert.deepEqual(execute(code).output, ["[5, 1]", "[[0, 1], [1, 2], [2, 3], [3, 0]]"]);
});

test("toy NBG guards reject invalid graph sizes and vertex indexes", () => {
  assert.throws(() => execute("use nbg; nbg_cycle(2)"), /3..64/);
  assert.throws(() => execute("use nbg; nbg_neighbors(6,6)"), /0..5/);
  assert.throws(() => execute("nbg_cycle(6)"), /Unknown name/);
});

test("base R0 Fibonacci demo still works", () => {
  const result = execute("let i=0; while(i<5){print(fib(i));i=i+1}");
  assert.deepEqual(result.output, ["0","1","1","2","3"]);
  assert.equal(result.steps > 0, true);
});
