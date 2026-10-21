/**
 * PhiThon opt-in language modules.
 * No host capabilities are granted by importing a module.
 * Each module installs into the lexical scope executing the use statement.
 * NBG helpers are graph teaching primitives, NOT NBG closure research validation.
 */
export function installModule(name, env, helpers, at) {
  const { PhiError, num, valid } = helpers;
  const builtin = (symbol, count, fn) =>
    env.define(symbol, { tag: "builtin", name: symbol, min: count, max: count, f: fn }, at);

  function boundedInteger(value, min, max, loc, label) {
    num(value, loc);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new PhiError(label + " requires integer " + min + ".." + max, loc);
    }
    return value;
  }
  function numericArray(value, loc, nonempty = false) {
    if (!Array.isArray(value) || value.length > 1000 || (nonempty && value.length === 0)) {
      throw new PhiError("Expected a bounded numeric array" + (nonempty ? " with at least one item" : ""), loc);
    }
    for (const item of value) num(item, loc);
    return value;
  }
  if (name === "math") {
    builtin("math_abs", 1, ([x], loc) => valid(Math.abs(num(x, loc)), loc));
    builtin("math_sqrt", 1, ([x], loc) => {
      num(x, loc);
      if (x < 0) throw new PhiError("math_sqrt expects nonnegative input", loc);
      return valid(Math.sqrt(x), loc);
    });
    builtin("math_pow", 2, ([base, exponent], loc) =>
      valid(Math.pow(num(base, loc), num(exponent, loc)), loc));
    builtin("math_sin", 1, ([x], loc) => valid(Math.sin(num(x, loc)), loc));
    builtin("math_cos", 1, ([x], loc) => valid(Math.cos(num(x, loc)), loc));
    builtin("math_pi", 0, () => Math.PI);
    builtin("math_tau", 0, () => Math.PI * 2);
    builtin("math_clamp", 3, ([value, lower, upper], loc) => {
      const x = num(value, loc), lo = num(lower, loc), hi = num(upper, loc);
      if (lo > hi) throw new PhiError("math_clamp lower bound exceeds upper bound", loc);
      return Math.min(hi, Math.max(lo, x));
    });
    builtin("math_sum", 1, ([values], loc) => {
      const list = numericArray(values, loc);
      let sum = 0, correction = 0;
      for (const x of list) {
        const y = x - correction, next = sum + y;
        correction = (next - sum) - y;
        sum = valid(next, loc);
      }
      return sum;
    });
    builtin("math_mean", 1, ([values], loc) => {
      const list = numericArray(values, loc, true);
      let sum = 0;
      for (const v of list) sum = valid(sum + v / list.length, loc);
      return sum;
    });
    builtin("math_distance", 4, ([x1, y1, x2, y2], loc) =>
      valid(Math.hypot(num(x2, loc) - num(x1, loc), num(y2, loc) - num(y1, loc)), loc));
    return;
  }

  if (name === "nbg") {
    // Undirected simple cycle C_n, NOT the Nested Bubble/Gear research model.
    builtin("nbg_cycle", 1, ([size], loc) => {
      const n = boundedInteger(size, 3, 64, loc, "nbg_cycle size");
      return Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
    });
    builtin("nbg_neighbors", 2, ([size, vertex], loc) => {
      const n = boundedInteger(size, 3, 64, loc, "nbg_neighbors size");
      const v = boundedInteger(vertex, 0, n - 1, loc, "nbg_neighbors vertex");
      return [(v - 1 + n) % n, (v + 1) % n];
    });
    return;
  }

  throw new PhiError("Unknown module '" + name + "'. Available modules: math, nbg", at);
}
