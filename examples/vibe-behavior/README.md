# PhiVibe R11: operator-reviewed selected behavior test vectors

This demo intentionally separates the Vibe `.vibe` intent contract from the PhiThon `.phi` implementation and its **human-authored** behavior expectations in `vectors.json`.

1. Generate a Phase 8.4 intent brief using an independent checkout of **Vibe**:

~~~sh
vibec intent-brief contract.vibe --report json --write-output intent-brief.json
~~~

2. From a PhiThon checkout, explicitly create a source-bound R9 link using this example pair:

~~~sh
npm run phi -- vibe-link intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi --out source-link.json
~~~

3. Execute only the listed PhiThon tests with the new R11 command:

~~~sh
npm run phi -- vibe-behavior source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/vectors.json --out behavior-report.json
~~~

Each test calls `evaluate(x)` in a fresh bounded PhiShield child, with **no brain permission**. A non-matching output or child error makes the CLI exit nonzero **after** saving the redacted report. The CLI refuses to overwrite an existing report.

The expected outputs here were selected by a human for a narrow arithmetic example. **Vibe did not generate or certify these test vectors.** Matching all four inputs does not establish equivalence for other values, all number types, edge cases, arbitrary Vibe semantics, runtime safety, or full intent preservation.

See `../../docs/VIBE-BRIDGE.md` and `../../docs/VIBE-BEHAVIOR.md`.

## R12: seeded numeric properties

The adjacent [`properties.json`](properties.json) is an operator-authored reproducible **affine** property over six bounded integer samples. With a Vibe intent brief and the R9 `source-link.json` created as described above, run:

~~~sh
npm run phi -- vibe-properties source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/properties.json --out property-report.json
~~~

This checks *finite sampled behavior only*. It does not mean `Vibe` generated or proved the property. See [R12 finite property guide](../../docs/VIBE-PROPERTIES.md).
