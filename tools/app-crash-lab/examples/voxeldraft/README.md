# VoxelDraft: the blocks survived, but their layers changed

**A JSON backup restored all three blocks, coordinates and colors; two blocks moved to another layer.** A normal reload preserved the assignments. The same export/import path passed with only one occupied layer.

This is our AI-assisted local experiment on a private, unchanged snapshot of [VoxelDraft](https://voxeldraft.com/ja/edit/) served on 2026-10-16. [The author's article](https://qiita.com/Renburu/items/430328e9993f8499c07f) describes browser-local storage and JSON downloads. This is not an author execution report or a claim about the current deployment. [SOURCE.json](SOURCE.json) identifies the 119-file snapshot and asset hashes. Upstream source and assets are not redistributed here.

## Measured results

| Check | Result |
| --- | --- |
| App Crash Lab 0.9.0: reload, two imported blocks | PASS |
| App Crash Lab 0.9.0: malformed JSON, exact alert, same saved records | PASS |
| Generated standalone reload/rejection checks | 2 PASS |
| Separate real JSON backup: one occupied layer, two layer definitions | PASS |
| Separate real JSON backup: three blocks in two occupied layers | FAIL: two layerId differences |

The separate backup test selects the second layer and adds a third block through the ordinary canvas click. It downloads the app's actual JSON, then imports those unchanged bytes in a fresh browser context:

    Block ID     Before export       After fresh import / reload
    0,0,0        acl-ground          acl-top
    2,0,0        acl-ground          acl-top
    0,0,1        acl-top             acl-top

Block counts, colors and layer names still match. The regression compares every field of each selected voxel, every layer definition, and the active layer ID. Only outer voxel order is ignored; IDs and layer order remain significant.

## Run on your disposable local development copy

Keep your existing VoxelDraft checkout running at http://127.0.0.1:54630/ja/edit/ using its normal startup procedure. This folder does not contain the app. The route and selectors must match your version.

Save [reload-rejection.json](reload-rejection.json) in a separate folder. With Node 22+ and npm:

    npx --yes --package=@playwright/test@1.64.0 playwright install chromium
    npx --yes --package=https://github.com/aichance/business-ai-recipes/releases/download/app-crash-lab-v0.9.0/aichance-app-crash-lab-0.9.0.tgz app-crash-lab run reload-rejection.json

For another port, append --base-url http://127.0.0.1:3000 to the second command. Open the printed report path. The contract compares complete selected voxels, layers and activeLayerId values in voxel-projects-v1, including Japanese/emoji names. Invalid JSON must produce the native alert “Invalid file format”. The generated tests run separately with Playwright, without App Crash Lab.

## Run the separate backup regression and control

Save these three files in an empty folder:

- [project.voxs.json](project.voxs.json)
- [roundtrip.spec.mjs](roundtrip.spec.mjs)
- [playwright.config.mjs](playwright.config.mjs)

Keep the local app running, then run in that folder:

    npm install --prefix . --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @playwright/test@1.64.0
    npx playwright install chromium
    npx playwright test --config playwright.config.mjs

The checked snapshot produces **one passing control and one failing preservation test, exit 1**. Both error messages concern the same failing test: fresh import and its next reload. Keep the original expected layer IDs so a future fix can make the test pass.

For another local origin:

    VOXELDRAFT_BASE_URL=http://127.0.0.1:3000 npx playwright test --config playwright.config.mjs

The spec permits only an explicit HTTP loopback origin, fresh contexts and local GET/HEAD requests. It does not sign in, sync or share. It reads storage for assertions; synthetic records are created only through normal import, layer selection and canvas UI.

## Scope and format limits

The compressed palette/coordinate JSON differs from the stored voxel objects. Generic 0.9.0 backup-roundtrip mappings cannot express that conversion. **The failing backup test is a separate Playwright spec**, not a generic App Crash Lab backup contract.

The CLI uses its standard 1120 × 760 viewport and two blocks; the separate backup spec uses 1280 × 720 and adds the third block. All 119 snapshot files matched before/after testing and after copying to a separate restore directory. App code was unchanged and storage was not directly seeded.

Coverage excludes backend/deployment parity, rendered pixels, animation, project IDs/timestamps/thumbnails, other invalid inputs, and whether flattening is intended file-format behavior. The control has two layer definitions with blocks in only one layer.

Verified on macOS arm64, Node 22.16.0 and Playwright 1.64.0. First-time dependency/Chromium downloads need internet access. Use synthetic data in a disposable app; test actions write to browser-local storage.
