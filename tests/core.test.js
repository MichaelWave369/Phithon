import test from "node:test";
import assert from "node:assert/strict";
import { execute, tokenize, parse, PhiError } from "../src/language/core.js";

test("tokenizer preserves source position", () => {
  const ts = tokenize("let x=2\nprint(x)");
  assert.equal(ts[4].line, 2);
  assert.equal(ts[4].col, 1);
  assert.equal(ts.at(-1).kind, "eof");
});
test("parser produces statements", () => {
  assert.equal(parse("let x=2\nprint(x)").length, 2);
});
test("arithmetic precedence and numeric comparisons", () => {
  assert.deepEqual(execute("print(2+3*4, 7>=7, 7==8)").output, ["14 true false"]);
});
test("strings, comments, arrays and indexing", () => {
  const src = "let x=[10,20,30] # this is a comment\nprint(len(x), x[1], 'hello')";
  assert.deepEqual(execute(src).output, ["3 20 hello"]);
});
test("functions, lexical scopes and recursion", () => {
  const src = "fn fact(n){if(n<=1){return 1}return n*fact(n-1)}print(fact(5))";
  assert.deepEqual(execute(src).output, ["120"]);
});
test("loops and assignment", () => {
  assert.deepEqual(execute("let n=0\nwhile(n<3){print(n);n=n+1}").output, ["0","1","2"]);
});
test("short-circuit boolean logic", () => {
  assert.deepEqual(execute("print(false && (1/0), true || (1/0))").output, ["false true"]);
});
test("built-in math and ledger events", () => {
  const result=execute('print(fib(7), phi())\nledger("TEST","hello")');
  assert.ok(result.output[0].startsWith("13 1.618"));
  assert.deepEqual(result.ledger, [{ sequence:1, event:"TEST", data:"hello", provenance:"SIMULATED" }]);
});
test("division by zero reports a PhiThon error", () => {
  assert.throws(() => execute("print(1/0)"), PhiError);
});
test("no JavaScript host global access", () => {
  assert.throws(() => execute("print(globalThis)"), /Unknown name/);
  assert.throws(() => execute("print(process)"), /Unknown name/);
});
test("infinite loops stop on the execution budget", () => {
  assert.throws(() => execute("while(true){}", { maxSteps: 100 }), /Step limit/);
});
test("recursive calls have a limit", () => {
  assert.throws(() => execute("fn f(){return f()}f()"), /Call depth exceeded/);
});
test("source cap and bad syntax are rejected", () => {
  assert.throws(() => execute("@"), PhiError);
  assert.throws(() => execute("let x ="), PhiError);
  assert.throws(() => execute("a".repeat(100001)), PhiError);
});
test("builtins validate arguments", () => {
  assert.throws(() => execute("fib(99)"), /fib requires/);
  assert.throws(() => execute("len(2)"), /len expects/);
  assert.throws(() => execute("range(1001)"), /range requires/);
});
test("top-level return cannot escape", () => {
  assert.throws(() => execute("return 9"), /return outside function/);
});
