import { useEffect, useRef, useState } from "react";
import { runInWorker } from "./language/runner.js";

const EXAMPLES = [
  { title: "Welcome, Field", label: "Hello World", code: [
    "# PhiThon R0: The Language of the Field",
    'let name = "Field"',
    'print("Hello, " + name + "!")',
    'print("Golden ratio =", phi())',
    "",
    "fn square(x) {",
    "  return x * x",
    "}",
    'print("Square of 9 =", square(9))',
    'ledger("HELLO_DEMO", "complete")'
  ].join("\n") },
  { title: "Fibonacci Lab", label: "Math", code: [
    "# Generate the first 10 Fibonacci values",
    "let i = 0",
    "while (i < 10) {",
    '  print("F(" + i + ") =", fib(i))',
    "  i = i + 1",
    "}",
    'ledger("FIB_SEQUENCE", "10 terms")'
  ].join("\n") },
  { title: "Function Forge", label: "Functions", code: [
    "# Functions, recursion and return values",
    "fn factorial(n) {",
    "  if (n <= 1) {",
    "    return 1",
    "  }",
    "  return n * factorial(n - 1)",
    "}",
    'print("5! =", factorial(5))',
    'print("7! =", factorial(7))'
  ].join("\n") },
  { title: "The Reality Gate", label: "Logic", code: [
    "# Experiment with the score and threshold",
    "let score = 0.82",
    "let threshold = 0.75",
    'print("Checking reality gate...")',
    "if (score >= threshold) {",
    '  print("PASS", score)',
    '  ledger("GATE_PASS", score)',
    "} else {",
    '  print("HOLD", score)',
    '  ledger("GATE_HOLD", score)',
    "}"
  ].join("\n") },
  { title: "PhiMath Lab", label: "R1 · Module", code: [
    "# Import math functions into this scope",
    "use math",
    "let data = [3, 6, 9, 12]",
    'print("Sum =", math_sum(data))',
    'print("Mean =", math_mean(data))',
    'print("Hypotenuse =", math_distance(0,0,3,4))',
    'print("Clamped =", math_clamp(1.8, 0, 1))'
  ].join("\n") },
  { title: "Bubble Cycle", label: "R1 · Toy Graph", code: [
    "# Simple cycle C6 only: NOT research-validated NBG",
    "use nbg",
    'print("Edges =", nbg_cycle(6))',
    'print("Neighbors of 0 =", nbg_neighbors(6, 0))',
    'ledger("TOY_GRAPH", "illustrative")'
  ].join("\n") }
];

const BUILTINS = [
  ["print(...)", "Write to output"],
  ["phi()", "Golden ratio"],
  ["fib(n)", "Fibonacci number"],
  ["len(x)", "Length of text / array"],
  ["range(n)", "Build number array"],
  ["ledger(event, value)", "Simulated memory receipt"],
  ["use math", "Optional numeric standard library"],
  ["use nbg", "Optional toy cycle graph functions"]
];

export default function App() {
  const [active, setActive] = useState(0);
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [output, setOutput] = useState(["Welcome to PhiThon R1.", "Press Run program to execute your .phi code."]);
  const [receipts, setReceipts] = useState([]);
  const [status, setStatus] = useState("ready");
  const [steps, setSteps] = useState(null);
  const [result, setResult] = useState(null);
  const controllerRef = useRef(null);
  const requestRef = useRef(0);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function loadExample(i) {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestRef.current++;
    setActive(i);
    setCode(EXAMPLES[i].code);
    setOutput(["Example loaded. Ready to run."]);
    setReceipts([]);
    setStatus("ready");
    setSteps(null);
    setResult(null);
  }
  async function runProgram() {
    // Each Run gets its own killable worker; older responses cannot repaint the editor.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = ++requestRef.current;
    setStatus("running");
    setOutput(["Running in dedicated worker..."]);
    setReceipts([]);
    setSteps(null);
    setResult(null);
    try {
      const data = await runInWorker(code, {
        signal: controller.signal,
        timeoutMs: 2500,
        maxSteps: 30000,
        maxOutputChars: 12000
      });
      if (request !== requestRef.current) return;
      setOutput(data.output.length ? data.output : ["Program finished without printed output."]);
      setReceipts(data.ledger);
      setSteps(data.steps);
      setResult(data.result);
      setStatus("ok");
    } catch (err) {
      if (request !== requestRef.current) return;
      if (controller.signal.aborted) return;
      setOutput([err instanceof Error ? err.message : String(err)]);
      setReceipts([]);
      setSteps(null);
      setResult(null);
      setStatus("error");
    } finally {
      if (request === requestRef.current) controllerRef.current = null;
    }
  }
  function cancelProgram() {
    if (!controllerRef.current) return;
    requestRef.current++;
    controllerRef.current.abort();
    controllerRef.current = null;
    setStatus("cancelled");
    setOutput(["Execution cancelled. Worker terminated."]);
    setReceipts([]);
    setSteps(null);
    setResult(null);
  }
  function onEditorKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runProgram(); }
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = e.target;
      setCode(code.slice(0, a) + "  " + code.slice(b));
      requestAnimationFrame(() => { e.target.selectionStart = a + 2; e.target.selectionEnd = a + 2; });
    }
  }
  function savePhiFile() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "program.phi";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="PhiThon home">
          <span className="brand-mark">Φ</span>
          <span><strong>PhiThon</strong><small>THE LANGUAGE OF THE FIELD</small></span>
        </a>
        <nav className="toplinks" aria-label="Site navigation">
          <a href="#playground">Playground</a>
          <a href="#reference">Reference</a>
          <a href="https://github.com/MichaelWave369/Phithon" target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
        <span className="version-pill"><span className="live-dot" /> R1 · OPEN SOURCE</span>
      </header>
      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> INTRODUCING Φ / RELEASE ONE</p>
            <h1>Code your <em>own</em><br />reality<span className="period">.</span></h1>
            <p className="hero-intro">A small, original programming language for curious minds. Write a little logic, bend some numbers, and watch it execute in your browser.</p>
            <div className="hero-actions">
              <a className="primary-link" href="#playground">Open the playground <span>↗</span></a>
              <span className="safe-note"><span>◇</span> No account. No server. Just code.</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orb orb-back" />
            <div className="orb orb-front" />
            <div className="orbital-ring ring-one" />
            <div className="orbital-ring ring-two" />
            <div className="phi-glyph">Φ</div>
            <div className="orbit-caption caption-top">0.2 / FIELD ENGINE</div>
            <div className="orbit-caption caption-bottom">LEDGER ABOVE EGO</div>
          </div>
        </section>
        <section className="stat-strip" aria-label="Runtime capabilities">
          <div><strong>01 /</strong> ORIGINAL TOKENIZER</div>
          <div><strong>02 /</strong> PRATT PARSER</div>
          <div><strong>03 /</strong> LIVE INTERPRETER</div>
          <div><strong>04 /</strong> KILLABLE WORKER</div>
        </section>
        <section className="workspace-section" id="playground">
          <div className="section-heading">
            <div><p className="eyebrow">WORKSPACE 01 / LIVE EXECUTION</p><h2>The Playground<span>.</span></h2></div>
            <p>Real language. Real parser. Real output.<br />No JavaScript eval tricks hiding behind the curtain.</p>
          </div>
          <div className="workspace">
            <aside className="sidebar">
              <span className="sidebar-label">EXPERIMENTS</span>
              {EXAMPLES.map((example, i) => (
                <button type="button" key={example.title} className={"example-button " + (active === i ? "active" : "")} onClick={() => loadExample(i)}>
                  <span className="example-number">0{i + 1}</span>
                  <span className="example-content"><b>{example.title}</b><small>{example.label}</small></span>
                  <span className="example-arrow">↗</span>
                </button>
              ))}
              <div className="sidebar-foot"><span className="tiny-symbol">⌘</span><p>Your edits stay in this tab. Saving a .phi file is optional.</p></div>
            </aside>
            <div className="editor-column">
              <div className="panel-bar">
                <div className="tab-label"><span className="file-icon">Φ</span> program.phi <span className="unsaved-dot" /></div>
                <div className="editor-meta"><span>PHITHON R1</span><span>UTF-8</span></div>
              </div>
              <label className="sr-only" htmlFor="source-code">PhiThon source code</label>
              <textarea id="source-code" aria-label="PhiThon source code editor" spellCheck={false} className="code-editor" value={code} onChange={e => setCode(e.target.value)} onKeyDown={onEditorKey} />
              <div className="editor-footer">
                <button type="button" className="run-button" onClick={runProgram}><span>▶</span> {status === "running" ? "Restart" : "Run program"} <kbd>Ctrl ↵</kbd></button>
                {status === "running" && <button type="button" className="cancel-button" onClick={cancelProgram}>■ Stop</button>}
                <button type="button" className="plain-button" onClick={savePhiFile}>↓ Save .phi</button>
                <span className="size-readout">{code.split("\n").length} LINES</span>
              </div>
            </div>
            <div className="terminal-column">
              <div className="panel-bar">
                <span className="terminal-title"><span className="terminal-indicator" /> OUTPUT / CONSOLE</span>
                <span className={"state-chip " + status}>{status.toUpperCase()}</span>
              </div>
              <div className="terminal-body" role="status" aria-live="polite">
                <div className="terminal-prompt">phi&gt;&gt;&gt; run program.phi</div>
                {output.map((line, i) => <pre className={status === "error" ? "output-error" : "output-line"} key={i}>{line}</pre>)}
                <span className="terminal-cursor">▌</span>
              </div>
              <div className="run-info">
                <div><span>EXECUTION</span><strong>{status === "ok" ? "COMPLETE" : status === "error" ? "STOPPED" : status === "running" ? "RUNNING" : status === "cancelled" ? "CANCELLED" : "IDLE"}</strong></div>
                <div><span>STEPS</span><strong>{steps ?? "—"}</strong></div>
                <div><span>RESULT</span><strong className="result-value">{result ?? "—"}</strong></div>
              </div>
              <div className="receipt-panel">
                <div className="receipt-heading"><span>◇ MEMORY LEDGER</span><span>{receipts.length} RECEIPTS</span></div>
                {receipts.length === 0 ? <p>No events yet. Try ledger("EVENT", "data").</p> : receipts.map(r => (
                  <div className="receipt" key={r.sequence}>
                    <b>#{r.sequence} {r.event}</b>
                    <span>{r.data}</span>
                    <small>{r.provenance} · IN-MEMORY ONLY</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="playground-warning">R1 runs programs in a cancellable Web Worker with a 2.5-second deadline. This prevents most UI lockups but is NOT a hardened security sandbox. Execute only trusted code. Ledger receipts remain simulated, in-memory and unsigned.</p>
        </section>
        <section id="reference" className="reference-section">
          <div>
            <p className="eyebrow">FIELD NOTES / QUICK REFERENCE</p>
            <h2>A language with<br /><em>room to grow.</em></h2>
            <p>Make variables, functions and arrays, and load opt-in math or toy graph helpers with use math and use nbg. Real research and AI adapters come later.</p>
            <a href="https://github.com/MichaelWave369/Phithon/blob/main/docs/LANGUAGE.md" target="_blank" rel="noreferrer" className="reference-link">Read the language specification ↗</a>
          </div>
          <div className="reference-table">
            {BUILTINS.map(([name, description]) => <div className="reference-row" key={name}><code>{name}</code><span>{description}</span></div>)}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span><b>Φ</b> PhiThon / Version 0.2.0</span>
        <span>ORIGINAL LANGUAGE · MIT LICENSE · LEDGER ABOVE EGO</span>
        <a href="https://github.com/MichaelWave369/Phithon" target="_blank" rel="noreferrer">SOURCE CODE ↗</a>
      </footer>
    </div>
  );
}
