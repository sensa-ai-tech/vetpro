import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const dir = path.join("data", "diseases");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"));
let total = 0;
let withRefs = 0;
let totalRefs = 0;

for (const f of files) {
  try {
    const d = yaml.load(fs.readFileSync(path.join(dir, f), "utf-8")) as any;
    if (!d?.slug) continue;
    total++;
    const refs = d.guidelineRefs?.length ?? 0;
    totalRefs += refs;
    if (refs > 0) withRefs++;
  } catch {}
}

console.log("Total diseases:", total);
console.log("With refs:", withRefs, `(${Math.round((withRefs / total) * 100)}%)`);
console.log("Without refs:", total - withRefs);
console.log("Total refs:", totalRefs);
console.log("Avg refs/disease:", (totalRefs / total).toFixed(1));
console.log("Avg refs/disease (with refs only):", (totalRefs / withRefs).toFixed(1));
