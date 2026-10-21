# PhiThon x Vibe R9 demonstrator

This folder contains an **independent .vibe declaration** and an **independent .phi implementation candidate**. They are not translated to one another or certified as equivalent. The Vibe spec is intended to be inspected by Vibe's own Phase 8.4 tooling.

Assuming you have checked out MichaelWave369/Vibe and installed its CLI:

~~~sh
vibec intent-brief /path/to/Phithon/examples/vibe-contract/hello.vibe --report json --write-output /tmp/phithon-vibe-brief.json
~~~

Then from this PhiThon repository, create a source-hash link:

~~~sh
npm run phi -- vibe-inspect /tmp/phithon-vibe-brief.json
npm run phi -- vibe-link /tmp/phithon-vibe-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi --out /tmp/phithon-vibe-link.json
npm run phi -- vibe-link-check /tmp/phithon-vibe-link.json /tmp/phithon-vibe-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi
~~~

The format is based on Vibe/vibe/interchange.py phase-8.4.intent-brief.v1. Paths may require Windows PowerShell equivalents. The Vibe compiler is **not bundled into PhiThon** and is **not automatically invoked** by any of these commands.

The link contains source SHA-256 digests and a declared relationship. It does not claim that Vibe's preservation checks ran, nor that PhiThon actually implements the intent correctly. If you change either source, vibe-link-check will fail against the previous link.

For the full contract and limitations, see ../../docs/VIBE-BRIDGE.md.
