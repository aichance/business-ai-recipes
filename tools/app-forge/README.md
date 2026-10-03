# Dots App Forge

App Forge is a deterministic local generator for a constrained first plugin
route: schema → editable MCP App source → build/test → own input → data export
and source ZIP. It is deliberately narrower than arbitrary app generation.

## Try two schemas

```bash
node forge.mjs \
  --schema fixtures/support-request.schema.json \
  --data fixtures/support-request.data.json \
  --out /tmp/app-forge-support
cd /tmp/app-forge-support
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run preview
```

Use the same commands with `release-checklist.schema.json` and
`release-checklist.data.json`. Open `http://127.0.0.1:8783/?preview=1`, edit a
field, export the JSON, and inspect the generated source ZIP next to the output
directory. The preview is local; it does not prove installation or execution in
an actual dots host. This is not an actual dots account, installation,
distribution, or external delivery claim.

The generator accepts either a small `fields[]` schema or a constrained JSON
Schema `properties{}` object. It rejects duplicate/reserved ids, unsupported
types, invalid values, missing required fields, and unexpected input keys. It
does not call a model or network service.

## Why this exists

The official MCP App/Extensions quickstart supplies the SDK building blocks, but
the developer still has to create the schema-specific panel, server metadata,
file entrypoint, build/test files, and package directory. App Forge emits those
parts from a supplied schema, then makes the generated source prove itself with
its own build/test commands. This is a local development claim, not a dots
account, distribution, or arbitrary natural-language-generation claim.
