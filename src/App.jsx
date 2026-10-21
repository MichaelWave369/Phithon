import { useEffect, useRef, useState } from "react";
import { runInWorker } from "./language/runner.js";
import { createReceipt, createPackageReceipt, verifyReceipt } from "./ledger/receipts.js";
import { makeBrainHandoff } from "./brain/handoff.js";
import { inspectSpvBenchJson, SPV_BENCH_MAX_BYTES } from "./bridge/spv-evidence.js";
import { inspectVibeBriefJson, MAX_VIBE_BRIEF_BYTES } from "./bridge/vibe-intent.js";
import { inspectVibeProofBriefJson, MAX_VIBE_PROOF_BRIEF_BYTES } from "./bridge/vibe-proof.js";

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
  ].join("\n") },
  { title: "PhiBrain Bridge", label: "R6 · Requests", code: [
    "# An inert handoff request, not an AI model call",
    "# Turn on the permission checkbox before Run",
    "use brain",
    'let ticket = brain_request("spv", "Summarize three test cases for my PhiThon module.")',
    'print("Queued handoff request:", ticket)',
    'print("No model or network was contacted.")'
  ].join("\n") },
  { title: "Library Workshop", label: "R4 · PhiPack", code: [
    "# Two reusable local modules",
    "import geometry",
    "import numbers",
    'print("3x9 =", numbers_triple(9))',
    'print("Distance =", geometry_hypotenuse(3,4))',
    'print("Double triple =", geometry_doubled_triple(4))'
  ].join("\n"), modules: {
    numbers: [
      "use math",
      "export let multiplier = 3",
      "export fn triple(x) { return x * multiplier }"
    ].join("\n"),
    geometry: [
      "import numbers",
      "use math",
      "export fn hypotenuse(a,b) { return math_distance(0,0,a,b) }",
      "export fn doubled_triple(x) { return numbers_triple(x) * 2 }"
    ].join("\n")
  } }
];

const BUILTINS = [
  ["print(...)", "Write to output"],
  ["phi()", "Golden ratio"],
  ["fib(n)", "Fibonacci number"],
  ["len(x)", "Length of text / array"],
  ["range(n)", "Build number array"],
  ["ledger(event, value)", "Simulated memory receipt"],
  ["use math", "Optional numeric standard library"],
  ["use nbg", "Optional toy cycle graph functions"],
  ["import name", "Import exports from a local .phi module"],
  ["use brain", "Capability-gated offline request handoff"]
];

export default function App() {
  const [active, setActive] = useState(0);
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [modules, setModules] = useState(EXAMPLES[0].modules ?? {});
  const [selectedModule, setSelectedModule] = useState("");
  const [brainGrant, setBrainGrant] = useState(false);
  const [brainRequests, setBrainRequests] = useState([]);
  const [output, setOutput] = useState(["Welcome to PhiThon R1.", "Press Run program to execute your .phi code."]);
  const [receipts, setReceipts] = useState([]);
  const [status, setStatus] = useState("ready");
  const [steps, setSteps] = useState(null);
  const [result, setResult] = useState(null);
  const controllerRef = useRef(null);
  const requestRef = useRef(0);
  const [receipt, setReceipt] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [importIntegrity, setImportIntegrity] = useState(null);
  const [receiptNotice, setReceiptNotice] = useState("");
  const [spvInspection, setSpvInspection] = useState(null);
  const [spvInspectionError, setSpvInspectionError] = useState("");
  const [vibeInspection, setVibeInspection] = useState(null);
  const [vibeInspectionError, setVibeInspectionError] = useState("");
  const [vibeProofInspection, setVibeProofInspection] = useState(null);
  const [vibeProofError, setVibeProofError] = useState("");
  useEffect(() => () => controllerRef.current?.abort(), []);

  function loadExample(i) {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestRef.current++;
    setActive(i);
    setCode(EXAMPLES[i].code);
    setModules(EXAMPLES[i].modules ?? {});
    setSelectedModule(Object.keys(EXAMPLES[i].modules ?? {})[0] ?? "");
    setBrainGrant(false);
    setBrainRequests([]);
    setOutput(["Example loaded. Ready to run."]);
    setReceipts([]);
    setStatus("ready");
    setReceipt(null);
    setIntegrity(null);
    setImportIntegrity(null);
    setReceiptNotice("");
    setSteps(null);
    setResult(null);
  }
  async function runProgram() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = ++requestRef.current;
    const source = code;
    const library = { ...modules };
    const granted = brainGrant === true;
    setBrainGrant(false); // Consent must be actively granted again on every run.
    setBrainRequests([]);
    setStatus("running");
    setOutput(["Running in dedicated worker..."]);
    setReceipts([]);
    setSteps(null);
    setResult(null);
    setReceipt(null);
    setIntegrity(null);
    setReceiptNotice("");
    try {
      const data = await runInWorker(source, {
        signal: controller.signal,
        timeoutMs: 2500,
        maxSteps: 30000,
        maxOutputChars: 12000,
        modules: library,
        brainGrant: granted
      });
      if (request !== requestRef.current) return;
      setOutput(data.output.length ? data.output : ["Program finished without printed output."]);
      setReceipts(data.ledger);
      setBrainRequests(data.brainRequests ?? []);
      setSteps(data.steps);
      setResult(data.result);
      setStatus("ok");
      // Receipt integrity is separate from the executed program's in-memory ledger.
      // R5: snapshot the full local module registry into the v2 receipt.
      try {
        const sealed = Object.keys(library).length
          ? await createPackageReceipt(source, data, library)
          : await createReceipt(source, data);
        if (request !== requestRef.current) return;
        const check = await verifyReceipt(sealed);
        if (request !== requestRef.current) return;
        setReceipt(sealed);
        setIntegrity(check);
      } catch (error) {
        if (request !== requestRef.current) return;
        setReceiptNotice("Receipt hashing unavailable: " + (error instanceof Error ? error.message : String(error)));
      }
    } catch (err) {
      if (request !== requestRef.current || controller.signal.aborted) return;
      setOutput([err instanceof Error ? err.message : String(err)]);
      setReceipts([]);
      setBrainRequests([]);
      setSteps(null);
      setResult(null);
      setReceipt(null);
      setIntegrity(null);
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
    setBrainRequests([]);
    setReceipts([]);
    setSteps(null);
    setResult(null);
    setReceipt(null);
    setIntegrity(null);
    setReceiptNotice("");
  }
  function downloadText(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importVibeProofBrief(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setVibeProofInspection(null);
    setVibeProofError("");
    if (!file) return;
    if (file.size > MAX_VIBE_PROOF_BRIEF_BYTES) {
      setVibeProofError("PhiVibe proof: input exceeds 64 KiB");
      return;
    }
    try {
      const report = inspectVibeProofBriefJson(await file.text());
      setVibeProofInspection(report);
    } catch (error) {
      setVibeProofError(error instanceof Error ? error.message : String(error));
    }
  }
  function clearVibeProofBrief() {
    setVibeProofInspection(null);
    setVibeProofError("");
  }
  async function importVibeBrief(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setVibeInspection(null);
    setVibeInspectionError("");
    if (!file) return;
    if (file.size > MAX_VIBE_BRIEF_BYTES) {
      setVibeInspectionError("PhiVibe: input exceeds 64 KiB");
      return;
    }
    try {
      const report = inspectVibeBriefJson(await file.text());
      setVibeInspection(report);
    } catch (error) {
      setVibeInspectionError(error instanceof Error ? error.message : String(error));
    }
  }
  function clearVibeBrief() {
    setVibeInspection(null);
    setVibeInspectionError("");
  }
  async function importSpvBench(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setSpvInspection(null);
    setSpvInspectionError("");
    if (!file) return;
    if (file.size > SPV_BENCH_MAX_BYTES) {
      setSpvInspectionError("SPV BENCH REFUSED: file exceeds 64 KiB");
      return;
    }
    try {
      const raw = await file.text();
      const summary = inspectSpvBenchJson(raw);
      // Store ONLY the sanitized summary, never the imported raw evidence JSON.
      setSpvInspection(summary);
    } catch (error) {
      setSpvInspectionError("SPV BENCH REFUSED: " + (error instanceof Error ? error.message : String(error)));
    }
  }
  function clearSpvBench() {
    setSpvInspection(null);
    setSpvInspectionError("");
  }
  function exportBrainHandoff() {
    if (!brainRequests.length) return;
    const handoff = makeBrainHandoff(brainRequests);
    downloadText("phibrain.handoff.json", JSON.stringify(handoff, null, 2) + "\n", "application/json");
  }
  function exportReceipt() {
    if (!receipt) return;
    downloadText("phithon.execution.receipt.json", JSON.stringify(receipt, null, 2) + "\n", "application/json");
  }
  async function importReceipt(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportIntegrity(null);
    if (file.size > 1000000) {
      setImportIntegrity({ valid: false, reason: "Receipt file exceeds 1 MB" });
      return;
    }
    try {
      const imported = JSON.parse(await file.text());
      setImportIntegrity(await verifyReceipt(imported));
    } catch (error) {
      setImportIntegrity({ valid: false, reason: error instanceof Error ? error.message : "Unreadable receipt" });
    }
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
  function savePhiFile() { downloadText("program.phi", code, "text/plain;charset=utf-8"); }
  function addModule() {
    let i = 1;
    while (Object.hasOwn(modules, "library" + i)) i++;
    if (i > 32) return;
    const name = "library" + i;
    setModules(prev => ({ ...prev, [name]: "export fn double(x) { return x * 2 }" }));
    setSelectedModule(name);
  }
  function saveModule() {
    if (!Object.hasOwn(modules, selectedModule)) return;
    downloadText(selectedModule + ".phi", modules[selectedModule], "text/plain;charset=utf-8");
  }
  function saveManifest() {
    const names = Object.keys(modules);
    const data = {
      schema: "phithon.package.v1",
      name: "phithon-playground",
      version: "0.1.0",
      modules: Object.fromEntries(names.map(name => [name, name + ".phi"]))
    };
    downloadText("phithon.pack.json", JSON.stringify(data, null, 2) + "\n", "application/json");
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
        <span className="version-pill"><span className="live-dot" /> R10 · OPEN SOURCE</span>
      </header>
      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> INTRODUCING Φ / RELEASE TEN</p>
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
            <div className="orbit-caption caption-top">0.11 / FIELD ENGINE</div>
            <div className="orbit-caption caption-bottom">LEDGER ABOVE EGO</div>
          </div>
        </section>
        <section className="stat-strip" aria-label="Runtime capabilities">
          <div><strong>01 /</strong> ORIGINAL TOKENIZER</div>
          <div><strong>02 /</strong> PRATT PARSER</div>
          <div><strong>03 /</strong> LIVE INTERPRETER</div>
          <div><strong>04 /</strong> LOCAL MODULES</div>
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
                <div className="editor-meta"><span>PHITHON R10</span><span>UTF-8</span></div>
              </div>
              <label className="sr-only" htmlFor="source-code">PhiThon source code</label>
              <textarea id="source-code" aria-label="PhiThon source code editor" spellCheck={false} className="code-editor" value={code} onChange={e => setCode(e.target.value)} onKeyDown={onEditorKey} />
              <div className="editor-footer">
                <button type="button" className="run-button" onClick={runProgram}><span>▶</span> {status === "running" ? "Restart" : "Run program"} <kbd>Ctrl ↵</kbd></button>
                {status === "running" && <button type="button" className="cancel-button" onClick={cancelProgram}>■ Stop</button>}
                <button type="button" className="plain-button" onClick={savePhiFile}>↓ Save .phi</button>
                <span className="size-readout">{code.split("\n").length} LINES</span>
              </div>
              <div className="brain-workbench">
                <div className="brain-workbench-title">ΦBRAIN / EXPLICIT HANDOFF</div>
                <label className="brain-checkbox">
                  <input type="checkbox" checked={brainGrant} onChange={e => setBrainGrant(e.target.checked)} />
                  <span>Grant brain.requests permission for next Run only</span>
                </label>
                <p className="brain-hint">No model calls or networking. Permission allows a program to queue up to five inert prompt requests. A human must explicitly export and hand them off.</p>
                {brainRequests.length > 0 && (
                  <div className="brain-result">
                    <span>{brainRequests.length} request(s) queued · NOT SENT</span>
                    <button type="button" className="plain-button" onClick={exportBrainHandoff}>↓ Export handoff JSON</button>
                    <p className="brain-hint">Routes are intentions only: manual, local, spv. Nothing has been delivered to SPV or any model.</p>
                  </div>
                )}
              </div>
              <div className="library-workbench">
                <div className="library-heading"><strong>ΦPACK / LOCAL MODULES</strong><button type="button" className="module-add" onClick={addModule} disabled={Object.keys(modules).length >= 32}>+ Module</button></div>
                {Object.keys(modules).length === 0
                  ? <p className="library-hint">No local libraries loaded. Choose Library Workshop or add one.</p>
                  : <>
                    <div className="module-tabs">{Object.keys(modules).map(name => (
                      <button type="button" className={selectedModule === name ? "module-tab selected" : "module-tab"} key={name} onClick={() => setSelectedModule(name)}>{name}.phi</button>
                    ))}</div>
                    {Object.hasOwn(modules, selectedModule) && <>
                      <label className="sr-only" htmlFor="module-source">Source code for {selectedModule}.phi</label>
                      <textarea id="module-source" className="module-editor" spellCheck={false} value={modules[selectedModule]} onChange={event => setModules(prev => ({ ...prev, [selectedModule]: event.target.value }))} />
                    </>}
                    <div className="module-actions">
                      <button type="button" className="plain-button" onClick={saveModule}>↓ Save selected .phi</button>
                      <button type="button" className="plain-button" onClick={saveManifest}>↓ Save manifest</button>
                    </div>
                    <p className="library-hint">Download the main program, each module and manifest into one directory. Imports use exported names such as numbers_triple().</p>
                  </>
                }
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
              <div className="vibe-bridge-panel">
                <div className="receipt-heading"><span>◇ ΦVIBE / INTENT BRIDGE</span><span>READ ONLY</span></div>
                <p className="spv-bench-hint">Import the Phase 8.4 JSON output from <code>vibec intent-brief contract.vibe --report json</code>. PhiThon can inspect declared intent locally. Import does not check the original .vibe bytes, compile code, or prove semantic equivalence.</p>
                <div className="integrity-actions">
                  <label className="plain-button upload-label">↑ Inspect Vibe intent JSON<input type="file" accept=".json,application/json" onChange={importVibeBrief} aria-label="Select a Vibe phase 8.4 intent brief for local inspection" /></label>
                  <button type="button" className="plain-button" onClick={clearVibeBrief} disabled={!vibeInspection && !vibeInspectionError}>Clear intent</button>
                </div>
                {vibeInspectionError && <p className="integrity-bad" role="status">{vibeInspectionError}</p>}
                {vibeInspection && <div className="spv-evidence-results" role="status">
                  <p className="spv-bench-hint"><strong>{vibeInspection.intentName}</strong> · DECLARED / UNVERIFIED</p>
                  <p className="spv-bench-hint">{vibeInspection.goal}</p>
                  <p className="spv-bench-hint">{vibeInspection.inputs.length} inputs · {vibeInspection.outputs.length} outputs · {vibeInspection.preserveCount} preserve rules · {vibeInspection.constraintCount} constraints</p>
                  <p className="spv-bench-hint">Vibe source SHA-256 claimed: <code className="digest-value">{vibeInspection.sourceSha256}</code></p>
                  <p className="spv-bench-hint">For an actual hash-bound implementation link, use the CLI <code>vibe-link</code> with the original .vibe source and the .phi source. This browser view cannot certify either.</p>
                </div>}
              </div>
              <div className="vibe-bridge-panel">
                <div className="receipt-heading"><span>◇ ΦVIBE / PROOF CORRESPONDENCE</span><span>SELF-REPORTED</span></div>
                <p className="spv-bench-hint">Use <code>vibec proof-brief saved.vibe.proof.json --report json</code> to create Vibe's existing Phase 8.4 proof brief. Import it for an offline inspection of reported Vibe outcomes. This does not authenticate Vibe, certify PhiThon, or grant authority.</p>
                <div className="integrity-actions">
                  <label className="plain-button upload-label">↑ Inspect Vibe proof brief<input type="file" accept=".json,application/json" onChange={importVibeProofBrief} aria-label="Select Vibe Phase 8.4 proof brief JSON for offline inspection" /></label>
                  <button type="button" className="plain-button" onClick={clearVibeProofBrief} disabled={!vibeProofInspection && !vibeProofError}>Clear proof view</button>
                </div>
                {vibeProofError && <p className="integrity-bad" role="status">{vibeProofError}</p>}
                {vibeProofInspection && <div className="spv-evidence-results" role="status">
                  <p className="spv-bench-hint"><strong>VIBE REPORTED: {vibeProofInspection.compilerPassReported ? "PASS" : "FAIL"}</strong> · SOURCE NOT AUTHENTICATED</p>
                  <p className="spv-bench-hint">Backend claimed: {vibeProofInspection.backendReported} · {vibeProofInspection.obligationsTotalReported} reported obligations · {vibeProofInspection.obligationsSampled} sample entries</p>
                  <p className="spv-bench-hint">Bridge verdict claimed: {vibeProofInspection.bridgeVerdictReported ?? "UNREPORTED"} · no equivalence proof or execution attestation</p>
                  <p className="spv-bench-hint">To check this report against the actual .vibe and .phi sources, use the CLI <code>vibe-proof-link</code>. Imported pass flags are never promoted to PhiThon verification or permission.</p>
                </div>}
              </div>
              <div className="spv-bench-panel">
                <div className="receipt-heading"><span>◇ ΦBRIDGE / SPV EVIDENCE</span><span>READ ONLY</span></div>
                <p className="spv-bench-hint">Import a portable redacted Evidence Bench JSON exported from SuperPhiVessel's local console. This never runs a model, grants routing permission or uploads anything. Imported records are operator-selected and unauthenticated.</p>
                <div className="integrity-actions">
                  <label className="plain-button upload-label">↑ Inspect SPV bench JSON<input type="file" accept=".json,application/json" onChange={importSpvBench} aria-label="Select portable SuperPhiVessel Evidence Bench JSON for offline inspection" /></label>
                  <button type="button" className="plain-button" onClick={clearSpvBench} disabled={!spvInspection && !spvInspectionError}>Clear inspection</button>
                </div>
                {spvInspectionError && <p className="integrity-bad" role="status">{spvInspectionError}</p>}
                {spvInspection && <div className="spv-evidence-results" role="status">
                  <p className="spv-bench-hint"><strong>VALID SHAPE · NOT VERIFIED EVIDENCE</strong> · {spvInspection.evidenceCount} entries, {spvInspection.performanceCount} performance, {spvInspection.humanReviewCount} self-reviews</p>
                  <p className="spv-bench-hint">{spvInspection.modelLabelCount} distinct model labels · {spvInspection.performanceRowsWithMatchingReview} performance observations have a matching human review</p>
                  <div className="spv-entries">{spvInspection.rows.map((item, i) => (
                    <div className="spv-entry" key={i}>
                      <span>#{i + 1} · {item.observedAt} · MODEL REDACTED</span>
                      <small>{item.generatedTokens === null ? "Tokens unreported" : item.generatedTokens + " reported tokens"} · {item.matchingHumanReviewPresent ? "Matching self-review" : "No matching self-review"} · UNATTESTED</small>
                    </div>
                  ))}</div>
                  <p className="spv-bench-hint">No ranking, quality approval, authority or live SPV connection. Imported claims remain unauthenticated.</p>
                </div>}
              </div>
              <div className="integrity-panel">
                <div className="receipt-heading"><span>◇ PHILEDGER / SHA-256</span><span>{receipt ? "SEALED" : "NOT SEALED"}</span></div>
                {receipt && (
                  <>
                    <p className="integrity-intro">{receipt.schema.endsWith(".v2") ? "PhiPack v2 / source-complete" : "Standalone v1"} · receipt digest</p>
                    <code className="digest-value">{receipt.receiptHash}</code>
                    <p className="integrity-summary">{integrity?.valid ? "INTERNAL HASH CHAIN VALID" : integrity ? "HASH CHAIN MISMATCH" : "CHECKING HASHES"} · {receipt.events.length} event(s){receipt.schema.endsWith(".v2") ? " · " + Object.keys(receipt.modules).length + " module(s) bound" : ""}</p>
                  </>
                )}
                {!receipt && <p className="integrity-intro">Run a program to build a portable integrity receipt.</p>}
                <div className="integrity-actions">
                  <button type="button" className="plain-button" onClick={exportReceipt} disabled={!receipt}>↓ Export receipt</button>
                  <label className="plain-button upload-label">↑ Verify JSON<input type="file" accept=".json,application/json" onChange={importReceipt} aria-label="Import receipt JSON to verify SHA-256 integrity" /></label>
                </div>
                {importIntegrity && <p className={importIntegrity.valid ? "integrity-ok" : "integrity-bad"} role="status">{importIntegrity.valid ? "IMPORTED RECEIPT: INTEGRITY VALID" : "IMPORTED RECEIPT: INVALID"} · {importIntegrity.reason}{importIntegrity.valid && importIntegrity.modules ? " · " + importIntegrity.modules + " modules" : ""}</p>}
                {receiptNotice && <p className="integrity-bad" role="status">{receiptNotice}</p>}
                <p className="integrity-caution">An internally valid hash is not a signature, trusted timestamp or proof of execution. Anyone can generate a new self-consistent receipt.</p>
              </div>
            </div>
          </div>
          <p className="playground-warning">R10 adds offline Vibe proof-brief inspection and source-hash correspondence with an existing PhiThon/Vibe implementation link. Vibe pass/fail remains a self-reported claim, never PhiThon semantic verification, execution permission or SPV approval.</p>
        </section>
        <section id="reference" className="reference-section">
          <div>
            <p className="eyebrow">FIELD NOTES / QUICK REFERENCE</p>
            <h2>A language with<br /><em>room to grow.</em></h2>
            <p>Define reusable .phi libraries with import/export, run them in the browser, and generate source-complete PhiPack v2 integrity receipts. Neither receipt version authenticates who ran the code.</p>
            <a href="https://github.com/MichaelWave369/Phithon/blob/main/docs/LANGUAGE.md" target="_blank" rel="noreferrer" className="reference-link">Read the language specification ↗</a>
          </div>
          <div className="reference-table">
            {BUILTINS.map(([name, description]) => <div className="reference-row" key={name}><code>{name}</code><span>{description}</span></div>)}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span><b>Φ</b> PhiThon / Version 0.11.0</span>
        <span>ORIGINAL LANGUAGE · MIT LICENSE · LEDGER ABOVE EGO</span>
        <a href="https://github.com/MichaelWave369/Phithon" target="_blank" rel="noreferrer">SOURCE CODE ↗</a>
      </footer>
    </div>
  );
}
