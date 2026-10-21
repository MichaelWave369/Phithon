import { installModule } from "./modules.js";
/**
 * PhiThon R0: independently implemented language, NOT Python-compatible.
 * No JS eval(), host objects, file/network APIs. Budgets are NOT a strong sandbox.
 */
function buildPhiThon() {
  class PhiError extends Error {
    constructor(message, token = { line: 1, col: 1 }) {
      super(`PhiThon ${token.line}:${token.col}: ${message}`);
      this.name = "PhiError";
      this.line = token.line; this.column = token.col;
    }
  }
  const keys = new Set(["import", "export", "use", "let", "fn", "return", "if", "else", "while", "true", "false", "null"]);
  const pairs = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
  const singles = new Set("+-*/%!=<>(){}[],;");
  const precedence = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
  function tokenize(src) {
    if (typeof src !== "string" || src.length > 100000) throw new PhiError("Source must be text under 100,000 characters");
    let i = 0, line = 1, col = 1;
    const out = [], peek = (n = 0) => src[i + n] ?? "";
    function take() { const c = src[i++]; if (c === "\n") { line++; col = 1; } else col++; return c; }
    function push(kind, value, at) {
      out.push({ kind, value, line: at.line, col: at.col });
      if (out.length > 50000) throw new PhiError("Token limit exceeded", at);
    }
    while (i < src.length) {
      const c = peek(), at = { line, col };
      if (/\s/.test(c)) { take(); continue; }
      if (c === "#" || (c === "/" && peek(1) === "/")) { while (i < src.length && peek() !== "\n") take(); continue; }
      if (/[0-9]/.test(c)) {
        let s = ""; while (/[0-9]/.test(peek())) s += take();
        if (peek() === "." && /[0-9]/.test(peek(1))) {
          s += take(); while (/[0-9]/.test(peek())) s += take();
        }
        if (!Number.isFinite(Number(s))) throw new PhiError("Numeric literal too large", at);
        push("num", Number(s), at); continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        let word = ""; while (/[a-zA-Z0-9_]/.test(peek())) word += take();
        push(keys.has(word) ? "kw" : "id", word, at); continue;
      }
      if (c === "'" || c === '"') {
        const q = take(); let s = "", closed = false;
        while (i < src.length) {
          if (peek() === q) { take(); closed = true; break; }
          let v = take();
          if (v === "\\") {
            const escape = take(), map = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"' };
            if (!Object.hasOwn(map, escape)) throw new PhiError("Invalid string escape", at);
            v = map[escape];
          }
          s += v;
        }
        if (!closed) throw new PhiError("Unterminated string", at);
        push("str", s, at); continue;
      }
      if (pairs.has(c + peek(1))) { push("op", take() + take(), at); continue; }
      if (singles.has(c)) { push("op", take(), at); continue; }
      throw new PhiError(`Unexpected character ${JSON.stringify(c)}`, at);
    }
    push("eof", "<eof>", { line, col });
    return out;
  }
  class Parser {
    constructor(src) { this.ts = tokenize(src); this.i = 0; this.depth = 0; }
    t() { return this.ts[this.i]; }
    next() { return this.ts[this.i + 1]; }
    take(s) { if (this.t().value === s) { this.i++; return true; } return false; }
    need(s) { if (!this.take(s)) throw new PhiError(`Expected '${s}', got '${this.t().value}'`, this.t()); }
    ident() { const t = this.t(); if (t.kind !== "id") throw new PhiError("Expected a name", t); this.i++; return t.value; }
    program() { const body = []; while (this.t().kind !== "eof") body.push(this.stmt()); return body; }
    block() {
      const at = this.t(); this.need("{"); const body = [];
      while (this.t().value !== "}") {
        if (this.t().kind === "eof") throw new PhiError("Unclosed block", at);
        body.push(this.stmt());
      }
      this.need("}"); return { tag: "block", body, at };
    }
    stmt() {
      const at = this.t();
      if (this.take(";")) return { tag: "empty", at };
      if (this.take("import")) {
        const name = this.ident(); this.take(";");
        return { tag: "import", name, at };
      }
      if (this.take("export")) {
        const declaration = this.stmt();
        if (!["let", "fn"].includes(declaration.tag)) throw new PhiError("export requires let or fn", at);
        return { tag: "export", declaration, at };
      }
      if (this.take("use")) {
        const name = this.ident(); this.take(";");
        return { tag: "use", name, at };
      }
      if (this.take("let")) {
        const name = this.ident(); this.need("="); const value = this.expr(); this.take(";");
        return { tag: "let", name, value, at };
      }
      if (this.take("fn")) {
        const name = this.ident(); this.need("("); const params = [];
        if (!this.take(")")) { do { params.push(this.ident()); } while (this.take(",")); this.need(")"); }
        if (new Set(params).size !== params.length) throw new PhiError("Duplicate parameter", at);
        return { tag: "fn", name, params, body: this.block(), at };
      }
      if (this.take("return")) { const value = this.expr(); this.take(";"); return { tag: "return", value, at }; }
      if (this.take("if")) {
        this.need("("); const condition = this.expr(); this.need(")");
        const yes = this.block(), no = this.take("else") ? this.block() : null;
        return { tag: "if", condition, yes, no, at };
      }
      if (this.take("while")) {
        this.need("("); const condition = this.expr(); this.need(")");
        return { tag: "while", condition, body: this.block(), at };
      }
      if (this.t().value === "{") return this.block();
      if (this.t().kind === "id" && this.next().value === "=") {
        const name = this.ident(); this.need("="); const value = this.expr(); this.take(";");
        return { tag: "assign", name, value, at };
      }
      const value = this.expr(); this.take(";");
      return { tag: "expr", value, at };
    }
    expr(min = 1) {
      if (++this.depth > 200) throw new PhiError("Expression nesting limit exceeded", this.t());
      try {
        let left = this.atom();
        while (true) {
          const t = this.t(), p = precedence[t.value] || 0;
          if (p < min) break;
          this.i++;
          left = { tag: "binary", op: t.value, left, right: this.expr(p + 1), at: t };
        }
        return left;
      } finally { this.depth--; }
    }
    atom() {
      const at = this.t(); let node;
      if (this.take("-") || this.take("!")) {
        node = { tag: "unary", op: at.value, value: this.expr(7), at };
      } else if (at.kind === "num" || at.kind === "str") {
        this.i++; node = { tag: "literal", value: at.value, at };
      } else if (["true", "false", "null"].includes(at.value)) {
        this.i++; node = { tag: "literal", value: at.value === "null" ? null : at.value === "true", at };
      } else if (at.kind === "id") {
        this.i++; node = { tag: "var", name: at.value, at };
      } else if (this.take("(")) {
        node = this.expr(); this.need(")");
      } else if (this.take("[")) {
        const values = [];
        if (!this.take("]")) { do { values.push(this.expr()); } while (this.take(",")); this.need("]"); }
        node = { tag: "array", values, at };
      } else throw new PhiError("Expected expression", at);
      while (true) {
        if (this.take("(")) {
          const args = [];
          if (!this.take(")")) { do { args.push(this.expr()); } while (this.take(",")); this.need(")"); }
          node = { tag: "call", target: node, args, at };
        } else if (this.take("[")) {
          const idx = this.expr(); this.need("]");
          node = { tag: "index", target: node, idx, at };
        } else break;
      }
      return node;
    }
  }
  function parse(src) { return new Parser(src).program(); }
  class Scope {
    constructor(parent = null) { this.parent = parent; this.vars = new Map(); }
    define(name, value, at) { if (this.vars.has(name)) throw new PhiError(`Already defined '${name}'`, at); this.vars.set(name, value); }
    get(name, at) {
      if (this.vars.has(name)) return this.vars.get(name);
      if (this.parent) return this.parent.get(name, at);
      throw new PhiError(`Unknown name '${name}'`, at);
    }
    set(name, value, at) {
      if (this.vars.has(name)) { this.vars.set(name, value); return value; }
      if (this.parent) return this.parent.set(name, value, at);
      throw new PhiError(`Cannot assign undeclared '${name}'`, at);
    }
  }
  class Returned { constructor(value) { this.value = value; } }
  const truthy = (v) => v !== null && v !== false && v !== 0 && v !== "";
  function display(v, depth = 0) {
    if (v === null) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return depth > 4 ? "[...]" : "[" + v.map(x => display(x, depth + 1)).join(", ") + "]";
    if (v && typeof v === "object" && (v.tag === "fn" || v.tag === "builtin")) return `<fn ${v.name}>`;
    return String(v);
  }
  function execute(src, opts = {}) {
    const ast = parse(src);
    const limit = (n, d, max) => Number.isInteger(n) && n > 0 ? Math.min(n, max) : d;
    const stepLimit = limit(opts.maxSteps, 30000, 500000), outLimit = limit(opts.maxOutputChars, 12000, 50000);
    const output = [], ledger = [], root = new Scope();
    const moduleSources = opts.modules ?? {};
    if (!moduleSources || typeof moduleSources !== "object" || Array.isArray(moduleSources)) {
      throw new PhiError("Module registry must be a named source map");
    }
    const moduleNames = Object.keys(moduleSources);
    if (moduleNames.length > 32) throw new PhiError("Module registry exceeds 32 modules");
    let moduleBytes = 0;
    for (const name of moduleNames) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) throw new PhiError("Invalid module name: " + name);
      const source = moduleSources[name];
      if (typeof source !== "string" || source.length > 40_000) throw new PhiError("Module source too large: " + name);
      moduleBytes += source.length;
    }
    if (moduleBytes > 200_000) throw new PhiError("Module registry exceeds 200,000 characters");
    const moduleCache = new Map(), loading = new Set();
    function importModule(name, env, at) {
      if (!Object.hasOwn(moduleSources, name)) throw new PhiError("Unknown local module: " + name, at);
      if (loading.has(name)) throw new PhiError("Circular module dependency: " + [...loading, name].join(" -> "), at);
      if (!moduleCache.has(name)) {
        if (loading.size >= 16) throw new PhiError("Module import depth exceeded", at);
        loading.add(name);
        try {
          const scope = new Scope(root), exported = new Map();
          const ast = parse(moduleSources[name]);
          for (const declaration of ast) {
            tick(declaration.at);
            if (!["let", "fn", "export", "import", "use", "empty"].includes(declaration.tag)) {
              throw new PhiError("Module top level permits declarations and imports only", declaration.at);
            }
            runStatement(declaration, scope, exported);
          }
          moduleCache.set(name, exported);
        } finally {
          loading.delete(name);
        }
      }
      for (const [symbol, value] of moduleCache.get(name)) {
        env.define(name + "_" + symbol, value, at);
      }
    }
    let steps = 0, size = 0, callDepth = 0;
    function tick(at) { if (++steps > stepLimit) throw new PhiError(`Step limit (${stepLimit}) exceeded`, at); }
    function num(v, at) { if (typeof v !== "number") throw new PhiError("Expected number", at); return v; }
    function valid(v, at) { if (!Number.isFinite(v)) throw new PhiError("Non-finite result", at); return v; }
    function built(name, min, max, f) { root.define(name, { tag: "builtin", name, min, max, f }); }
    built("print", 0, 32, (args, at) => {
      const text = args.map(x => display(x)).join(" ");
      if ((size += text.length + 1) > outLimit) throw new PhiError("Output limit exceeded", at);
      output.push(text); return null;
    });
    built("len", 1, 1, ([v], at) => {
      if (typeof v !== "string" && !Array.isArray(v)) throw new PhiError("len expects text or array", at);
      return v.length;
    });
    built("type", 1, 1, ([v]) => v === null ? "null" : Array.isArray(v) ? "array" : v && v.tag ? "function" : typeof v);
    built("phi", 0, 0, () => (1 + Math.sqrt(5)) / 2);
    built("fib", 1, 1, ([n], at) => {
      num(n, at);
      if (!Number.isInteger(n) || n < 0 || n > 78) throw new PhiError("fib requires 0..78", at);
      let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a;
    });
    built("range", 1, 1, ([n], at) => {
      num(n, at);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new PhiError("range requires 0..1000", at);
      return Array.from({ length: n }, (_, i) => i);
    });
    built("ledger", 2, 2, ([event, data], at) => {
      if (typeof event !== "string" || event.length > 120) throw new PhiError("ledger expects a short event name", at);
      if (ledger.length >= 1000) throw new PhiError("Ledger record limit exceeded", at);
      ledger.push({ sequence: ledger.length + 1, event, data: display(data), provenance: "SIMULATED" });
      return ledger.length;
    });
    function evalExpr(n, env) {
      tick(n.at);
      switch (n.tag) {
        case "literal": return n.value;
        case "var": return env.get(n.name, n.at);
        case "array":
          if (n.values.length > 1000) throw new PhiError("Array too large", n.at);
          return n.values.map(x => evalExpr(x, env));
        case "index": {
          const arr = evalExpr(n.target, env), index = evalExpr(n.idx, env);
          if (!Array.isArray(arr) && typeof arr !== "string") throw new PhiError("Can only index arrays or text", n.at);
          if (!Number.isInteger(index) || index < 0 || index >= arr.length) throw new PhiError("Index out of range", n.at);
          return arr[index];
        }
        case "unary": {
          const v = evalExpr(n.value, env);
          return n.op === "!" ? !truthy(v) : valid(-num(v, n.at), n.at);
        }
        case "binary": {
          const a = evalExpr(n.left, env);
          if (n.op === "&&") return truthy(a) ? evalExpr(n.right, env) : a;
          if (n.op === "||") return truthy(a) ? a : evalExpr(n.right, env);
          const b = evalExpr(n.right, env);
          if (n.op === "==") return a === b;
          if (n.op === "!=") return a !== b;
          if (n.op === "+" && (typeof a === "string" || typeof b === "string")) {
            const result = display(a) + display(b);
            if (result.length > 200000) throw new PhiError("String size exceeded", n.at);
            return result;
          }
          const x = num(a, n.at), y = num(b, n.at);
          switch (n.op) {
            case "+": return valid(x + y, n.at);
            case "-": return valid(x - y, n.at);
            case "*": return valid(x * y, n.at);
            case "/": if (y === 0) throw new PhiError("Division by zero", n.at); return valid(x / y, n.at);
            case "%": if (y === 0) throw new PhiError("Modulo by zero", n.at); return valid(x % y, n.at);
            case "<": return x < y;
            case "<=": return x <= y;
            case ">": return x > y;
            case ">=": return x >= y;
          }
          throw new PhiError("Unsupported operator", n.at);
        }
        case "call": {
          const f = evalExpr(n.target, env), args = n.args.map(x => evalExpr(x, env));
          if (!f || (f.tag !== "builtin" && f.tag !== "fn")) throw new PhiError("Not a function", n.at);
          if (f.tag === "builtin") {
            if (args.length < f.min || args.length > f.max) throw new PhiError(`${f.name} takes ${f.min === f.max ? f.min : f.min + ".." + f.max} argument(s)`, n.at);
            return f.f(args, n.at);
          }
          if (args.length !== f.params.length) throw new PhiError(`${f.name} takes ${f.params.length} argument(s)`, n.at);
          if (callDepth >= 64) throw new PhiError("Call depth exceeded", n.at);
          const local = new Scope(f.env);
          f.params.forEach((p, i) => local.define(p, args[i], n.at));
          callDepth++;
          try {
            try { runBlock(f.body, local); } catch (e) {
              if (e instanceof Returned) return e.value;
              throw e;
            }
            return null;
          } finally { callDepth--; }
        }
      }
      throw new PhiError("Unsupported expression", n.at);
    }
    function runBlock(b, parent) {
      const scope = new Scope(parent); let last = null;
      for (const n of b.body) last = runStatement(n, scope);
      return last;
    }
    function runStatement(n, env, exportSink = null) {
      tick(n.at);
      switch (n.tag) {
        case "empty": return null;
        case "import": importModule(n.name, env, n.at); return null;
        case "export": {
          if (!exportSink) throw new PhiError("export is only valid in module files", n.at);
          runStatement(n.declaration, env);
          if (exportSink.has(n.declaration.name)) throw new PhiError("Duplicate export: " + n.declaration.name, n.at);
          exportSink.set(n.declaration.name, env.get(n.declaration.name, n.at));
          return null;
        }
        case "use": installModule(n.name, env, { PhiError, num, valid }, n.at); return null;
        case "let": env.define(n.name, evalExpr(n.value, env), n.at); return null;
        case "assign": return env.set(n.name, evalExpr(n.value, env), n.at);
        case "fn": env.define(n.name, { tag: "fn", name: n.name, params: n.params, body: n.body, env }, n.at); return null;
        case "return": throw new Returned(evalExpr(n.value, env));
        case "expr": return evalExpr(n.value, env);
        case "block": return runBlock(n, env);
        case "if": return truthy(evalExpr(n.condition, env)) ? runBlock(n.yes, env) : n.no ? runBlock(n.no, env) : null;
        case "while": {
          let v = null;
          while (truthy(evalExpr(n.condition, env))) {
            tick(n.at); v = runBlock(n.body, env);
          }
          return v;
        }
      }
      throw new PhiError("Unsupported statement", n.at);
    }
    let result = null;
    try { for (const n of ast) result = runStatement(n, root); }
    catch (e) { if (e instanceof Returned) throw new PhiError("return outside function"); throw e; }
    return { result: display(result), output, ledger, steps };
  }
  return { execute, parse, tokenize, PhiError };
}
const { execute, parse, tokenize, PhiError } = buildPhiThon();
export { execute, parse, tokenize, PhiError };
