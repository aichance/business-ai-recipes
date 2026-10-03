export const evidence = {
  title: "Launch decision: what do we actually know?",
  claims: [
    { id: "speed", text: "Warm-cache setup took 67 seconds in one local run.", sourceIds: ["local-run"] },
    { id: "adoption", text: "The tool has ten external users.", sourceIds: [] },
    { id: "remote", text: "The published version matches the reviewed source.", sourceIds: ["remote-readback"] },
    { id: "missing", text: "The second environment reproduced the demo.", sourceIds: ["not-attached"] },
  ],
  sources: [
    { id: "local-run", title: "Synthetic local measurement", url: "https://example.com/local-run", excerpt: "A synthetic example record: 67.224 seconds, warm package cache, six browser steps. Not actual release evidence." },
    { id: "remote-readback", title: "Synthetic publication receipt", url: "https://example.com/readback", excerpt: "A synthetic receipt showing the same example SHA in two locations. Not a real remote fetch." },
  ],
};
export const run = {
  title: "A launch run that stops at the missing evidence",
  steps: [
    { id: "build", title: "Build the extension", dependsOn: [] },
    { id: "test", title: "Run independent input", dependsOn: ["build"] },
    { id: "verify", title: "Verify in the actual host", dependsOn: ["test"] },
    { id: "publish", title: "Publish host-tested release", dependsOn: ["verify"] },
  ],
  events: [
    { step: "build", at: 0, type: "start" },
    { step: "build", at: 12, type: "success", artifact: "extension-source.zip" },
    { step: "test", at: 13, type: "start" },
    { step: "test", at: 25, type: "success", artifact: "test-results.json" },
    { step: "verify", at: 26, type: "start" },
    { step: "verify", at: 39, type: "failure", note: "No connected host yet. Source works locally; integration remains unverified." },
  ],
};
export const csv = 'name,unit_price,unit_cost,units\nStarter,29.00,8.00,120\nTeam,79.00,24.00,45\nStudio,149.00,45.00,18\n';
export const proof = {
  title: "Dots Studio release proof",
  input: [
    { id: "route", title: "Input route", value: "synthetic localhost app" },
    { id: "artifact", title: "Carry-away artifact", value: "proof-pack.json" },
    { id: "host", title: "Target host", value: "actual dots host" },
  ],
  before: [
    { id: "route", title: "Input route", value: "local preview" },
    { id: "artifact", title: "Carry-away artifact", value: "none" },
    { id: "host", title: "Target host", value: "not connected" },
  ],
  after: [
    { id: "route", title: "Input route", value: "local preview" },
    { id: "artifact", title: "Carry-away artifact", value: "proof-pack.json" },
    { id: "host", title: "Target host", value: "not connected" },
  ],
  checks: [
    { id: "replay", title: "Same input replays", status: "pass", note: "The supplied values can be recomputed from the exported pack.", metricIds: ["route", "artifact"], artifact: "replay-output.json" },
    { id: "host", title: "Actual host execution", status: "unverified", note: "No connected dots host is available in this local preview.", metricIds: ["host"] },
  ],
};
