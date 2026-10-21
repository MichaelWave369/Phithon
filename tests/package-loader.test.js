import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIsolated } from "../src/cli/isolate.js";
import { loadProjectModules } from "../src/cli/package-loader.js";

async function folderWith(files) {
  const dir = await mkdtemp(join(tmpdir(), "phithon-pack-"));
  for (const [path, content] of Object.entries(files)) await writeFile(join(dir, path), content, "utf8");
  return dir;
}

test("adjacent PhiPack manifest loads local modules and executes via child", async () => {
  const dir = await folderWith({
    "app.phi": "import kit\nprint(kit_twice(21))",
    "kit.phi": "export fn twice(x) { return x * 2 }",
    "phithon.pack.json": JSON.stringify({
      schema:"phithon.package.v1", name:"my-pack", version:"0.1.0", modules:{ kit:"kit.phi" }
    })
  });
  try {
    const modules=await loadProjectModules(join(dir,"app.phi"));
    assert.deepEqual(Object.keys(modules), ["kit"]);
    const checked=await runIsolated("import kit\nwhile(true){}", { mode:"check", modules });
    assert.equal(checked.modules,1);
    assert.deepEqual((await runIsolated("import kit\nprint(kit_twice(21))", { modules })).output, ["42"]);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

test("missing manifest means no package, existing malformed manifests fail closed", async () => {
  const dir=await folderWith({"app.phi":"print(1)"});
  try {
    assert.deepEqual(await loadProjectModules(join(dir,"app.phi")), {});
    await writeFile(join(dir,"phithon.pack.json"),'{"schema":"wrong"}',"utf8");
    await assert.rejects(loadProjectModules(join(dir,"app.phi")),/schema/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("module paths may not escape directory through traversal", async () => {
  const dir=await folderWith({"app.phi":"import secret","phithon.pack.json":JSON.stringify({
    schema:"phithon.package.v1",name:"test-pack",version:"0.1.0",modules:{secret:"../secret.phi"}
  })});
  try { await assert.rejects(loadProjectModules(join(dir,"app.phi")),/invalid module mapping/); }
  finally { await rm(dir,{recursive:true,force:true}); }
});

test("module symlink is refused", async t => {
  const dir=await folderWith({"app.phi":"import kit","real.phi":"export let x=1","phithon.pack.json":JSON.stringify({
    schema:"phithon.package.v1",name:"test-pack",version:"0.1.0",modules:{kit:"kit.phi"}
  })});
  try {
    try { await symlink(join(dir,"real.phi"),join(dir,"kit.phi")); }
    catch(error) {
      if (["EPERM","ENOSYS","EACCES"].includes(error.code)) { t.skip("symlinks unavailable"); return; }
      throw error;
    }
    await assert.rejects(loadProjectModules(join(dir,"app.phi")),/regular .phi file/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
