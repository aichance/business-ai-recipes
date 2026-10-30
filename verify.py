"""Verify the detached public-package candidate with the standard library."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from recipe import Refused, apply_local, approve, prepare, read_json, validate_plan

EXPECTED_FILES = {
    'docs/aichance-playwright-state-lens-0.5.0-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.5.0-experimental.1.tgz.sha256',
    'docs/state-lens-fields-measurements.json',
    'docs/state-lens-selected-fields.md',
    'docs/state-lens-v0.5.0-experimental.1.d.mts',
    'docs/state-lens-v0.5.0-experimental.1.d.mts.sha256',
    'docs/state-lens-v0.5.0-experimental.1.mjs',
    'docs/state-lens-v0.5.0-experimental.1.mjs.sha256',
    'experiments/state-lens/selected-fields-case.mjs',
    'tools/playwright-state-lens/tests/selected-fields.test.mjs',
    'docs/state-lens-sethera-ownapp.md',
    'docs/aichance-playwright-state-lens-0.4.1-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.4.1-experimental.1.tgz.sha256',
    'docs/state-lens-bloggr-consumer.mjs',
    'docs/state-lens-bloggr-measurements.json',
    'docs/state-lens-bloggr-native.md',
    'docs/state-lens-bloggr-recovery.html',
    'docs/state-lens-typescript.md',
    'docs/state-lens-v0.4.1-experimental.1.d.mts',
    'docs/state-lens-v0.4.1-experimental.1.d.mts.sha256',
    'docs/state-lens-v0.4.1-experimental.1.mjs',
    'docs/state-lens-v0.4.1-experimental.1.mjs.sha256',
    'tools/playwright-state-lens/lens.d.mts',
    'tools/playwright-state-lens/tests/types/consumer.mts',
    'tools/playwright-state-lens/tests/types/single-file.mjs',
    'tools/playwright-state-lens/tests/types/tsconfig-allowjs.json',
    'tools/playwright-state-lens/tests/types/tsconfig.json',
    'docs/state-lens-held-writes.md',
    'tools/playwright-state-lens/examples/held-write.mjs',
    'docs/state-lens-dates.md',
    'docs/state-lens-v0.4.0-experimental.1.mjs',
    'docs/state-lens-v0.4.0-experimental.1.mjs.sha256',
    'docs/aichance-playwright-state-lens-0.4.0-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.4.0-experimental.1.tgz.sha256',
    'tools/playwright-state-lens/tests/date-values.test.mjs',
    'docs/state-lens-session-storage.md',
    'docs/state-lens-v0.3.0-experimental.1.mjs',
    'docs/state-lens-v0.3.0-experimental.1.mjs.sha256',
    'docs/aichance-playwright-state-lens-0.3.0-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.3.0-experimental.1.tgz.sha256',
    'tools/playwright-state-lens/tests/session-storage.test.mjs',
    'docs/state-lens-recorded-v0.1.0-experimental.1.html',
    'docs/state-lens-good-recorded-v0.1.0-experimental.1.html',
    'experiments/state-lens/test_prepare_replay.py',
    'docs/state-lens-undefined.md',
    'docs/state-lens-v0.2.0-experimental.1.mjs',
    'docs/state-lens-v0.2.0-experimental.1.mjs.sha256',
    'docs/aichance-playwright-state-lens-0.2.0-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.2.0-experimental.1.tgz.sha256',
    'docs/state-lens-nvim-LICENSE.txt',
    'docs/state-lens-nvim-control.html',
    'docs/state-lens-nvim-control.png',
    'docs/state-lens-nvim-measurements.json',
    'docs/state-lens-nvim-native-baseline.mjs',
    'docs/state-lens-nvim-native-consumer.mjs',
    'docs/state-lens-nvim-native-control.mjs',
    'docs/state-lens-nvim-native.md',
    'docs/state-lens-nvim-normal.html',
    'docs/state-lens-nvim-normal.png',
    'docs/state-lens-install.md',
    'docs/state-lens-v0.1.0-experimental.1.mjs',
    'docs/state-lens-v0.1.0-experimental.1.mjs.sha256',
    'docs/aichance-playwright-state-lens-0.1.0-experimental.1.tgz',
    'docs/aichance-playwright-state-lens-0.1.0-experimental.1.tgz.sha256',
    'docs/state-lens.html',
    'docs/state-lens-good.html',
    'docs/state-lens-results.md',
    'docs/state-lens-measurements.json',
    'docs/state-lens-preview.png',
    'docs/state-lens-demo.mp4',
    'experiments/state-lens/prepare_replay.py',
    'tools/edit-undo/LICENSE',
    'tools/edit-undo/README.md',
    'tools/edit-undo/cli.mjs',
    'tools/edit-undo/demo.mjs',
    'tools/edit-undo/package.json',
    'tools/edit-undo/preview.mjs',
    'tools/edit-undo/tests/preview.test.mjs',
    'tools/playwright-state-lens/LICENSE',
    'tools/playwright-state-lens/README.md',
    'tools/playwright-state-lens/demo.mjs',
    'tools/playwright-state-lens/demo/fixture.mjs',
    'tools/playwright-state-lens/examples/consumer.spec.mjs',
    'tools/playwright-state-lens/lens.mjs',
    'tools/playwright-state-lens/package-lock.json',
    'tools/playwright-state-lens/package.json',
    'tools/playwright-state-lens/playwright.config.mjs',
    'tools/playwright-state-lens/tests/lens.test.mjs',
    'docs/leak-regression-lab-anon-grants.md',
    'docs/leak-regression-lab-anon-measurements.json',
    'docs/leak-regression-lab-v0.1.3.zip',
    'docs/leak-regression-lab-v0.1.3.zip.sha256',
    'docs/leak-regression-lab-v0.1.3.tgz',
    'docs/leak-regression-lab-v0.1.3.tgz.sha256',
    'docs/leak-regression-lab-setup-prompt.txt',
    'docs/leak-regression-lab-column-results.md',
    'docs/leak-regression-lab-column-measurements.json',
    'docs/leak-regression-lab-v0.1.2.zip',
    'docs/leak-regression-lab-v0.1.2.zip.sha256',
    'docs/leak-regression-lab-v0.1.2.tgz',
    'docs/leak-regression-lab-v0.1.2.tgz.sha256',
    'docs/leak-regression-lab-session-results.md',
    'docs/leak-regression-lab-session-measurements.json',
    'docs/leak-regression-lab-v0.1.1.zip',
    'docs/leak-regression-lab-v0.1.1.zip.sha256',
    'docs/leak-regression-lab-v0.1.1.tgz',
    'docs/leak-regression-lab-v0.1.1.tgz.sha256',
    'tools/leak-regression-lab/test/session.test.mjs',
    'tools/leak-regression-lab/examples/test-session-config.json',
    'tools/leak-regression-lab/examples/session-env.example',
    'docs/leak-regression-lab-demo.mp4',
    'docs/leak-regression-lab-measurements.json',
    'docs/leak-regression-lab-preview.png',
    'docs/leak-regression-lab-results.md',
    'docs/leak-regression-lab-v0.1.0.tgz',
    'docs/leak-regression-lab-v0.1.0.tgz.sha256',
    'docs/leak-regression-lab-v0.1.0.zip',
    'docs/leak-regression-lab-v0.1.0.zip.sha256',
    'docs/leak-regression-lab.html',
    'docs/leak-regression-lab.js',
    'tools/leak-regression-lab/AGENTS.md',
    'tools/leak-regression-lab/README.md',
    'tools/leak-regression-lab/cli.mjs',
    'tools/leak-regression-lab/examples/env.example',
    'tools/leak-regression-lab/examples/test-config.json',
    'tools/leak-regression-lab/fixtures/run.mjs',
    'tools/leak-regression-lab/fixtures/schema.sql',
    'tools/leak-regression-lab/lib/config.mjs',
    'tools/leak-regression-lab/lib/probe.mjs',
    'tools/leak-regression-lab/lib/report.mjs',
    'tools/leak-regression-lab/package.json',
    'tools/leak-regression-lab/package.py',
    'tools/leak-regression-lab/test/cli.test.mjs',
    'tools/leak-regression-lab/test/probe.test.mjs',

    'experiments/relay-package/package.py',
    'docs/agent-relay-one-command.md',
    'docs/agent-relay-check-v0.1.4-npx1.tgz',
    'docs/agent-relay-check-v0.1.4-npx1.tgz.sha256',
    '.github/workflows/relay-ci-v014.yml',
    'tools/agent-relay-ci-v014/action.yml',
    'tools/agent-relay-ci-v014/ci.mjs',
    'tools/agent-relay-ci-v014/ci.test.mjs',
    'docs/agent-relay-ci.md',
    '.github/workflows/relay-ci-entry.yml',
    'tools/agent-relay-ci/action.yml',
    'tools/agent-relay-ci/ci.mjs',
    'tools/agent-relay-ci/ci.test.mjs',
    'experiments/relay-cumulative-budget/check.py',
    'experiments/relay-cumulative-budget/test_check.py',
    'experiments/relay-cumulative-budget/native-results-2026-10-27.json',
    'experiments/relay-cumulative-budget/render_native_boundary.py',
    'docs/agent-relay-native-boundary.svg',
    '.github/workflows/relay-cumulative-budget.yml',
    'docs/agent-relay-cumulative-budget.md',
    'docs/agent-relay-global-guidance.md',
    'docs/agent-relay-source-review.md',
    'docs/agent-relay-project-config.md',
    'docs/agent-relay-runtime-options.md',
    'tools/agent-relay-check/test/runtime.test.mjs',
    'docs/agent-relay-check-v0.1.4.zip',
    'docs/agent-relay-check-v0.1.4.zip.sha256',
    'docs/agent-relay-check-v0.1.3.zip',
    'docs/agent-relay-check-v0.1.3.zip.sha256',
    'docs/agent-relay-check-v0.1.2.zip',
    'docs/agent-relay-check-v0.1.2.zip.sha256',
    'tools/agent-relay-check/lib/inspect.mjs',
    'tools/agent-relay-check/lib/inventory.mjs',
    'tools/agent-relay-check/test/inspect.test.mjs',
    'tools/agent-relay-check/test/inventory.test.mjs',
    'tools/agent-relay-check/examples/NATIVE-INSPECTION.md',
    'docs/agent-relay-check-v0.1.1.zip',
    'docs/agent-relay-check-v0.1.1.zip.sha256',
    'tools/agent-relay-check/lib/process.mjs',
    'tools/agent-relay-check/test/installed-cli.test.mjs',
    'tools/agent-relay-check/test/process.test.mjs',

    'tools/agent-relay-check/AGENTS.md',
    'tools/agent-relay-check/LICENSE',
    'tools/agent-relay-check/README.md',
    'tools/agent-relay-check/cli.mjs',
    'tools/agent-relay-check/examples/MEASUREMENTS.md',
    'tools/agent-relay-check/examples/override-results.json',
    'tools/agent-relay-check/examples/override.mjs',
    'tools/agent-relay-check/lib/codex.mjs',
    'tools/agent-relay-check/lib/observation.mjs',
    'tools/agent-relay-check/lib/protocol.mjs',
    'tools/agent-relay-check/lib/rpc.mjs',
    'tools/agent-relay-check/package.json',
    'tools/agent-relay-check/test/adapter.test.mjs',
    'tools/agent-relay-check/test/protocol.test.mjs',
    'tools/agent-relay-check/test/rpc.test.mjs',
    'docs/agent-relay-check-v0.1.0.zip',
    'docs/agent-relay-check-v0.1.0.zip.sha256',
    "tools/app-crash-lab/examples/relationship-native/README.md",
    "tools/app-crash-lab/examples/relationship-native/relations.mjs",
    "tools/app-crash-lab/examples/relationship-native/demo.mjs",
    "tools/app-crash-lab/tests/semantic-relations.test.mjs",
    "docs/app-crash-lab-nebulark-native.zip",
    "docs/app-crash-lab-nebulark-native.zip.sha256",
    "tools/app-crash-lab/examples/nebulark-native/README.md",
    "tools/app-crash-lab/examples/nebulark-native/RESULTS.json",
    "tools/app-crash-lab/examples/nebulark-native/stale-tab.spec.mjs",
    "tools/app-crash-lab/examples/nebulark-native/package.json",
    "tools/app-crash-lab/examples/nebulark-native/package-lock.json",
    "tools/app-crash-lab/examples/nebulark-native/before-older-tab-save.png",
    "tools/app-crash-lab/examples/nebulark-native/after-older-tab-save.png",
    "tools/app-crash-lab/examples/meet-clocks-native/README.md",
    "tools/app-crash-lab/examples/meet-clocks-native/RESULTS.json",
    "tools/app-crash-lab/examples/meet-clocks-native/RESULTS-fallback.json",
    "tools/app-crash-lab/examples/meet-clocks-native/storage-boundary.spec.mjs",
    "tools/app-crash-lab/examples/meet-clocks-native/before-fix-reload.png",
    "tools/app-crash-lab/examples/meet-clocks-native/after-fix-reload.png",
    "tools/app-crash-lab/examples/meet-clocks-native/sync-quota.spec.mjs",
    "tools/app-crash-lab/examples/meet-clocks-native/package.json",
    "tools/app-crash-lab/examples/meet-clocks-native/package-lock.json",
    "tools/app-crash-lab/examples/meet-clocks-native/quota-before-reload.png",
    "tools/app-crash-lab/examples/meet-clocks-native/quota-after-reload.png",
    "tools/app-crash-lab/examples/stockroom-native-delete/README.md",
    "tools/app-crash-lab/examples/stockroom-native-delete/RESULTS.json",
    "tools/app-crash-lab/examples/stockroom-native-delete/delete-completion.spec.js",
    "docs/about.html",
    "tools/app-crash-lab/examples/openpost-native-clear/README.md",
    "tools/app-crash-lab/examples/openpost-native-clear/RESULTS.json",
    "tools/app-crash-lab/examples/openpost-native-clear/historyClearFailure.test.ts",
    "tools/app-crash-lab/examples/task-packing-native/README.md",
    "tools/app-crash-lab/examples/task-packing-native/RESULTS.md",
    "tools/app-crash-lab/examples/task-packing-native/import-completion.spec.mjs",
    "tools/app-crash-lab/examples/task-packing-native/restore-before-reload.png",
    "tools/app-crash-lab/examples/task-packing-native/restore-after-reload.png",
    "tools/app-crash-lab/examples/reduce-motion-native/README.md",
    "tools/app-crash-lab/examples/reduce-motion-native/RESULTS.json",
    "tools/app-crash-lab/examples/reduce-motion-native/reduce-motion.persistence.test.ts",
    "tools/app-crash-lab/examples/rejboard/ELECTRON_SYNC.md",
    "tools/app-crash-lab/examples/rejboard/SYNC_RESULTS.json",
    "tools/app-crash-lab/examples/rejboard/electron-sync.spec.mjs",
    "tools/app-crash-lab/examples/rejboard/electron-lock-fixed.spec.mjs",
    "tools/app-crash-lab/examples/rejboard/electron-sync-bootstrap.cjs",
    "tools/app-crash-lab/examples/storage-clear-native/README.md",
    "tools/app-crash-lab/examples/storage-clear-native/RESULTS.json",
    "tools/app-crash-lab/examples/storage-clear-native/base-after-clear.png",
    "tools/app-crash-lab/examples/storage-clear-native/pr-after-clear.png",
    "tools/app-crash-lab/examples/storage-clear-native/consumer.mjs",
    "tools/app-crash-lab/examples/storage-clear-native/storage-clear.spec.mjs",
    "tools/app-crash-lab/examples/storage-clear-native/package.json",
    "tools/app-crash-lab/examples/storage-clear-native/package-lock.json",
    "tools/app-crash-lab/examples/shotluma-native/README.md",
    "tools/app-crash-lab/examples/shotluma-native/stale-tab.spec.mjs",
    "tools/app-crash-lab/examples/rejboard/NATIVE.md",
    "tools/app-crash-lab/examples/rejboard/single-board.spec.mjs",
    "tools/app-crash-lab/examples/misaneco-native/README.md",
    "tools/app-crash-lab/examples/misaneco-native/RESULTS.json",
    "tools/app-crash-lab/examples/misaneco-native/two-state-preservation.test.mjs",
    "tools/app-crash-lab/examples/misaneco-native/browser-replay.mjs",
    "tools/app-crash-lab/examples/backup-export-native/README.md",
    "tools/app-crash-lab/examples/backup-export-native/RESULTS.json",
    "tools/app-crash-lab/examples/backup-export-native/backupExportContract.test.ts",
    "tools/app-crash-lab/examples/draft-recovery-native/README.md",
    "tools/app-crash-lab/examples/draft-recovery-native/RESULTS.json",
    "tools/app-crash-lab/examples/draft-recovery-native/draft-recovery-cleanup.test.mjs",
    "docs/pdf-save-lab.html",
    "docs/pdf-save-lab.mjs",
    "tools/app-crash-lab/examples/pdf-save-native/README.md",
    "tools/app-crash-lab/examples/pdf-save-native/pdf-save.spec.mjs",
    "tools/app-crash-lab/examples/optional-result-native/README.md",
    "tools/app-crash-lab/examples/optional-result-native/optional-result.spec.mjs",
    "docs/livepage-template-saved.png",
    "docs/livepage-template-rolled-back.png",
    "docs/livepage-template.spec.mjs",
    "docs/livepage-template-proof.json",
    "docs/livepage-template-proof.md",
    "docs/app-crash-lab-life-tracker-stale-cloud-native-v0.1.0.zip",
    "docs/app-crash-lab-life-tracker-stale-cloud-native-v0.1.0.zip.sha256",
    "docs/life-tracker-stale-cloud-native.md",
    "docs/life-tracker-stale-cloud-results.json",
    "docs/life-tracker-stale-cloud.spec.mjs",
    "tools/app-crash-lab/examples/brainotes-native/LICENSE",
    "tools/app-crash-lab/examples/brainotes-native/README.md",
    "tools/app-crash-lab/examples/brainotes-native/RESULTS.json",
    "tools/app-crash-lab/examples/brainotes-native/autosave-abort.spec.mjs",
    "tools/app-crash-lab/examples/brainotes-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/brainotes-native/package.json",
    "tools/app-crash-lab/examples/brainotes-native/package-lock.json",
    "tools/app-crash-lab/examples/brainotes-native/write-aborted-b-visible.png",
    "tools/app-crash-lab/examples/brainotes-native/two-strokes-after-reload.png",
    "docs/app-crash-lab-brainotes-native-v0.1.0.zip",
    "docs/app-crash-lab-brainotes-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/naidan-native/LICENSE",
    "tools/app-crash-lab/examples/naidan-native/README.md",
    "tools/app-crash-lab/examples/naidan-native/RESULTS.json",
    "tools/app-crash-lab/examples/naidan-native/stale-settings.spec.mjs",
    "tools/app-crash-lab/examples/naidan-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/naidan-native/package.json",
    "tools/app-crash-lab/examples/naidan-native/package-lock.json",
    "tools/app-crash-lab/examples/naidan-native/earlier-peer-after-save.png",
    "docs/app-crash-lab-naidan-native-v0.1.0.zip",
    "docs/app-crash-lab-naidan-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/readiness-native/README.md",
    "tools/app-crash-lab/examples/readiness-native/RESULTS.json",
    "tools/app-crash-lab/examples/readiness-native/draft-navigation.mjs",
    "tools/app-crash-lab/examples/osw-native/LICENSE",
    "tools/app-crash-lab/examples/osw-native/README.md",
    "tools/app-crash-lab/examples/osw-native/RESULTS.json",
    "tools/app-crash-lab/examples/osw-native/stale-thumbnail.spec.mjs",
    "tools/app-crash-lab/examples/osw-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/osw-native/primary-saved.png",
    "tools/app-crash-lab/examples/osw-native/after-thumbnail.png",
    "docs/app-crash-lab-osw-native-v0.1.0.zip",
    "docs/app-crash-lab-osw-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/perma-native-delete/LICENSE",
    "tools/app-crash-lab/examples/perma-native-delete/README.md",
    "tools/app-crash-lab/examples/perma-native-delete/RESULTS.json",
    "tools/app-crash-lab/examples/perma-native-delete/delayed-delete.e2e.ts",
    "tools/app-crash-lab/examples/perma-native-delete/before-pending-delete.png",
    "tools/app-crash-lab/examples/perma-native-delete/after-deletion-and-reload.png",
    "tools/app-crash-lab/examples/stitchwitch-native/LICENSE",
    "tools/app-crash-lab/examples/stitchwitch-native/README.md",
    "tools/app-crash-lab/examples/stitchwitch-native/RESULTS.json",
    "tools/app-crash-lab/examples/stitchwitch-native/stale-browser-tab.spec.mjs",
    "tools/app-crash-lab/examples/stitchwitch-native/primary-saved-grid.png",
    "tools/app-crash-lab/examples/stitchwitch-native/peer-after-name-only-save.png",
    "tools/app-crash-lab/examples/optional-history-native/LICENSE",
    "tools/app-crash-lab/examples/optional-history-native/README.md",
    "tools/app-crash-lab/examples/optional-history-native/RESULTS.json",
    "tools/app-crash-lab/examples/optional-history-native/optional-history.spec.mjs",
    "tools/app-crash-lab/examples/optional-history-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/optional-history-native/package.json",
    "tools/app-crash-lab/examples/optional-history-native/package-lock.json",
    "docs/app-crash-lab-optional-history-native-v0.1.0.zip",
    "docs/app-crash-lab-optional-history-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/livepage-native/LICENSE",
    "tools/app-crash-lab/examples/livepage-native/README.md",
    "tools/app-crash-lab/examples/livepage-native/RESULTS.json",
    "tools/app-crash-lab/examples/livepage-native/stale-tab.spec.mjs",
    "tools/app-crash-lab/examples/livepage-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/livepage-native/package.json",
    "tools/app-crash-lab/examples/livepage-native/package-lock.json",
    "docs/app-crash-lab-livepage-native-v0.1.0.zip",
    "docs/app-crash-lab-livepage-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/storage-write-denied-native/LICENSE",
    "tools/app-crash-lab/examples/storage-write-denied-native/README.md",
    "tools/app-crash-lab/examples/storage-write-denied-native/RESULTS.json",
    "tools/app-crash-lab/examples/storage-write-denied-native/write-denied.spec.mjs",
    "tools/app-crash-lab/examples/storage-write-denied-native/playwright.config.mjs",
    "tools/app-crash-lab/examples/storage-write-denied-native/package.json",
    "tools/app-crash-lab/examples/storage-write-denied-native/package-lock.json",
    "docs/app-crash-lab-storage-write-denied-native-v0.1.0.zip",
    "docs/app-crash-lab-storage-write-denied-native-v0.1.0.zip.sha256",
    "tools/app-crash-lab/tests/stale-tab.test.mjs",
    "tools/app-crash-lab/examples/livepage/LICENSE",
    "tools/app-crash-lab/examples/livepage/README.md",
    "tools/app-crash-lab/examples/livepage/stale-tab.json",
    "tools/app-crash-lab/examples/livepage/controls.spec.mjs",
    "tools/app-crash-lab/examples/livepage/controls.config.mjs",
    "tools/app-crash-lab/examples/livepage/package.json",
    "tools/app-crash-lab/examples/livepage/package-lock.json",
    "tools/app-crash-lab/examples/livepage/repro.spec.mjs",
    "tools/app-crash-lab/examples/livepage/playwright.config.mjs",
    "tools/app-crash-lab/examples/livepage/results-summary.json",
    "tools/app-crash-lab/examples/livepage/saved-page.png",
    "tools/app-crash-lab/examples/livepage/after-stale-save.png",
    "docs/app-crash-lab-livepage-trial-v0.1.0.zip",
    "docs/app-crash-lab-livepage-trial-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/edentext/LICENSE",
    "tools/app-crash-lab/examples/edentext/README.md",
    "tools/app-crash-lab/examples/edentext/control-extra-reply.json",
    "tools/app-crash-lab/examples/edentext/reject-docx.json",
    "tools/app-crash-lab/examples/edentext/reject-odt.json",
    "tools/app-crash-lab/examples/edentext/reload.json",
    "tools/app-crash-lab/examples/edentext/results-summary.json",
    "docs/app-crash-lab-edentext-trial-v0.1.0.zip",
    "docs/app-crash-lab-edentext-trial-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/opresume/LICENSE",
    "tools/app-crash-lab/examples/opresume/UPSTREAM-LICENSE",
    "tools/app-crash-lab/examples/opresume/README.md",
    "tools/app-crash-lab/examples/opresume/cleared-source.png",
    "tools/app-crash-lab/examples/opresume/cleared-restored.png",
    "tools/app-crash-lab/examples/opresume/reload-cleared.json",
    "tools/app-crash-lab/examples/opresume/reload-complete-control.json",
    "tools/app-crash-lab/examples/opresume/roundtrip-cleared.json",
    "tools/app-crash-lab/examples/opresume/roundtrip-complete-control.json",
    "tools/app-crash-lab/examples/opresume/synthetic-complete.json",
    "tools/app-crash-lab/examples/opresume/results-summary.json",
    "docs/app-crash-lab-opresume-trial-v0.1.0.zip",
    "docs/app-crash-lab-opresume-trial-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/bazkia/LICENSE",
    "tools/app-crash-lab/examples/bazkia/README.md",
    "tools/app-crash-lab/examples/bazkia/empty-after.png",
    "tools/app-crash-lab/examples/bazkia/empty-before.png",
    "tools/app-crash-lab/examples/bazkia/reload-branch.json",
    "tools/app-crash-lab/examples/bazkia/reload-empty.json",
    "tools/app-crash-lab/examples/bazkia/results-summary.json",
    "tools/app-crash-lab/examples/bazkia/roundtrip-branch.json",
    "tools/app-crash-lab/examples/bazkia/roundtrip-empty.json",
    "docs/app-crash-lab-bazkia-trial-v0.1.0.zip",
    "docs/app-crash-lab-bazkia-trial-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/rejboard/LICENSE",
    "tools/app-crash-lab/examples/rejboard/README.md",
    "tools/app-crash-lab/examples/rejboard/RESULTS.json",
    "tools/app-crash-lab/examples/rejboard/SOURCE.json",
    "tools/app-crash-lab/examples/rejboard/changed-text-control.json",
    "tools/app-crash-lab/examples/rejboard/media-audit.mjs",
    "tools/app-crash-lab/examples/rejboard/media-backup.json",
    "tools/app-crash-lab/examples/rejboard/package-lock.json",
    "tools/app-crash-lab/examples/rejboard/package.json",
    "tools/app-crash-lab/examples/rejboard/preservation.json",
    "tools/app-crash-lab/examples/rejboard/roundtrip.json",
    "tools/app-crash-lab/examples/rejboard/synthetic-source.png",
    "tools/app-crash-lab/examples/rejboard/trial.mjs",
    "docs/app-crash-lab-rejboard-trial-v0.1.0.zip",
    "docs/app-crash-lab-rejboard-trial-v0.1.0.zip.sha256",
    ".github/workflows/lifepilot-trial.yml",
    "tools/app-crash-lab/tests/lifepilot-ci.test.mjs",
    "tools/app-crash-lab/examples/lifepilot-continuity/ci-trial.mjs",
    "tools/app-crash-lab/examples/lifepilot-continuity/LICENSE",
    "tools/app-crash-lab/examples/lifepilot-continuity/README.md",
    "tools/app-crash-lab/examples/lifepilot-continuity/RESULTS.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/SOURCE.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/changed-goal-control.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/preservation.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/profile.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/roundtrip.json",
    "tools/app-crash-lab/examples/lifepilot-continuity/wrong-baseline-control.json",
    "tools/app-crash-lab/examples/pomoflow/README.md",
    "tools/app-crash-lab/examples/pomoflow/tasks-reload.json",
    "tools/app-crash-lab/examples/pomoflow/serve-metadata-control.py",
    "tools/app-crash-lab/examples/trazo/README.md",
    "tools/app-crash-lab/examples/trazo/MEASUREMENTS.json",
    "tools/app-crash-lab/examples/trazo/roundtrip.json",
    "tools/app-crash-lab/examples/trazo/reload.json",
    "docs/app-crash-lab-taglio-pack-v0.1.0.zip",
    "docs/app-crash-lab-taglio-pack-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/taglio/LICENSE",
    "tools/app-crash-lab/examples/taglio/README.md",
    "tools/app-crash-lab/examples/taglio/SOURCE.json",
    "tools/app-crash-lab/examples/taglio/classic-editor.php",
    "tools/app-crash-lab/examples/taglio/fixture-reset.php",
    "tools/app-crash-lab/examples/taglio/loopback-only.mjs",
    "tools/app-crash-lab/examples/taglio/normal-reload.png",
    "tools/app-crash-lab/examples/taglio/package-lock.json",
    "tools/app-crash-lab/examples/taglio/package.json",
    "tools/app-crash-lab/examples/taglio/results-summary.json",
    "tools/app-crash-lab/examples/taglio/seed.php",
    "tools/app-crash-lab/examples/taglio/start.py",
    "tools/app-crash-lab/examples/taglio/tag-save-known-control.json",
    "tools/app-crash-lab/examples/taglio/tag-save.json",
    "tools/app-crash-lab/examples/wa-archiver/README.md",
    "tools/app-crash-lab/examples/wa-archiver/SOURCE.json",
    "tools/app-crash-lab/examples/wa-archiver/results-summary.json",
    "tools/app-crash-lab/examples/wa-archiver/preservation.json",
    "tools/app-crash-lab/examples/wa-archiver/synthetic-seed.json",
    "tools/app-crash-lab/examples/wa-archiver/source-files.json",
    "tools/app-crash-lab/examples/wa-archiver/native-backup.mjs",
    "tools/app-crash-lab/examples/wa-archiver/before.png",
    "tools/app-crash-lab/examples/wa-archiver/after.png",
    "tools/app-crash-lab/examples/wa-archiver/sample-backup.json",
    "tools/app-crash-lab/examples/plesfeda/README.md",
    "tools/app-crash-lab/examples/plesfeda/SOURCE.json",
    "tools/app-crash-lab/examples/plesfeda/preservation.json",
    "tools/app-crash-lab/examples/plesfeda/results-summary.json",
    "tools/app-crash-lab/examples/extensive-reading-assistant/LICENSE",
    "tools/app-crash-lab/examples/extensive-reading-assistant/README.md",
    "tools/app-crash-lab/examples/extensive-reading-assistant/SOURCE.json",
    "tools/app-crash-lab/examples/extensive-reading-assistant/FIXED-RESULTS.json",
    "tools/app-crash-lab/examples/extensive-reading-assistant/FIXED.md",
    "tools/app-crash-lab/examples/extensive-reading-assistant/annotation.json",
    "tools/app-crash-lab/examples/extensive-reading-assistant/annotation-known-control.json",
    "tools/app-crash-lab/examples/extensive-reading-assistant/drafts.spec.mjs",
    "tools/app-crash-lab/examples/extensive-reading-assistant/playwright.config.mjs",
    "docs/app-crash-lab-reading-assistant-pack-v0.1.0.zip",
    "docs/app-crash-lab-reading-assistant-pack-v0.1.0.zip.sha256",
    "tools/app-crash-lab/examples/how-many-beers/README.md",
    "tools/app-crash-lab/examples/how-many-beers/SOURCE.json",
    "tools/app-crash-lab/examples/how-many-beers/results-summary.json",
    "tools/app-crash-lab/examples/how-many-beers/backup.spec.mjs",
    "tools/app-crash-lab/examples/how-many-beers/playwright.config.mjs",
    "tools/app-crash-lab/examples/how-many-beers/reload.json",
    "tools/app-crash-lab/examples/how-many-beers/wrong-baseline.json",
    ".agents/skills/app-crash-lab/SKILL.md",
    ".agents/skills/app-crash-lab/LICENSE",
    ".agents/skills/app-crash-lab/references/runner.md",
    ".agents/skills/app-crash-lab/references/native-playwright.md",
    "docs/app-crash-lab-skill-v0.1.0.zip",
    "docs/app-crash-lab-skill-v0.1.0.zip.sha256",
    "docs/app-crash-lab-skill-v0.1.1.zip",
    "docs/app-crash-lab-skill-v0.1.1.zip.sha256",
    "docs/app-crash-lab-skill-v0.2.0.zip",
    "docs/app-crash-lab-skill-v0.2.0.zip.sha256",
    "docs/app-crash-lab-skill-v0.2.1.zip",
    "docs/app-crash-lab-skill-v0.2.1.zip.sha256",
    "docs/app-crash-lab-skill-v0.2.2.zip",
    "docs/app-crash-lab-skill-v0.2.2.zip.sha256",
    "tools/app-crash-lab/examples/spin-the-wheel/README.md",
    "tools/app-crash-lab/examples/spin-the-wheel/SOURCE.json",
    "tools/app-crash-lab/examples/spin-the-wheel/roundtrip.json",
    "tools/app-crash-lab/examples/spin-the-wheel/wrong-baseline.json",
    "docs/leftover-version-boundary.gif",
    "docs/leftover-version-boundary.mp4",
    "tools/app-crash-lab/examples/leftover/MEDIA.json",
    "tools/app-crash-lab/examples/leftover/README.md",
    "tools/app-crash-lab/examples/leftover/SOURCE.json",
    "tools/app-crash-lab/examples/leftover/roundtrip.json",
    "tools/app-crash-lab/examples/leftover/reject-unrelated.json",
    "tools/app-crash-lab/examples/leftover/reject-future-version.json",
    "tools/app-crash-lab/examples/kaioken/normal-reload.json",
    "tools/app-crash-lab/examples/kaioken/README.md",
    "tools/app-crash-lab/examples/kaioken/SOURCE.json",
    "tools/app-crash-lab/examples/kaioken/import-identity.spec.mjs",
    "tools/app-crash-lab/examples/my-ideals/README.md",
    "tools/app-crash-lab/examples/my-ideals/SOURCE.json",
    "tools/app-crash-lab/examples/my-ideals/roundtrip.json",
    "tools/app-crash-lab/examples/repwise/README.md",
    "tools/app-crash-lab/examples/repwise/SOURCE.json",
    "tools/app-crash-lab/examples/repwise/roundtrip.json",
    "tools/app-crash-lab/examples/repwise/history-reload.json",
    "tools/app-crash-lab/examples/voxeldraft/README.md",
    "tools/app-crash-lab/examples/voxeldraft/SOURCE.json",
    "tools/app-crash-lab/examples/voxeldraft/project.voxs.json",
    "tools/app-crash-lab/examples/voxeldraft/reload-rejection.json",
    "tools/app-crash-lab/examples/voxeldraft/roundtrip.spec.mjs",
    "tools/app-crash-lab/examples/voxeldraft/playwright.config.mjs",
    "tools/app-crash-lab/examples/bujo/README.md",
    "tools/app-crash-lab/examples/bujo/SOURCE.json",
    "tools/app-crash-lab/examples/bujo/roundtrip.json",
    "tools/app-crash-lab/examples/bujo/LICENSE.upstream",
    "tools/app-crash-lab/examples/nestsave/initial-balance.png",
    "tools/app-crash-lab/examples/nestsave/initial-deposit.spec.mjs",
    "tools/app-crash-lab/examples/nestsave/playwright.config.mjs",
    "tools/app-crash-lab/tests/backup-records.test.mjs",
    "tools/app-crash-lab/examples/nestsave/README.md",
    "tools/app-crash-lab/examples/nestsave/SOURCE.json",
    "tools/app-crash-lab/examples/nestsave/roundtrip.json",
    "tools/app-crash-lab/examples/nestsave/LICENSE.upstream",
    "tools/app-crash-lab/examples/toeic-tracker/LICENSE.upstream",
    "tools/app-crash-lab/examples/toeic-tracker/serve-export.mjs",
    "tools/app-crash-lab/examples/toeic-tracker/README.md",
    "tools/app-crash-lab/examples/toeic-tracker/SOURCE.json",
    "tools/app-crash-lab/examples/toeic-tracker/roundtrip.json",
    "tools/app-crash-lab/tests/backup-dom-commit.test.mjs",
    "tools/app-crash-lab/examples/paisa/README.md",
    "tools/app-crash-lab/examples/paisa/SOURCE.json",
    "tools/app-crash-lab/examples/paisa/roundtrip.json",
    "tools/app-crash-lab/examples/bamifitlog/README.md",
    "tools/app-crash-lab/examples/bamifitlog/SOURCE.json",
    "tools/app-crash-lab/examples/bamifitlog/roundtrip.json",
    "tools/app-crash-lab/examples/focus-backup/README.md",
    "tools/app-crash-lab/examples/focus-backup/SOURCE.json",
    "tools/app-crash-lab/examples/focus-backup/playwright.config.mjs",
    "tools/app-crash-lab/examples/focus-backup/results-summary.json",
    "tools/app-crash-lab/examples/focus-backup/roundtrip.spec.mjs",
    "tools/app-crash-lab/examples/nvim-edu-progress/progress.json",
    "tools/app-crash-lab/examples/nvim-edu-progress/best-score.json",
    "tools/app-crash-lab/examples/nvim-edu-progress/README.md",
    "tools/app-crash-lab/examples/nvim-edu-progress/SOURCE.json",
    "tools/app-crash-lab/examples/nvim-edu-progress/LICENSE",
    "tools/app-crash-lab/BACKUP.md",
    "tools/app-crash-lab/examples/price-table/README.md",
    "tools/app-crash-lab/examples/price-table/roundtrip.json",
    "tools/app-crash-lab/examples/price-table/serve.py",
    "tools/app-crash-lab/examples/devtasks/roundtrip-feature.json",
    "tools/app-crash-lab/examples/devtasks/roundtrip-docs.json",
    "tools/app-crash-lab/tests/backup-roundtrip.test.mjs",
    "docs/test-the-test.html",
    "docs/test-the-test-ja.html",
    "docs/test-the-test.js",
    "docs/app-crash-lab-language-single.html",
    "docs/app-crash-lab.html",
    "docs/app-crash-lab.png",
    "docs/devtasks-backup-roundtrip.gif",
    "docs/devtasks-backup-roundtrip.mp4",
    "docs/chalky-fast-close.png",
    "docs/chalky-delayed-close.png",
    "tools/app-crash-lab/.gitignore",
    "tools/app-crash-lab/CONTRACT.md",
    "tools/app-crash-lab/PERSISTENCE-CHECKLIST.md",
    "tools/app-crash-lab/LICENSE",
    "tools/app-crash-lab/README.md",
    "tools/app-crash-lab/cli.mjs",
    "tools/app-crash-lab/demo/index.html",
    "tools/app-crash-lab/demo/server.mjs",
    "tools/app-crash-lab/examples/ANNOTATE.md",
    "tools/app-crash-lab/examples/AUGUR.md",
    "tools/app-crash-lab/examples/AVONTURE.md",
    "tools/app-crash-lab/examples/CEREUSDB.md",
    "tools/app-crash-lab/examples/CREATOR-FRAME.md",
    "tools/app-crash-lab/examples/FIRST-FAILURE-TRACE.md",
    "tools/app-crash-lab/examples/FALA-GRINGO.md",
    "tools/app-crash-lab/examples/FLOORPLANNER.md",
    "tools/app-crash-lab/examples/MULTI-COUNTER.md",
    "tools/app-crash-lab/examples/GLYPHA.md",
    "tools/app-crash-lab/examples/PIXIE.md",
    "tools/app-crash-lab/examples/TUNORON.md",
    "tools/app-crash-lab/examples/TYPETRAIL.md",
    "tools/app-crash-lab/examples/VISIBLE-LANGUAGE.md",
    "tools/app-crash-lab/examples/SETHERA.md",
    "tools/app-crash-lab/examples/chatledger/README.md",
    "tools/app-crash-lab/examples/chatledger/SOURCE.json",
    "tools/app-crash-lab/examples/chatledger/import-reload.json",
    "tools/app-crash-lab/examples/chatledger/confirm-reload.json",
    "tools/app-crash-lab/examples/annotate.html",
    "tools/app-crash-lab/examples/annotate.json",
    "tools/app-crash-lab/examples/augur.json",
    "tools/app-crash-lab/examples/avonture.json",
    "tools/app-crash-lab/examples/cereusdb.json",
    "tools/app-crash-lab/examples/creator-frame.json",
    "tools/app-crash-lab/examples/fala-gringo.json",
    "tools/app-crash-lab/examples/floorplanner-malformed.json",
    "tools/app-crash-lab/examples/floorplanner-schema.json",
    "tools/app-crash-lab/examples/multi-counter.json",
    "tools/app-crash-lab/examples/mealai/README.md",
    "tools/app-crash-lab/examples/mealai/mealai.json",
    "tools/app-crash-lab/examples/mealai/prepare-local.py",
    "tools/app-crash-lab/examples/mealai/CSS-PRECONDITIONS.md",
    "tools/app-crash-lab/examples/mealai/css-control-server.py",
    "tools/app-crash-lab/examples/mealai/legacy-contract-counterexample.json",
    "tools/app-crash-lab/examples/mealai/results-summary.json",
    "tools/app-crash-lab/examples/LATESTARR.md",
    "tools/app-crash-lab/examples/latestarr.template.json",
    "tools/app-crash-lab/examples/prepare-latestarr.mjs",
    "tools/app-crash-lab/examples/chalky-notes-close/README.md",
    "tools/app-crash-lab/examples/chalky-notes-close/LICENSE",
    "tools/app-crash-lab/examples/chalky-notes-close/package.json",
    "tools/app-crash-lab/examples/chalky-notes-close/package-lock.json",
    "tools/app-crash-lab/examples/chalky-notes-close/baseline.json",
    "tools/app-crash-lab/examples/chalky-notes-close/notes-close.spec.mjs",
    "tools/app-crash-lab/examples/chalky-notes-close/playwright.config.mjs",
    "tools/app-crash-lab/examples/chalky-notes-close/REPAIR.md",
    "tools/app-crash-lab/examples/chalky-notes-close/repair-candidate.patch",
    "tools/app-crash-lab/examples/chalky-notes-close/commit-paths.spec.mjs",
    "tools/app-crash-lab/examples/chalky-notes-close/commit-playwright.config.mjs",
    "tools/app-crash-lab/examples/chalky-notes-close/results-summary.json",
    "tools/app-crash-lab/examples/direct-playwright/README.md",
    "tools/app-crash-lab/examples/direct-playwright/direct.spec.mjs",
    "tools/app-crash-lab/examples/direct-playwright/fixtures.json",
    "tools/app-crash-lab/examples/direct-playwright/playwright.config.mjs",
    "tools/app-crash-lab/examples/devtasks/README.md",
    "tools/app-crash-lab/examples/devtasks/backup-roundtrip.spec.mjs",
    "tools/app-crash-lab/examples/devtasks/playwright.config.mjs",
    "tools/app-crash-lab/examples/devtasks/malformed.json",
    "tools/app-crash-lab/examples/devtasks/missing-tasks.json",
    "tools/app-crash-lab/examples/failure-boundary/README.md",
    "tools/app-crash-lab/examples/failure-boundary/LICENSE",
    "tools/app-crash-lab/examples/failure-boundary/package.json",
    "tools/app-crash-lab/examples/failure-boundary/package-lock.json",
    "tools/app-crash-lab/examples/failure-boundary/boundary.spec.mjs",
    "tools/app-crash-lab/examples/failure-boundary/playwright.config.mjs",
    "tools/app-crash-lab/examples/glypha.json",
    "tools/app-crash-lab/examples/inventory.json",
    "tools/app-crash-lab/examples/language.html",
    "tools/app-crash-lab/examples/language-single.html",
    "tools/app-crash-lab/examples/language-single-count-only.json",
    "tools/app-crash-lab/examples/language-single-normal.json",
    "tools/app-crash-lab/examples/language-single-text-loss.json",
    "tools/app-crash-lab/examples/LANGUAGE-COUNTS.md",
    "tools/app-crash-lab/examples/language-naive.json",
    "tools/app-crash-lab/examples/language-normal.json",
    "tools/app-crash-lab/examples/language-display-loss.json",
    "tools/app-crash-lab/examples/notes.json",
    "tools/app-crash-lab/examples/pixie.json",
    "tools/app-crash-lab/examples/pixie-roundtrip/playwright.config.mjs",
    "tools/app-crash-lab/examples/pixie-roundtrip/roundtrip.spec.mjs",
    "tools/app-crash-lab/examples/tunoron.json",
    "tools/app-crash-lab/examples/typetrail.json",
    "tools/app-crash-lab/examples/sethera.json",
    "tools/app-crash-lab/lib/contract.mjs",
    "tools/app-crash-lab/lib/protocol.mjs",
    "tools/app-crash-lab/lib/report.mjs",
    "tools/app-crash-lab/lib/runner.mjs",
    "tools/app-crash-lab/package-lock.json",
    "tools/app-crash-lab/package.json",
    "tools/app-crash-lab/tests/acceptance.test.mjs",
    "tools/app-crash-lab/tests/contract.test.mjs",
    "tools/app-crash-lab/tests/file-import.test.mjs",
    "tools/app-crash-lab/tests/file-chooser-setup.test.mjs",
    "tools/app-crash-lab/tests/backup-success-alert.test.mjs",
    "tools/app-crash-lab/examples/teoria-musicale/README.md",
    "tools/app-crash-lab/examples/teoria-musicale/SOURCE.json",
    "tools/app-crash-lab/examples/teoria-musicale/MEASUREMENTS.json",
    "tools/app-crash-lab/examples/teoria-musicale/reload.json",
    "tools/app-crash-lab/examples/teoria-musicale/roundtrip.json",
    "tools/app-crash-lab/tests/indexeddb.test.mjs",
    "tools/app-crash-lab/tests/native-alert.test.mjs",
    "tools/app-crash-lab/tests/native-confirm.test.mjs",
    ".agents/skills/demo-forge/SKILL.md",
    ".agents/skills/demo-forge/LICENSE",
    ".agents/skills/demo-forge/references/setup.md",
    ".agents/skills/demo-forge/scripts/forge.py",
    ".agents/skills/demo-forge/scripts/server.py",
    ".agents/skills/demo-forge/scripts/operation.json",
    ".agents/skills/demo-forge/scripts/operation.narrated.json",
    ".agents/skills/demo-forge/scripts/app/index.html",
    ".github/workflows/verify.yml",
    ".gitignore",
    "AGENTS.md",
    "LICENSE",
    "README.md",
    "RECIPES.md",
    "docs/index.html",
    "docs/studio.html",
    "docs/studio-core.mjs",
    "docs/studio-gif.mjs",
    "docs/gifenc.mjs",
    "docs/gifenc.LICENSE.txt",
    "docs/studio-sample.mp4",
    "docs/silentstars.html",
    "docs/silentstars-demo.mp4",
    "docs/silentstars-demo.gif",
    "docs/silentstars-raw.mp4",
    "docs/silentstars-storyboard.yml",
    "docs/silentstars-story.json",
    "docs/silentstars-operation.json",
    "docs/glypha-codex-roundtrip.md",
    "experiments/demo-forge/README.md",
    "experiments/demo-forge/app/index.html",
    "experiments/demo-forge/demo.gif",
    "experiments/demo-forge/examples/brief-app/server.py",
    "experiments/demo-forge/examples/brief-app/index.html",
    "experiments/demo-forge/examples/brief-app/operation.json",
    "experiments/demo-forge/forge.py",
    "experiments/demo-forge/present.py",
    "experiments/demo-forge/story.example.json",
    "experiments/demo-forge/operation.json",
    "experiments/demo-forge/operation.narrated.json",
    "experiments/demo-forge/server.py",
    "fixtures/human_review.json",
    "fixtures/meeting_line_judgment.json",
    "fixtures/selected_model_output.json",
    "fixtures/synthetic_meeting.json",
    "recipe.py",
    "recipes/csv-to-report/README.md",
    "recipes/csv-to-report/examples/duplicate.csv",
    "recipes/csv-to-report/examples/empty.csv",
    "recipes/csv-to-report/examples/mixed-strings.csv",
    "recipes/csv-to-report/report.py",
    "recipes/csv-to-report/sales.csv",
    "recipes/jev-csv-exception-routing/README.md",
    "recipes/jev-csv-exception-routing/cases.json",
    "recipes/jev-csv-exception-routing/recorded-answers.json",
    "recipes/jev-csv-exception-routing/route.py",
    "recipes/jev-support-triage/README.md",
    "recipes/jev-support-triage/cases.json",
    "recipes/jev-support-triage/observed-answers.json",
    "recipes/jev-support-triage/triage.py",
    "recipes/meeting-line-judgment/README.md",
    "recipes/meeting-line-judgment/recipe.py",
    "run_demo.py",
    "tools/cutroom/README.md",
    "tools/cutroom/app.js",
    "tools/cutroom/demo/recorded.json",
    "tools/cutroom/demo/screenshot.png",
    "tools/cutroom/demo/source.json",
    "tools/cutroom/demo/walkthrough.mp4",
    "tools/cutroom/demo/walkthrough.srt",
    "tools/cutroom/index.html",
    "tools/cutroom/intelligence.py",
    "tools/cutroom/media.py",
    "tools/cutroom/server.py",
    "tools/cutroom/style.css",
    "tools/cutroom/test_media.py",
    "tools/cutroom/test_server.py",
    "tools/app-forge/README.md",
    "tools/app-forge/fixtures/adversarial-title.data.json",
    "tools/app-forge/fixtures/adversarial-title.schema.json",
    "tools/app-forge/fixtures/release-checklist.data.json",
    "tools/app-forge/fixtures/release-checklist.schema.json",
    "tools/app-forge/fixtures/support-request.data.json",
    "tools/app-forge/fixtures/support-request.schema.json",
    "tools/app-forge/fixtures/support-request.unexpected.data.json",
    "tools/app-forge/forge.mjs",
    "tools/dots-studio/.gitignore",
    "tools/dots-studio/IDEAS.md",
    "tools/dots-studio/README.md",
    "tools/dots-studio/build.mjs",
    "tools/dots-studio/core.mjs",
    "tools/dots-studio/demo/evidence.jpg",
    "tools/dots-studio/demo/run.jpg",
    "tools/dots-studio/demo/scenario.jpg",
    "tools/dots-studio/examples.mjs",
    "tools/dots-studio/fixtures/own-sales.csv",
    "tools/dots-studio/fixtures/own-sales.scenario",
    "tools/dots-studio/fixtures/sample.dotrun",
    "tools/dots-studio/fixtures/sample.evidence",
    "tools/dots-studio/mcp.json",
    "tools/dots-studio/package-lock.json",
    "tools/dots-studio/package.json",
    "tools/dots-studio/plugin.json",
    "tools/dots-studio/preview.mjs",
    "tools/dots-studio/replay.mjs",
    "tools/dots-studio/server.mjs",
    "tools/dots-studio/shell.html",
    "tools/dots-studio/skills/dots-studio/SKILL.md",
    "tools/dots-studio/style.css",
    "tools/dots-studio/test/core.test.mjs",
    "tools/dots-studio/test/protocol.test.mjs",
    "tools/dots-studio/ui.mjs",
    "verify.py",
    "docs/app-crash-lab-video-host-history-native-v0.1.0.zip",
    "docs/app-crash-lab-video-host-history-native-v0.1.0.zip.sha256",
    "docs/video-host-history-native.md",
    "docs/video-host-history-results.json",
    "docs/video-host-history.spec.mjs",
}
_MISSING = object()
_WORKSPACE_DIRS = frozenset({".demo-forge-output", ".demo-forge-venv"})
_DOTS_WORKSPACE_PATHS = frozenset(
    {
        "tools/playwright-state-lens/node_modules",
        "tools/playwright-state-lens/.state-lens-output",
        "tools/playwright-state-lens/test-results",
        "tools/edit-undo/.edit-undo-output",
        "tools/dots-studio/node_modules",
        "tools/dots-studio/dist",
        "tools/app-crash-lab/node_modules",
        "tools/app-crash-lab/.crash-lab",
        "tools/app-crash-lab/test-results",
        "tools/app-crash-lab/playwright-report",
        "tools/app-crash-lab/examples/livepage/.crash-lab",
        "tools/app-crash-lab/examples/livepage-native/.crash-lab",
        "tools/app-crash-lab/examples/livepage-native/node_modules",
        "tools/app-crash-lab/examples/naidan-native/.crash-lab",
        "tools/app-crash-lab/examples/naidan-native/node_modules",
        "tools/app-crash-lab/examples/storage-write-denied-native/test-results",
        "tools/app-crash-lab/examples/storage-write-denied-native/node_modules",
        "tools/app-crash-lab/examples/brainotes-native/node_modules",
        "tools/app-crash-lab/examples/brainotes-native/test-results",
    }
)


def _files(root: Path) -> set[str]:
    files = set()
    for path in root.rglob("*"):
        if ".git" in path.parts or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        if any(part in _WORKSPACE_DIRS for part in path.parts):
            continue
        relative = path.relative_to(root).as_posix()
        if any(
            relative == name or relative.startswith(name + "/") for name in _DOTS_WORKSPACE_PATHS
        ):
            continue
        if path.is_symlink():
            raise AssertionError(f"symlink is not allowed: {path.relative_to(root)}")
        if path.is_file():
            files.add(path.relative_to(root).as_posix())
    return files


def _assert_candidate_boundary(root: Path) -> None:
    if (root / "docs/app-crash-lab-language-single.html").read_bytes() != (
        root / "tools/app-crash-lab/examples/language-single.html"
    ).read_bytes():
        raise AssertionError("browser comparison fixture differs from the CLI example")
    if _files(root) != EXPECTED_FILES:
        raise AssertionError(f"candidate file set differs: {_files(root)}")
    forbidden = (
        "/Users" + "/",
        "github" + "_author",
        "config/" + "policy.json",
        ".runtime" + "/",
        "BEGIN " + "PRIVATE KEY",
        "gh" + "p_",
        "xox" + "b-",
    )
    for relative in EXPECTED_FILES:
        path = root / relative
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for fragment in forbidden:
            if fragment in content:
                raise AssertionError(f"forbidden content in {relative}")


def _verify_taglio_pack(root: Path) -> None:
    name = "app-crash-lab-taglio-pack-v0.1.0.zip"
    path = root / "docs" / name
    checksum = path.with_name(name + ".sha256").read_text().split()
    if checksum != [hashlib.sha256(path.read_bytes()).hexdigest(), name]:
        raise AssertionError("Taglio fixture pack checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "SOURCE.json",
        "classic-editor.php",
        "fixture-reset.php",
        "loopback-only.mjs",
        "normal-reload.png",
        "package-lock.json",
        "package.json",
        "results-summary.json",
        "seed.php",
        "start.py",
        "tag-save-known-control.json",
        "tag-save.json",
    }
    source = root / "tools/app-crash-lab/examples/taglio"
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "taglio/" + entry for entry in expected
        }:
            raise AssertionError("Taglio fixture pack file set mismatch")
        for entry in expected:
            if archive.read("taglio/" + entry) != (source / entry).read_bytes():
                raise AssertionError(f"Taglio fixture pack source differs: {entry}")


def _verify_reading_assistant_pack(root: Path) -> None:
    name = "app-crash-lab-reading-assistant-pack-v0.1.0.zip"
    path = root / "docs" / name
    checksum = path.with_name(name + ".sha256").read_text().split()
    if checksum != [hashlib.sha256(path.read_bytes()).hexdigest(), name]:
        raise AssertionError("reading assistant kit checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "SOURCE.json",
        "annotation.json",
        "annotation-known-control.json",
        "drafts.spec.mjs",
        "playwright.config.mjs",
    }
    source = root / "tools/app-crash-lab/examples/extensive-reading-assistant"
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != expected:
            raise AssertionError("reading assistant kit file set mismatch")
        for entry in expected:
            if archive.read(entry) != (source / entry).read_bytes():
                raise AssertionError(f"reading assistant kit source differs: {entry}")


def _verify_livepage_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/livepage"
    name = "app-crash-lab-livepage-trial-v0.1.0.zip"
    path = root / "docs" / name
    checksum = path.with_name(name + ".sha256").read_text().split()
    if checksum != [hashlib.sha256(path.read_bytes()).hexdigest(), name]:
        raise AssertionError("LivePage trial checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "stale-tab.json",
        "controls.spec.mjs",
        "controls.config.mjs",
        "package.json",
        "package-lock.json",
        "repro.spec.mjs",
        "playwright.config.mjs",
        "results-summary.json",
        "saved-page.png",
        "after-stale-save.png",
    }
    with ZipFile(path) as archive:
        prefix = "app-crash-lab-livepage-trial/"
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            prefix + item for item in expected
        }:
            raise AssertionError("LivePage trial file set mismatch")
        for item in expected:
            if archive.read(prefix + item) != (source / item).read_bytes():
                raise AssertionError(f"LivePage trial differs from source: {item}")
    results = json.loads((source / "results-summary.json").read_text())
    contract = (source / "stale-tab.json").read_bytes()
    if results["runner"]["contractSha256"] != hashlib.sha256(contract).hexdigest():
        raise AssertionError("LivePage measured contract hash mismatch")
    for field, file in (
        ("specSha256", "repro.spec.mjs"),
        ("configSha256", "playwright.config.mjs"),
    ):
        if results["portable"][field] != hashlib.sha256((source / file).read_bytes()).hexdigest():
            raise AssertionError(f"LivePage measured portable bytes mismatch: {file}")


def _verify_nebulark_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/nebulark-native"
    name = "app-crash-lab-nebulark-native.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("NEBULARK checksum mismatch")
    expected = {
        "README.md",
        "RESULTS.json",
        "stale-tab.spec.mjs",
        "package.json",
        "package-lock.json",
        "before-older-tab-save.png",
        "after-older-tab-save.png",
    }
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "nebulark-native/" + item for item in expected
        }:
            raise AssertionError("NEBULARK trial file set mismatch")
        for item in expected:
            if archive.read("nebulark-native/" + item) != (source / item).read_bytes():
                raise AssertionError(f"NEBULARK trial differs from source: {item}")
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        result["nativeSpec"]["sha256"]
        != hashlib.sha256((source / "stale-tab.spec.mjs").read_bytes()).hexdigest()
    ):
        raise AssertionError("NEBULARK measured spec hash mismatch")


def _verify_native_livepage_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/livepage-native"
    name = "app-crash-lab-livepage-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("native LivePage checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "RESULTS.json",
        "stale-tab.spec.mjs",
        "playwright.config.mjs",
        "package.json",
        "package-lock.json",
    }
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "livepage-native/" + item for item in expected
        }:
            raise AssertionError("native LivePage file set mismatch")
        for item in expected:
            if archive.read("livepage-native/" + item) != (source / item).read_bytes():
                raise AssertionError(f"native LivePage source mismatch: {item}")
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        result["nativeSpec"]["sha256"]
        != hashlib.sha256((source / "stale-tab.spec.mjs").read_bytes()).hexdigest()
    ):
        raise AssertionError("native LivePage measured source hash mismatch")


def _verify_native_write_denied_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/storage-write-denied-native"
    name = "app-crash-lab-storage-write-denied-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("native write-denial checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "RESULTS.json",
        "write-denied.spec.mjs",
        "playwright.config.mjs",
        "package.json",
        "package-lock.json",
    }
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "storage-write-denied-native/" + item for item in expected
        }:
            raise AssertionError("native write-denial file set mismatch")
        for item in expected:
            if archive.read("storage-write-denied-native/" + item) != (source / item).read_bytes():
                raise AssertionError(f"native write-denial source mismatch: {item}")
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        result["nativeSpec"]["sha256"]
        != hashlib.sha256((source / "write-denied.spec.mjs").read_bytes()).hexdigest()
    ):
        raise AssertionError("native write-denial measured source hash mismatch")


def _verify_brainotes_native_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/brainotes-native"
    name = "app-crash-lab-brainotes-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("BraiNOTES native checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "RESULTS.json",
        "autosave-abort.spec.mjs",
        "playwright.config.mjs",
        "package.json",
        "package-lock.json",
        "write-aborted-b-visible.png",
        "two-strokes-after-reload.png",
    }
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "brainotes-native/" + item for item in expected
        }:
            raise AssertionError("BraiNOTES native file set mismatch")
        for item in expected:
            if archive.read("brainotes-native/" + item) != (source / item).read_bytes():
                raise AssertionError(f"BraiNOTES native source mismatch: {item}")
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        result["nativeSpec"]["sha256"]
        != hashlib.sha256((source / "autosave-abort.spec.mjs").read_bytes()).hexdigest()
    ):
        raise AssertionError("BraiNOTES native measured source hash mismatch")
    if (source / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("BraiNOTES native license mismatch")


def _verify_native_optional_history_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/optional-history-native"
    name = "app-crash-lab-optional-history-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("native optional-history checksum mismatch")
    expected = {
        "LICENSE",
        "README.md",
        "RESULTS.json",
        "optional-history.spec.mjs",
        "playwright.config.mjs",
        "package.json",
        "package-lock.json",
    }
    with ZipFile(path) as archive:
        if len(archive.namelist()) != len(expected) or set(archive.namelist()) != {
            "optional-history-native/" + item for item in expected
        }:
            raise AssertionError("native optional-history file set mismatch")
        for item in expected:
            if archive.read("optional-history-native/" + item) != (source / item).read_bytes():
                raise AssertionError(f"native optional-history source mismatch: {item}")
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        result["nativeSpec"]["sha256"]
        != hashlib.sha256((source / "optional-history.spec.mjs").read_bytes()).hexdigest()
    ):
        raise AssertionError("native optional-history measured source hash mismatch")


def _verify_life_tracker_stale_cloud_native(root: Path) -> None:
    name = "app-crash-lab-life-tracker-stale-cloud-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("Life Tracker native ZIP checksum mismatch")
    result = json.loads((root / "docs/life-tracker-stale-cloud-results.json").read_text())
    expected = {
        "LICENSE",
        "README.md",
        "download-source.py",
        "package-lock.json",
        "package.json",
        "playwright.config.mjs",
        "server.mjs",
        "setup.mjs",
        "source-manifest.json",
        "tests/stale-cloud.spec.mjs",
    }
    prefix = "life-tracker-stale-cloud-native/"
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(expected) or set(names) != {prefix + n for n in expected}:
            raise AssertionError("Life Tracker ZIP must contain only our test/setup files")
        spec = archive.read(prefix + "tests/stale-cloud.spec.mjs")
        if spec != (root / "docs/life-tracker-stale-cloud.spec.mjs").read_bytes():
            raise AssertionError("Life Tracker readable spec differs from measured ZIP")
        if hashlib.sha256(spec).hexdigest() != result["nativeSpec"]["sha256"]:
            raise AssertionError("Life Tracker measured spec hash mismatch")
        source = archive.read(prefix + "source-manifest.json")
        if hashlib.sha256(source).hexdigest() != result["source_manifest_sha256"]:
            raise AssertionError("Life Tracker source manifest identity mismatch")
        manifest = json.loads(source)
        if (
            manifest["pin"] != "402ad57f75816302fc0cd50cb1a17f78eb78d143"
            or len(manifest["blobs"]) != 35
        ):
            raise AssertionError("Life Tracker pinned source manifest mismatch")
    if result["archive"]["sha256"] != digest or result["archive"]["bytes"] != path.stat().st_size:
        raise AssertionError("Life Tracker measured ZIP identity mismatch")
    if {c["name"]: c["status"] for c in result["cases"]} != {
        "remote update control": "passed",
        "unavailable remote control": "passed",
        "older remote regression": "failed",
    }:
        raise AssertionError("Life Tracker measured control/regression cases mismatch")


def _verify_video_host_history_native(root: Path) -> None:
    name = "app-crash-lab-video-host-history-native-v0.1.0.zip"
    path = root / "docs" / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_name(name + ".sha256").read_text().split() != [digest, name]:
        raise AssertionError("video-host native ZIP checksum mismatch")
    prefix = "video-host-history-native/"
    with ZipFile(path) as archive:
        names = archive.namelist()
        if (
            len(names) != 31
            or len(set(names)) != 31
            or any(not n.startswith(prefix) or ".." in Path(n).parts for n in names)
        ):
            raise AssertionError("video-host native ZIP file set mismatch")
        spec = archive.read(prefix + "browser/optional-history.spec.mjs")
        result_bytes = archive.read(prefix + "RESULTS.json")
        if spec != (root / "docs/video-host-history.spec.mjs").read_bytes():
            raise AssertionError("published video-host native spec differs from ZIP")
        if result_bytes != (root / "docs/video-host-history-results.json").read_bytes():
            raise AssertionError("published video-host native result differs from ZIP")
        result = json.loads(result_bytes)
        if result["nativeSpec"]["sha256"] != hashlib.sha256(spec).hexdigest():
            raise AssertionError("video-host native measured spec mismatch")
        metadata = json.loads(archive.read(prefix + "SOURCE.json"))
        if (
            metadata["revision"] != "14630a0abaa8da3badf4525111488d6cb2fd7004"
            or len(metadata["files"]) != 8
        ):
            raise AssertionError("video-host source provenance mismatch")
        for item in metadata["files"]:
            blob = archive.read(prefix + "upstream/" + item["path"])
            if len(blob) != item["bytes"] or hashlib.sha256(blob).hexdigest() != item["sha256"]:
                raise AssertionError("video-host unchanged source mismatch")


def _verify_stitchwitch_native(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/stitchwitch-native"
    result = json.loads((source / "RESULTS.json").read_text())
    spec = source / result["nativeSpec"]["file"]
    if hashlib.sha256(spec.read_bytes()).hexdigest() != result["nativeSpec"]["sha256"]:
        raise AssertionError("StitchWitch measured spec hash mismatch")
    if (source / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("StitchWitch example license mismatch")
    cases = result["cases"]
    expected = {
        "same-tab control": "passed",
        "fresh-peer control": "passed",
        "earlier-peer regression": "failed",
        "fresh-peer reload regression": "failed",
    }
    if len(cases) != 4 or {item["mode"]: item["status"] for item in cases} != expected:
        raise AssertionError("StitchWitch measured cases mismatch")
    for shot in result["screenshots"]:
        data = (source / shot["file"]).read_bytes()
        if (
            data[:8] != b"\x89PNG\r\n\x1a\n"
            or hashlib.sha256(data).hexdigest() != shot["sha256"]
            or int.from_bytes(data[16:20], "big") != shot["width"]
            or int.from_bytes(data[20:24], "big") != shot["height"]
        ):
            raise AssertionError("StitchWitch measured screenshot mismatch")


def _verify_perma_delete_native(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/perma-native-delete"
    result = json.loads((source / "RESULTS.json").read_text())
    spec = source / result["nativeSpec"]["file"]
    if hashlib.sha256(spec.read_bytes()).hexdigest() != result["nativeSpec"]["sha256"]:
        raise AssertionError("Perma measured spec hash mismatch")
    if (source / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("Perma native example license mismatch")
    expected = {
        "settled editor / stored deletion": "passed",
        "pending editor / stored deletion": "failed",
        "settled list / stored deletion": "passed",
        "pending list / stored deletion": "failed",
        "settled editor / view cleanup": "failed",
        "settled list / view cleanup": "passed",
    }
    if (
        len(result["cases"]) != 6
        or {item["case"]: item["status"] for item in result["cases"]} != expected
    ):
        raise AssertionError("Perma measured cases mismatch")
    for case in result["cases"]:
        if case["case"].startswith("pending") and not (
            case["deletionAfterPointerUpUpperBoundMs"] < 500
            and not case["checkpoints"]["firstAbsent"]["targetPresent"]
            and case["checkpoints"]["afterReload"]["targetPresent"]
        ):
            raise AssertionError("Perma measured deletion precondition mismatch")
    for shot in result["screenshots"]:
        data = (source / shot["file"]).read_bytes()
        if (
            data[:8] != b"\x89PNG\r\n\x1a\n"
            or hashlib.sha256(data).hexdigest() != shot["sha256"]
            or int.from_bytes(data[16:20], "big") != shot["width"]
            or int.from_bytes(data[20:24], "big") != shot["height"]
        ):
            raise AssertionError("Perma measured screenshot mismatch")


def _verify_osw_native_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/osw-native"
    result = json.loads((source / "RESULTS.json").read_text())
    for name, expected in {
        result["nativeSpec"]["file"]: result["nativeSpec"]["sha256"],
        "playwright.config.mjs": result["configSha256"],
    }.items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise AssertionError("OSW measured test/config hash mismatch")
    if (source / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("OSW native license mismatch")
    if {x["case"]: x["status"] for x in result["cases"]} != {
        "same tab": "passed",
        "fresh peer": "passed",
        "earlier peer": "failed",
    } or len(result["cases"]) != 3:
        raise AssertionError("OSW measured controls/regression mismatch")
    for shot in result["screenshots"]:
        raw = (source / shot["file"]).read_bytes()
        if (
            raw[:8] != b"\x89PNG\r\n\x1a\n"
            or hashlib.sha256(raw).hexdigest() != shot["sha256"]
            or int.from_bytes(raw[16:20], "big") != shot["width"]
            or int.from_bytes(raw[20:24], "big") != shot["height"]
        ):
            raise AssertionError("OSW screenshot identity mismatch")
    name = "app-crash-lab-osw-native-v0.1.0.zip"
    raw = (root / "docs" / name).read_bytes()
    if (root / "docs" / (name + ".sha256")).read_text() != hashlib.sha256(
        raw
    ).hexdigest() + "  " + name + "\n":
        raise AssertionError("OSW ZIP checksum mismatch")
    members = {"osw-native/" + p.name: p.read_bytes() for p in source.iterdir() if p.is_file()}
    with ZipFile(root / "docs" / name) as archive:
        if set(archive.namelist()) != set(members) or any(
            archive.read(k) != v for k, v in members.items()
        ):
            raise AssertionError("OSW ZIP/source byte mismatch")


def _verify_naidan_native_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/naidan-native"
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        hashlib.sha256((source / "stale-settings.spec.mjs").read_bytes()).hexdigest()
        != result["specSha256"]
    ):
        raise AssertionError("Naidan measured script hash mismatch")
    cases = result["cases"]
    if len(cases) != 3 or {row["mode"]: row["status"] for row in cases} != {
        "single": "PASS",
        "fresh-peer": "PASS",
        "earlier-peer": "FAIL",
    }:
        raise AssertionError("Naidan measured controls/regression mismatch")
    for row in cases:
        expected = {**row["primaryCommitted"], "titleGeneration": "disabled"}
        for stage in ["afterPeerSave", "afterPrimaryReload"]:
            actual = row[stage]
            if (actual == expected) != (row["mode"] != "earlier-peer"):
                raise AssertionError("Naidan saved snapshots contradict outcome")
            if row["mode"] == "earlier-peer":
                if (
                    actual["systemPrompt"] != row["peerPromptBeforeSave"]
                    or {**actual, "systemPrompt": expected["systemPrompt"]} != expected
                ):
                    raise AssertionError("Naidan changed more than the measured prompt")
        if row["refused"] or any(
            row[name] for name in ["blockedRequests", "pageErrors", "nativeDialogs"]
        ):
            raise AssertionError("Naidan measured diagnostic mismatch")
    name = "app-crash-lab-naidan-native-v0.1.0.zip"
    bundle = root / "docs" / name
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    if (root / "docs" / (name + ".sha256")).read_text() != f"{digest}  {name}\n":
        raise AssertionError("Naidan ZIP digest mismatch")
    members = {"naidan-native/" + p.name: p.read_bytes() for p in source.iterdir() if p.is_file()}
    with ZipFile(bundle) as archive:
        if set(archive.namelist()) != set(members) or len(archive.namelist()) != len(members):
            raise AssertionError("Naidan ZIP membership mismatch")
        if any(archive.read(path) != body for path, body in members.items()):
            raise AssertionError("Naidan ZIP/source byte mismatch")


def _verify_readiness_native_pack(root: Path) -> None:
    source = root / "tools/app-crash-lab/examples/readiness-native"
    result = json.loads((source / "RESULTS.json").read_text())
    if (
        hashlib.sha256((source / "draft-navigation.mjs").read_bytes()).hexdigest()
        != result["specSha256"]
    ):
        raise AssertionError("Readiness measured script hash mismatch")
    cases = result["cases"]
    if len(cases) != 3 or {row["mode"]: row["status"] for row in cases} != {
        "same-tab": "PASS",
        "fresh-peer": "PASS",
        "earlier-peer": "FAIL",
    }:
        raise AssertionError("Readiness measured controls/regression mismatch")
    for row in cases:
        protected = {
            name: value
            for name, value in row["saved"].items()
            if name not in {"currentIndex", "updatedAt"}
        }
        for stage in ["afterPeerNavigation", "afterReload"]:
            actual = {
                name: value
                for name, value in row[stage].items()
                if name not in {"currentIndex", "updatedAt"}
            }
            if (actual == protected) != (row["mode"] != "earlier-peer"):
                raise AssertionError("Readiness saved snapshots contradict outcome")
        if any(row["diagnostic"].values()):
            raise AssertionError("Readiness measured diagnostic mismatch")


def _must_refuse(action) -> None:
    try:
        action()
    except ValueError:
        return
    raise AssertionError("invalid input was accepted")


def _load_csv_recipe(root: Path):
    path = root / "recipes" / "csv-to-report" / "report.py"
    spec = importlib.util.spec_from_file_location("public_csv_to_report", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public CSV recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_jev_recipe(root: Path):
    path = root / "recipes" / "jev-support-triage" / "triage.py"
    spec = importlib.util.spec_from_file_location("public_jev_support_triage", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public Jev recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_jev_csv_exception_recipe(root: Path):
    path = root / "recipes" / "jev-csv-exception-routing" / "route.py"
    spec = importlib.util.spec_from_file_location("public_jev_csv_exception_routing", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public Jev CSV exception recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_line_judgment_recipe(root: Path):
    path = root / "recipes" / "meeting-line-judgment" / "recipe.py"
    spec = importlib.util.spec_from_file_location("public_meeting_line_judgment", path)
    if spec is None or spec.loader is None:
        raise AssertionError("public meeting-line judgment recipe could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _verify_app_crash_lab_skill(root: Path) -> None:
    skill = root / ".agents" / "skills" / "app-crash-lab"
    archive = root / "docs" / "app-crash-lab-skill-v0.2.2.zip"
    relative_files = (
        "SKILL.md",
        "LICENSE",
        "references/runner.md",
        "references/native-playwright.md",
    )
    if (skill / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("App Crash Lab skill must include the root MIT license")
    with ZipFile(archive) as bundle:
        expected_names = {f"app-crash-lab/{name}" for name in relative_files}
        if set(bundle.namelist()) != expected_names or len(bundle.namelist()) != len(
            relative_files
        ):
            raise AssertionError("App Crash Lab skill ZIP contains unexpected or duplicate paths")
        for relative in relative_files:
            if bundle.read(f"app-crash-lab/{relative}") != (skill / relative).read_bytes():
                raise AssertionError(f"App Crash Lab skill ZIP differs from source: {relative}")
    for version in ("0.1.0", "0.1.1", "0.2.0", "0.2.1", "0.2.2"):
        published = root / "docs" / f"app-crash-lab-skill-v{version}.zip"
        checksum = published.with_suffix(published.suffix + ".sha256").read_text().split()
        if checksum != [hashlib.sha256(published.read_bytes()).hexdigest(), published.name]:
            raise AssertionError("App Crash Lab skill ZIP checksum differs from published bytes")


def _verify_demo_forge(root: Path) -> dict:
    demo_root = root / "experiments" / "demo-forge"
    skill_root = root / ".agents" / "skills" / "demo-forge"
    for relative in (
        "forge.py",
        "server.py",
        "operation.json",
        "operation.narrated.json",
        "app/index.html",
    ):
        if (skill_root / "scripts" / relative).read_bytes() != (demo_root / relative).read_bytes():
            raise AssertionError(
                f"bundled Demo Forge skill differs from recorder source: {relative}"
            )
    if (skill_root / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise AssertionError("bundled Demo Forge skill must include the root license")
    presentation_spec = importlib.util.spec_from_file_location(
        "public_demo_presentation", demo_root / "present.py"
    )
    presentation = importlib.util.module_from_spec(presentation_spec)
    presentation_spec.loader.exec_module(presentation)
    story = json.loads((demo_root / "story.example.json").read_text())
    if len(presentation.validate_story(story, 12)) != 3:
        raise AssertionError("presentation example must contain three valid cues")
    _must_refuse(lambda: presentation.validate_story(story, 2))
    forge_source = (demo_root / "forge.py").read_text(encoding="utf-8")
    if "build_gif_command" not in forge_source or "demo-forge.gif" not in forge_source:
        raise AssertionError("Demo Forge GIF artifact contract missing")
    operation = json.loads((demo_root / "operation.json").read_text(encoding="utf-8"))
    if operation["name"] != "launch-demo" or operation["input"] != {"project_name": "Launch Kit"}:
        raise AssertionError("Demo Forge operation contract changed")
    if len(operation["steps"]) != 6 or operation["success"]["text"] != "Launch Kit is ready":
        raise AssertionError("Demo Forge success contract changed")
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    help_result = subprocess.run(
        [sys.executable, "-B", "experiments/demo-forge/forge.py", "--help"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if help_result.returncode != 0 or "--tail-seconds" not in help_result.stdout:
        raise AssertionError("Demo Forge CLI help contract failed")
    doctor_result = subprocess.run(
        [sys.executable, "-B", "experiments/demo-forge/forge.py", "--doctor"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    try:
        doctor = json.loads(doctor_result.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError("Demo Forge doctor did not return JSON") from exc
    if doctor_result.returncode not in (0, 1) or doctor.get("scope") != "local-only":
        raise AssertionError("Demo Forge doctor contract failed")
    if set(doctor.get("requirements", {})) != {"python", "playwright", "chromium", "ffmpeg"}:
        raise AssertionError("Demo Forge doctor requirements changed")
    with TemporaryDirectory() as directory:
        output = Path(directory) / "out"
        output.mkdir()
        (output / "run.json").write_text(json.dumps({"scope": "experiments/demo-forge"}))
        (output / "demo-forge.mp4").write_bytes(b"synthetic previous clip")
        (output / "notes.txt").write_text("keep notes")
        invalid_operation = Path(directory) / "invalid.json"
        invalid_operation.write_text("not JSON")
        failed_run = subprocess.run(
            [
                sys.executable,
                "-B",
                str(demo_root / "forge.py"),
                "--operation",
                str(invalid_operation),
                "--output",
                str(output),
            ],
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
        )
        failed = json.loads(failed_run.stdout)
        archived = Path(failed["previous_run_dir"])
        if (
            failed_run.returncode != 1
            or failed["status"] != "failed"
            or failed["artifacts"]
            or (output / "demo-forge.mp4").exists()
            or (archived / "demo-forge.mp4").read_bytes() != b"synthetic previous clip"
            or (output / "notes.txt").read_text() != "keep notes"
            or json.loads((output / "run.json").read_text()) != failed
        ):
            raise AssertionError("Demo Forge failed rerun must preserve history, not stale exports")
    return {
        "operation": operation["name"],
        "steps": len(operation["steps"]),
        "success_text": operation["success"]["text"],
        "gif_artifact": "demo-forge.gif",
        "presentation": "author-written captions, no automatic timing or truth check",
        "doctor": doctor["status"],
        "failed_rerun_keeps_only_historical_media": True,
        "network_scope": "127.0.0.1",
        "external_write": False,
    }


def _verify_meeting_line_judgment(root: Path) -> dict:
    recipe = _load_line_judgment_recipe(root)
    meeting_path = root / "fixtures" / "synthetic_meeting.json"
    fixture_path = root / "fixtures" / "meeting_line_judgment.json"
    meeting = recipe.load_meeting(meeting_path)
    fixture = recipe.load_recorded_fixture(fixture_path)
    result = recipe.offline_result(meeting_path, fixture_path)
    if result != recipe.offline_result(meeting_path, fixture_path):
        raise AssertionError("meeting-line judgment is not deterministic")
    if (
        fixture["fixture_metadata"]["live_api_call"] is not False
        or fixture["fixture_metadata"]["record_origin"]
        != "hand_authored_synthetic_fixture_not_api_observation"
        or result["fixture_status"] != "recorded_synthetic_fixture_not_live"
        or result["live_api_call"] is not False
    ):
        raise AssertionError("recorded meeting-line fixture is mislabeled as live")
    if (
        result["input_line_count"],
        result["action_candidate_count"],
        result["review_count"],
    ) != (6, 1, 5):
        raise AssertionError("meeting-line judgment count reconciliation failed")
    action_ids = [row["line_id"] for row in result["action_candidates"]]
    review_ids = [row["line_id"] for row in result["review"]]
    if action_ids != ["L2"] or review_ids != ["L1", "L3", "L4", "L5", "L6"]:
        raise AssertionError("meeting-line action/review routing changed")
    review_by_id = {row["line_id"]: row for row in result["review"]}
    if not {
        "probability_below_threshold",
        "confidence_below_threshold",
        "ambiguity_flagged",
    }.issubset(set(review_by_id["L3"]["review_reasons"])):
        raise AssertionError("ambiguous or low-confidence action candidate was not reviewed")
    if any(
        key in row
        for row in [*result["action_candidates"], *result["review"]]
        for key in ("owner", "due", "number", "amount")
    ):
        raise AssertionError("meeting-line judgment extracted a code-owned field")
    if (
        result["human_review_required"] is not True
        or result["auto_decision"] is not False
        or result["auto_approval"] is not False
        or result["task_registration"] is not False
        or result["external_write"] is not False
    ):
        raise AssertionError("meeting-line judgment crossed the external-write boundary")

    payload = recipe.question_payload(meeting["lines"][0])
    if payload["model"] != "jev-1.13.0" or set(payload["state"]) != {
        "meeting_id",
        "line_id",
        "text",
    }:
        raise AssertionError("live payload does not use the fixed synthetic line contract")
    environment = os.environ.copy()
    environment.pop("TYPESAFE_API_KEY", None)
    environment.pop("PYTHONPATH", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    live_without_key = subprocess.run(
        [sys.executable, "-B", "recipes/meeting-line-judgment/recipe.py", "--live"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if (
        live_without_key.returncode == 0
        or "TYPESAFE_API_KEY" not in live_without_key.stderr
        or "Authorization" in live_without_key.stderr
    ):
        raise AssertionError("keyless --live did not refuse before network use")
    return {
        "input_lines": result["input_line_count"],
        "action_candidates": result["action_candidate_count"],
        "review": result["review_count"],
        "keyless_live_refused": True,
        "external_write": False,
    }


def _verify_csv_report(root: Path) -> dict:
    recipe = _load_csv_recipe(root)
    csv_root = root / "recipes" / "csv-to-report"
    sales_text = (csv_root / "sales.csv").read_text(encoding="utf-8")
    report = recipe.build_report(sales_text)
    expected_sales = {
        "status": "REVIEW_REQUIRED",
        "source_rows": 4,
        "valid_amount_rows": 3,
        "missing_amount_rows": 1,
        "invalid_amount_rows": 0,
        "duplicate_record_rows": 0,
        "total_amount_yen": 4500,
    }
    if report["metrics"] != expected_sales or report["narrative_verified"] is not True:
        raise AssertionError("CSV sample metrics or narrative do not reconcile")

    cases = {
        "empty.csv": {
            "status": "EMPTY_INPUT",
            "source_rows": 0,
            "valid_amount_rows": 0,
            "missing_amount_rows": 0,
            "invalid_amount_rows": 0,
            "duplicate_record_rows": 0,
            "total_amount_yen": 0,
        },
        "duplicate.csv": {
            "status": "REVIEW_REQUIRED",
            "source_rows": 2,
            "valid_amount_rows": 2,
            "missing_amount_rows": 0,
            "invalid_amount_rows": 0,
            "duplicate_record_rows": 1,
            "total_amount_yen": 2400,
        },
        "mixed-strings.csv": {
            "status": "REVIEW_REQUIRED",
            "source_rows": 3,
            "valid_amount_rows": 1,
            "missing_amount_rows": 1,
            "invalid_amount_rows": 1,
            "duplicate_record_rows": 0,
            "total_amount_yen": 1200,
        },
    }
    for name, expected in cases.items():
        actual = recipe.build_report((csv_root / "examples" / name).read_text(encoding="utf-8"))
        if actual["metrics"] != expected or actual["narrative_verified"] is not True:
            raise AssertionError(f"CSV edge case does not reconcile: {name}")

    invalid_csv_inputs = (
        "record_id,amount_yen\nX001,1200\n",
        "record_id,department,amount_yen\n,営業,1200\n",
        "record_id,department,amount_yen\nX001,営業,1200,unexpected\n",
        'record_id,department,amount_yen\nX001,"営業,1200\n',
    )
    for csv_text in invalid_csv_inputs:
        try:
            recipe.analyze_csv_text(csv_text)
        except recipe.CSVReportError:
            continue
        raise AssertionError("invalid CSV input was accepted")

    changed_narrative = report["narrative"].replace("4,500円", "4,501円")
    if changed_narrative == report["narrative"]:
        raise AssertionError("CSV narrative regression probe did not change its total")
    try:
        recipe.build_report(sales_text, narrative=changed_narrative)
    except recipe.NarrativeMismatch:
        pass
    else:
        raise AssertionError("incorrect narrative total was accepted")

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    completed = subprocess.run(
        [
            sys.executable,
            "-B",
            "recipes/csv-to-report/report.py",
            "--csv",
            "recipes/csv-to-report/sales.csv",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if completed.returncode:
        raise AssertionError(f"CSV README command failed: {completed.stderr}")
    cli_result = json.loads(completed.stdout)
    if (
        cli_result.get("metrics") != expected_sales
        or cli_result.get("narrative_verified") is not True
    ):
        raise AssertionError("CSV README command output did not reconcile")
    return {
        "source_rows": expected_sales["source_rows"],
        "missing_amount_rows": expected_sales["missing_amount_rows"],
        "total_amount_yen": expected_sales["total_amount_yen"],
        "edge_cases": len(cases),
        "invalid_inputs_rejected": len(invalid_csv_inputs),
        "narrative_mismatch_rejected": True,
    }


def _verify_jev_recipe(root: Path) -> dict:
    recipe = _load_jev_recipe(root)
    recipe_root = root / "recipes" / "jev-support-triage"
    cases_path = recipe_root / "cases.json"
    recorded_path = recipe_root / "observed-answers.json"
    cases = recipe.load_cases(cases_path)
    report = recipe.reproduce(cases_path, recorded_path)
    expected_summary = {
        "cases": 16,
        "clear_cases": 11,
        "routable_clear_cases": 10,
        "routable_correct_auto": 10,
        "routable_wrong_auto": 0,
        "routable_reviewed": 0,
        "clear_other_cases": 1,
        "clear_other_reviewed": 1,
        "review_cases": 5,
        "review_gated": 5,
        "review_missed": 0,
        "input_tokens": 7655,
        "latency_ms_median": 844.5,
        "latency_ms_max": 2738,
    }
    if report["summary"] != expected_summary:
        raise AssertionError(f"Jev recorded summary changed: {report['summary']}")
    if (
        report["fixture_status"] != "SYNTHETIC_ONLY_NOT_PRODUCTION"
        or report["recorded_response_status"] != "recorded_fixture_not_live_call"
        or report["model"] != "jev-1.13.0"
        or report["input_fixture_sha256"]
        != "cf03bab36b8914a4393f79f402541c2c0f84c24791368749d734c532743904d5"
        or report["recorded_fixture_sha256"]
        != hashlib.sha256(recorded_path.read_bytes()).hexdigest()
        or report["provisional_thresholds"] != {"probability": 0.85, "confidence": 0.65}
        or report["offline"] is not True
        or report["network_calls"] != 0
        or report["external_write"] is not False
    ):
        raise AssertionError("Jev offline boundary or fixture metadata changed")

    rows_by_id = {row["id"]: row for row in report["cases"]}
    expected_review_ids = {
        "jp-unrelated",
        "jp-mixed-login-price",
        "jp-invoice-access",
        "jp-vague",
        "jp-two-requests",
        "jp-injection",
    }
    if {case["id"] for case in cases} != set(rows_by_id):
        raise AssertionError("Jev case IDs do not reconcile")
    if any(rows_by_id[case_id]["action"] != "review" for case_id in expected_review_ids):
        raise AssertionError("Jev review cases were automatically routed")

    changed = json.loads(recorded_path.read_text(encoding="utf-8"))
    changed["cases"][0]["answer"]["choice"] = "billing"
    with TemporaryDirectory(prefix="jev-triage-invalid-") as directory:
        invalid = Path(directory) / "observed-answers.json"
        invalid.write_text(json.dumps(changed), encoding="utf-8")
        _must_refuse(lambda: recipe.reproduce(cases_path, invalid))

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment.pop("TYPESAFE_API_KEY", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    offline = subprocess.run(
        [sys.executable, "-B", "recipes/jev-support-triage/triage.py", "--offline"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if offline.returncode:
        raise AssertionError(f"Jev offline README command failed: {offline.stdout}{offline.stderr}")
    cli_report = json.loads(offline.stdout)
    if cli_report["summary"] != expected_summary or cli_report["network_calls"] != 0:
        raise AssertionError("Jev offline CLI output did not reconcile")

    live_without_key = subprocess.run(
        [sys.executable, "-B", "recipes/jev-support-triage/triage.py", "--live"],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if live_without_key.returncode == 0 or "TYPESAFE_API_KEY" not in live_without_key.stdout:
        raise AssertionError("Jev live mode did not fail closed without its environment key")

    payload = recipe.question_payload(cases[0]["message"])
    if payload["model"] != "jev-1.13.0" or payload["state"] != {"message": cases[0]["message"]}:
        raise AssertionError("Jev live payload contract changed")
    return {
        "cases": 16,
        "routable_correct_auto": 10,
        "review_gated": 5,
        "network_calls": 0,
        "external_write": False,
    }


def _verify_jev_csv_exception_recipe(root: Path) -> dict:
    recipe = _load_jev_csv_exception_recipe(root)
    recipe_root = root / "recipes" / "jev-csv-exception-routing"
    cases_path = recipe_root / "cases.json"
    recorded_path = recipe_root / "recorded-answers.json"
    cases = recipe.load_cases(cases_path)
    report = recipe.reproduce(cases_path, recorded_path)
    expected_baseline = {
        "processed_count": 24,
        "auto_candidate_count": 15,
        "review_count": 5,
        "unclassifiable_count": 4,
        "review_or_hold_count": 9,
        "review_rate": 0.375,
        "correct_auto_count": 12,
        "false_auto_count": 3,
        "dangerous_false_auto_count": 3,
        "missed_candidate_count": 0,
    }
    expected_jev = {
        "processed_count": 24,
        "auto_candidate_count": 11,
        "review_count": 12,
        "unclassifiable_count": 1,
        "review_or_hold_count": 13,
        "review_rate": 0.5417,
        "correct_auto_count": 11,
        "false_auto_count": 0,
        "dangerous_false_auto_count": 0,
        "missed_candidate_count": 1,
    }
    if report["fixture_count"] != len(cases) or len(cases) != 24:
        raise AssertionError("CSV exception fixture count changed")
    if report["baseline"] != expected_baseline or report["jev"] != expected_jev:
        raise AssertionError("CSV exception routing metrics changed")
    if report["input_fixture_sha256"] != hashlib.sha256(cases_path.read_bytes()).hexdigest():
        raise AssertionError("CSV exception input fixture hash does not reconcile")
    if (
        report["recorded_fixture_sha256"]
        != "31fb5dc7dc5dfb6a26e4d65bdd57a89dc8bf3ca52f12c17487a718bcb18d43a3"
        or report["recorded_response_status"] != "recorded_choice_fixture_not_live_call"
        or report["model"] != "jev-1.13.0"
        or report["observed_at"] is not None
        or report["thresholds"] != {"probability": 0.85, "confidence": 0.65}
        or report["measurement"]
        != {
            "provider_observation": "not_run",
            "provider_calls": 0,
            "provider_body_saved": False,
            "elapsed_ms": None,
            "input_tokens": None,
            "cost_estimate_usd": None,
            "cost_basis": "not measured; no live provider call",
        }
        or report["offline"] is not True
        or report["network_calls"] != 0
        or report["external_write"] is not False
    ):
        raise AssertionError("CSV exception offline boundary or measurement metadata changed")
    if report["comparison"] != {
        "same_fixture": True,
        "baseline_false_auto_count": 3,
        "jev_false_auto_count": 0,
        "baseline_dangerous_false_auto_count": 3,
        "jev_dangerous_false_auto_count": 0,
        "false_auto_reduction_count": 3,
        "auto_candidate_recommendation": "DO_NOT_RECOMMEND_AUTO_ROUTING",
    }:
        raise AssertionError("CSV exception comparison or safety recommendation changed")
    if sum(case["group"] == "review" for case in cases) < 6:
        raise AssertionError("CSV exception fixture lost required review examples")

    changed = json.loads(recorded_path.read_text(encoding="utf-8"))
    changed["cases"][0]["answer"]["choice"] = "billing"
    with TemporaryDirectory(prefix="jev-csv-exception-invalid-") as directory:
        invalid = Path(directory) / "recorded-answers.json"
        invalid.write_text(json.dumps(changed), encoding="utf-8")
        _must_refuse(lambda: recipe.reproduce(cases_path, invalid))

    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    environment.pop("TYPESAFE_API_KEY", None)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    offline = subprocess.run(
        [
            sys.executable,
            "-B",
            "recipes/jev-csv-exception-routing/route.py",
            "--offline",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if offline.returncode:
        raise AssertionError(
            f"CSV exception offline README command failed: {offline.stdout}{offline.stderr}"
        )
    cli_report = json.loads(offline.stdout)
    if cli_report["baseline"] != expected_baseline or cli_report["jev"] != expected_jev:
        raise AssertionError("CSV exception offline CLI output did not reconcile")
    return {
        "cases": 24,
        "baseline_false_auto": 3,
        "jev_false_auto": 0,
        "review_or_hold": {"baseline": 9, "jev": 13},
        "unclassifiable": {"baseline": 4, "jev": 1},
        "network_calls": 0,
        "external_write": False,
    }


def verify(
    root: Path | None = None,
    *,
    transcript: object = _MISSING,
    model_output: object = _MISSING,
    human_review: object = _MISSING,
) -> dict:
    root = (root or Path(__file__).resolve().parent).resolve()
    _assert_candidate_boundary(root)
    csv_summary = _verify_csv_report(root)
    line_judgment_summary = _verify_meeting_line_judgment(root)
    jev_summary = _verify_jev_recipe(root)
    jev_csv_exception_summary = _verify_jev_csv_exception_recipe(root)
    _verify_app_crash_lab_skill(root)
    _verify_reading_assistant_pack(root)
    _verify_taglio_pack(root)
    _verify_livepage_pack(root)
    _verify_nebulark_pack(root)
    _verify_native_livepage_pack(root)
    _verify_native_write_denied_pack(root)
    _verify_brainotes_native_pack(root)
    _verify_native_optional_history_pack(root)
    _verify_video_host_history_native(root)
    _verify_life_tracker_stale_cloud_native(root)
    _verify_stitchwitch_native(root)
    _verify_perma_delete_native(root)
    _verify_osw_native_pack(root)
    _verify_readiness_native_pack(root)
    _verify_naidan_native_pack(root)
    demo_forge_summary = _verify_demo_forge(root)

    supplied_inputs = (
        transcript is not _MISSING,
        model_output is not _MISSING,
        human_review is not _MISSING,
    )
    if any(supplied_inputs):
        if not all(supplied_inputs):
            raise Refused("Custom verification requires transcript, model output, and human review")
        plan = prepare(transcript, model_output, human_review=human_review)
        validate_plan(plan, human_review=human_review)
        return {
            "files": len(EXPECTED_FILES),
            "prepared_tasks": len(plan["tasks"]),
            "csv_report": csv_summary,
            "line_judgment": line_judgment_summary,
            "jev_report": jev_summary,
            "jev_csv_exception_report": jev_csv_exception_summary,
            "demo_forge": demo_forge_summary,
            "external_write": False,
        }

    transcript = read_json(root / "fixtures" / "synthetic_meeting.json")
    model_output = read_json(root / "fixtures" / "selected_model_output.json")
    human_review = read_json(root / "fixtures" / "human_review.json")
    metadata = model_output["fixture_metadata"]
    if metadata["label"] != "SYNTHETIC_ONLY_NOT_PRODUCTION":
        raise AssertionError("synthetic fixture label is missing")
    plan = prepare(transcript, model_output, human_review=human_review)
    if plan != prepare(transcript, model_output, human_review=human_review):
        raise AssertionError("prepare is not deterministic")
    reviewed_line_ids = set(human_review["human_confirmed_action_line_ids"])
    if any(
        evidence["line_id"] not in reviewed_line_ids
        for task in plan["tasks"]
        for evidence in task["evidence"]
    ):
        raise AssertionError("a task uses evidence outside the human review input")

    _must_refuse(lambda: prepare(transcript, model_output))
    bad_review = deepcopy(human_review)
    bad_review["source_hash"] = "0" * 64
    _must_refuse(lambda: prepare(transcript, model_output, human_review=bad_review))

    bad_output = deepcopy(model_output)
    bad_output["proposal"]["tasks"][0]["owner"] = "根拠のない担当"
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))
    bad_output = deepcopy(model_output)
    bad_output["proposal"]["tasks"][0]["execute"] = "do not run"
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))

    bad_output = deepcopy(model_output)
    bad_output["human_review"] = human_review
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))
    bad_output = deepcopy(model_output)
    bad_output["proposal"]["human_confirmed_action_line_ids"] = ["L4"]
    _must_refuse(lambda: prepare(transcript, bad_output, human_review=human_review))

    for line in transcript["lines"]:
        if line["id"] in reviewed_line_ids:
            continue
        bad_output = deepcopy(model_output)
        bad_output["proposal"]["tasks"] = [
            {
                "title": line["text"][:300],
                "owner": None,
                "due": None,
                "evidence": [{"line_id": line["id"], "quote": line["text"]}],
            }
        ]
        _must_refuse(
            lambda bad_output=bad_output: prepare(transcript, bad_output, human_review=human_review)
        )

    _must_refuse(lambda: validate_plan(plan))
    changed_review = deepcopy(human_review)
    changed_review["human_confirmed_action_line_ids"].append("L4")
    _must_refuse(lambda: validate_plan(plan, human_review=changed_review))
    approval = approve(plan, "synthetic-local-review", human_review=human_review)
    _must_refuse(lambda: approve(plan, "synthetic-local-review"))
    with TemporaryDirectory(prefix="meeting-to-tasks-verify-") as directory:
        target = Path(directory) / "tasks.sqlite3"
        missing_review_target = Path(directory) / "missing-review.sqlite3"
        _must_refuse(lambda: apply_local(plan, approval, missing_review_target))
        if missing_review_target.exists():
            raise AssertionError("missing human review created a target")
        _must_refuse(lambda: apply_local(plan, {}, target, human_review=human_review))
        first = apply_local(plan, approval, target, human_review=human_review)
        repeat = apply_local(plan, approval, target, human_review=human_review)
        changed = deepcopy(plan)
        changed["tasks"][0]["owner"] = "改変された担当"
        changed_target = Path(directory) / "changed.sqlite3"
        _must_refuse(
            lambda: apply_local(changed, approval, changed_target, human_review=human_review)
        )
        if changed_target.exists():
            raise AssertionError("changed plan created a target")
    expected = (2, 0, 2)
    actual = (first["inserted"], repeat["inserted"], repeat["total_stored"])
    if actual != expected:
        raise AssertionError(f"count reconciliation failed: {actual}")
    if first["external_write"] is not False or repeat["external_write"] is not False:
        raise AssertionError("external write boundary failed")
    return {
        "files": len(EXPECTED_FILES),
        "deterministic_prepare": True,
        "reviewed_action_line_ids": sorted(reviewed_line_ids),
        "csv_report": csv_summary,
        "line_judgment": line_judgment_summary,
        "jev_report": jev_summary,
        "jev_csv_exception_report": jev_csv_exception_summary,
        "demo_forge": demo_forge_summary,
        "first_inserted": first["inserted"],
        "repeat_inserted": repeat["inserted"],
        "stored": repeat["total_stored"],
        "external_write": False,
    }


def verify_relay_archive() -> None:
    root = Path(__file__).resolve().parent
    # Preserve the original public release independently of the current source.
    original = root / "docs/agent-relay-check-v0.1.0.zip"
    original_hash = "8c6005561242e11a470178afe4afedc071f77099195bd29609334aa227fb2105"
    assert hashlib.sha256(original.read_bytes()).hexdigest() == original_hash
    assert Path(str(original) + ".sha256").read_text().split()[0] == original_hash
    previous = root / "docs/agent-relay-check-v0.1.1.zip"
    previous_hash = "04b0cec55e34535a1530c1ec053e5643d27815723088576d3ce6ac1d6e0edf69"
    assert hashlib.sha256(previous.read_bytes()).hexdigest() == previous_hash
    assert Path(str(previous) + ".sha256").read_text().split()[0] == previous_hash
    native_previous = root / "docs/agent-relay-check-v0.1.2.zip"
    native_previous_hash = "ea1b726566028345d4cfcffd5ba4908b2708caf5d0612541551ebb1021397b94"
    assert hashlib.sha256(native_previous.read_bytes()).hexdigest() == native_previous_hash
    assert Path(str(native_previous) + ".sha256").read_text().split()[0] == native_previous_hash
    ci_previous = root / "docs/agent-relay-check-v0.1.3.zip"
    ci_previous_hash = "a2cce93178144ee535b1637ffc23a8e2592d2e4a863d058785a145ea7adf7a0c"
    assert hashlib.sha256(ci_previous.read_bytes()).hexdigest() == ci_previous_hash
    assert Path(str(ci_previous) + ".sha256").read_text().split()[0] == ci_previous_hash
    archive = root / "docs/agent-relay-check-v0.1.4.zip"
    expected_hash = Path(str(archive) + ".sha256").read_text().split()[0]
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected_hash
    tool = root / "tools/agent-relay-check"
    expected = {"agent-relay-check/" + p.relative_to(tool).as_posix(): p.read_bytes()
                for p in tool.rglob("*") if p.is_file()}
    with ZipFile(archive) as bundle:
        assert len(bundle.namelist()) == len(expected)
        assert set(bundle.namelist()) == set(expected)
        for name, content in expected.items():
            assert bundle.read(name) == content, name
    packaged = subprocess.run(
        [sys.executable, '-B', str(root / 'experiments/relay-package/package.py'), '--check'],
        capture_output=True, text=True, check=False,
    )
    assert packaged.returncode == 0, packaged.stderr


def verify_leak_regression_lab() -> None:
    root = Path(__file__).resolve().parent
    checked = subprocess.run([sys.executable, '-B', str(root / 'tools/leak-regression-lab/package.py'), '--check'], capture_output=True, text=True, check=False)
    assert checked.returncode == 0, checked.stderr
    evidence = json.loads((root / 'docs/leak-regression-lab-measurements.json').read_text())
    assert evidence['evidence_kind'] == 'operator-synthetic-fixture-recording'
    assert evidence['external_adoption'] is False and evidence['environment']['stacks'] == 1
    expected = {'secure': (14, 0, 0), 'rows-leak': (10, 4, 0), 'objects-leak': (10, 4, 0), 'public-leak': (8, 6, 0), 'deny-all': (8, 0, 6), 'repaired': (14, 0, 0)}
    runs = evidence['runs']
    assert len(runs) == 12 and {(r['mode'], r['ownership']) for r in runs} == {(m, o) for m in expected for o in ['owner', 'team']}
    all_cases = [case for run in runs for case in run['report']['cases']]
    assert len(all_cases) == 168
    assert sum(case['http_status'] is not None for case in all_cases) == 160
    assert evidence['totals'] == {'runs': 12, 'planned_read_cases': 168, 'completed_http_read_responses': 160, 'dependent_checks_not_attempted_due_to_owner_control': 8, 'sign_ins': 24}
    assert evidence['protocol_controls']['offline_node_tests'] == 17
    for ext, artifact in evidence['artifacts'].items():
        assert ext in ['zip', 'tgz']
        assert hashlib.sha256((root / 'docs' / artifact['file']).read_bytes()).hexdigest() == artifact['sha256']
    for run in runs:
        report = run['report']; mode = run['mode']
        counts = tuple(report['counts'][key] for key in ['PASS', 'FAIL', 'INCONCLUSIVE'])
        assert counts == expected[mode] and len(report['cases']) == 14
        assert report['status'] == ('FAIL' if counts[1] else 'INCONCLUSIVE' if counts[2] else 'PASS')
        assert report['coverage_complete'] == (counts[2] == 0)
        for case in report['cases']:
            leaked = (mode == 'rows-leak' and case['surface'] == 'row' and case['actor'] != 'owner') or (mode == 'objects-leak' and case['surface'] == 'object' and case['actor'] in ['other', 'anonymous']) or (mode == 'public-leak' and case['surface'] == 'object' and case['actor'] != 'owner')
            unknown = mode == 'deny-all' and case['surface'] == 'row'
            assert case['status'] == ('FAIL' if leaked else 'INCONCLUSIVE' if unknown else 'PASS')
        assert set(report) <= {'schema_version', 'product', 'version', 'measured_at', 'contract_sha256', 'environment', 'status', 'coverage_complete', 'authentication', 'cases', 'scope', 'not_tested', 'counts'}
        assert all(set(c) == {'resource', 'surface', 'actor', 'route', 'status', 'http_status', 'reason'} for c in report['cases'])

    sessions = json.loads((root / 'docs/leak-regression-lab-session-measurements.json').read_text())
    assert sessions['version'] == '0.1.1' and sessions['external_adoption'] is False
    assert sessions['evidence_kind'] == 'operator-synthetic-fixture-recording'
    assert sessions['environment']['stacks'] == 1 and sessions['environment']['oauth_browser_flow_tested'] is False
    assert sessions['protocol_controls']['offline_node_tests'] == 27
    assert sessions['protocol_controls']['fresh_archive_files_byte_equal'] == 18
    assert sessions['actual_http_requests'] == {'auth-password POST': 2, 'auth-user GET': 24, 'row GET': 64, 'object GET': 96}
    assert sessions['totals'] == {'runs': 12, 'planned_read_cases': 168, 'completed_http_read_responses': 160,
        'dependent_checks_not_attempted_due_to_owner_control': 8, 'fixture_setup_password_sign_ins': 2,
        'checker_auth_user_gets': 24, 'checker_password_sign_ins': 0}
    assert {(r['mode'], r['ownership']) for r in sessions['runs']} == {(m, o) for m in expected for o in ['owner', 'team']}
    session_cases = [c for r in sessions['runs'] for c in r['report']['cases']]
    assert len(session_cases) == 168 and sum(c['http_status'] is not None for c in session_cases) == 160
    for run in sessions['runs']:
        assert run['report']['version'] == '0.1.1'
        assert tuple(run['report']['counts'][k] for k in ['PASS', 'FAIL', 'INCONCLUSIVE']) == expected[run['mode']]
    for ext, artifact in sessions['artifacts'].items():
        assert ext in ['zip', 'tgz']
        assert hashlib.sha256((root / 'docs' / artifact['file']).read_bytes()).hexdigest() == artifact['sha256']
    controls = sessions['protocol_controls']['additional_live_controls']
    assert len(controls) == 6
    for control in controls:
        if control['control'] in ['password-only', 'mixed-session-password']:
            assert control['status'] == 'PASS' and control['cases'] == 14
        else:
            assert control['status'] == 'INCONCLUSIVE' and control['cases'] == 0
            assert all(c['surface'].startswith('auth-') for c in control['actual_requests'])


    columns = json.loads((root / 'docs/leak-regression-lab-column-measurements.json').read_text())
    assert columns['version'] == '0.1.2' and columns['external_adoption'] is False
    assert columns['evidence_kind'] == 'operator-synthetic-fixture-recording'
    assert columns['environment']['stacks'] == 1
    assert columns['protocol_controls']['offline_node_tests'] == 31
    assert columns['protocol_controls']['fresh_archive_files_byte_equal'] == 18
    assert columns['protocol_controls']['legacy_report_comparison'] == 'DIFFERENT_CHECK_CONTRACT'
    for ext, artifact in columns['artifacts'].items():
        assert ext in ['zip', 'tgz']
        data = (root / 'docs' / artifact['file']).read_bytes()
        assert len(data) == artifact['bytes']
        assert hashlib.sha256(data).hexdigest() == artifact['sha256']
    control = columns['column_acl_control']
    assert control['external_adoption'] is False and control['original_acl_catalog_restored'] is True
    assert control['original_rls_restored'] is True and control['application_writes_by_checker'] == 0
    assert control['totals'] == {'runs': 5, 'planned_read_cases': 70, 'completed_http_read_responses': 66,
        'dependent_checks_not_attempted_due_to_owner_control': 4, 'checker_auth_user_gets': 10,
        'checker_password_sign_ins': 0}
    assert [tuple(r['report']['counts'][k] for k in ['PASS', 'FAIL', 'INCONCLUSIVE']) for r in control['results']] == [
        (14, 0, 0), (8, 0, 6), (14, 0, 0), (10, 4, 0), (14, 0, 0)]
    for i, run in enumerate(control['results']):
        assert run['report']['version'] == ('0.1.1' if i < 2 else '0.1.2')
        if i > 0:
            assert run['grants']['anon_table_select'] is False
            assert run['grants']['authenticated_owner_id'] is False
        if i > 1:
            assert all(r['selected_fields'] == ['id', 'body'] for r in run['actual_requests'] if r['surface'] == 'row')
        assert all(r['method'] == 'GET' for r in run['actual_requests'])
    new_matrix = columns['matrix']
    assert new_matrix['totals'] == sessions['totals']
    assert new_matrix['application_http_responses_by_surface'] == {'row': 64, 'object': 96}
    assert {(r['mode'], r['ownership']) for r in new_matrix['runs']} == {(m, o) for m in expected for o in ['owner', 'team']}
    new_cases = [c for r in new_matrix['runs'] for c in r['report']['cases']]
    assert len(new_cases) == 168 and sum(c['http_status'] is not None for c in new_cases) == 160
    for run in new_matrix['runs']:
        report = run['report']
        assert report['version'] == '0.1.2'
        assert report['row_projection'] == 'declared-id-and-expected-fields'
        assert tuple(report['counts'][k] for k in ['PASS', 'FAIL', 'INCONCLUSIVE']) == expected[run['mode']]
        assert set(report) <= {'schema_version', 'product', 'version', 'measured_at', 'contract_sha256',
            'environment', 'status', 'coverage_complete', 'authentication', 'cases', 'scope', 'not_tested', 'counts', 'row_projection'}
        assert all(set(c) == {'resource', 'surface', 'actor', 'route', 'status', 'http_status', 'reason'} for c in report['cases'])

    anonymous = json.loads((root / 'docs/leak-regression-lab-anon-measurements.json').read_text())
    assert anonymous['version'] == '0.1.3' and anonymous['legacy_version'] == '0.1.2'
    assert anonymous['external_adoption'] is False
    assert anonymous['evidence_kind'] == 'operator-synthetic-fixture-recording'
    assert anonymous['original_acl_set_restored'] and anonymous['original_rls_restored']
    assert anonymous['application_writes_by_checker'] == 0
    assert anonymous['protocol_controls']['offline_node_tests'] == 37
    assert anonymous['protocol_controls']['fresh_archive_files_byte_equal'] == 18
    assert anonymous['protocol_controls']['legacy_report_comparison'] == 'DIFFERENT_CHECK_CONTRACT'
    assert anonymous['totals'] == {'runs': 8, 'planned_read_cases': 112,
        'completed_application_http_responses': 108, 'checker_auth_user_gets': 16,
        'dependent_checks_not_attempted_due_to_owner_control': 4}
    expected_denials = [(14, 0, 0), (12, 0, 2), (14, 0, 0), (12, 0, 2),
        (12, 2, 0), (14, 0, 0), (8, 0, 6), (14, 0, 0)]
    assert [tuple(r['report']['counts'][k] for k in ['PASS', 'FAIL', 'INCONCLUSIVE'])
        for r in anonymous['runs']] == expected_denials
    for i, run in enumerate(anonymous['runs']):
        report = run['report']
        assert report['version'] == ('0.1.2' if i == 1 else '0.1.3')
        assert len(report['cases']) == 14
        if i != 1:
            assert report['row_denial_policy'] == 'postgrest-anonymous-42501-with-owner-control-v1'
        assert all(r['method'] == 'GET' for r in run['actual_requests'])
    for i, code in [(1, '42501'), (2, '42501'), (3, 'PGRST301'), (4, '42501'), (5, '42501')]:
        responses = [r for r in anonymous['runs'][i]['actual_requests'] if r['surface'] == 'row' and r['anonymous']]
        assert len(responses) == 2 and all(r['http_status'] == 401 and r['postgres_or_gateway_code'] == code for r in responses)
    assert all(r['http_status'] is None for r in anonymous['runs'][6]['report']['cases']
        if r['surface'] == 'row' and r['actor'] != 'owner')
    for relative, digest in anonymous['source_sha256'].items():
        assert relative in ['lib/config.mjs', 'lib/probe.mjs', 'test/probe.test.mjs', 'cli.mjs', 'test/cli.test.mjs']
        assert hashlib.sha256((root / 'tools/leak-regression-lab' / relative).read_bytes()).hexdigest() == digest
    for ext, artifact in anonymous['artifacts'].items():
        assert ext in ['zip', 'tgz']
        data = (root / 'docs' / artifact['file']).read_bytes()
        assert len(data) == artifact['bytes']
        assert hashlib.sha256(data).hexdigest() == artifact['sha256']
    setup_prompt = (root / 'docs/leak-regression-lab-setup-prompt.txt').read_text()
    zip_artifact = anonymous['artifacts']['zip']
    assert f"https://aichance.github.io/business-ai-recipes/{zip_artifact['file']}" in setup_prompt
    assert f"Expected ZIP SHA-256: {zip_artifact['sha256']}" in setup_prompt
    fresh = anonymous['fresh_archive_controls']
    assert fresh['auth_input'] == 'ordinary-password'
    assert fresh['original_acl_set_restored'] and fresh['original_rls_restored']
    assert fresh['totals'] == {'runs': 3, 'planned_read_cases': 42,
        'completed_application_http_responses': 42, 'checker_password_sign_ins': 6,
        'checker_auth_user_gets': 0, 'dependent_checks_not_attempted_due_to_owner_control': 0}
    assert [r['exit_code'] for r in fresh['results']] == [0, 2, 0]
    assert [tuple(r['report']['counts'][k] for k in ['PASS', 'FAIL', 'INCONCLUSIVE'])
        for r in fresh['results']] == [(14, 0, 0), (12, 2, 0), (14, 0, 0)]
    assert fresh['comparisons'] == {'same_version_regressions': 2, 'same_version_resolved': 2,
        'regression_exit_code': 2, 'repair_exit_code': 0, 'legacy_comparison_exit_code': 1,
        'legacy_report_comparison': 'DIFFERENT_CHECK_CONTRACT'}
    for run in fresh['results']:
        assert run['report']['version'] == '0.1.3'
        assert len(run['report']['cases']) == 14
        assert len(run['actual_requests']) == 16
        assert all(r['method'] == ('POST' if r['surface'] == 'auth-password' else 'GET')
            for r in run['actual_requests'])


def main() -> int:
    try:
        verify_relay_archive()
        verify_leak_regression_lab()
        result = verify()
        replay = subprocess.run(
            [sys.executable, '-B', str(Path(__file__).resolve().parent / 'experiments/state-lens/test_prepare_replay.py')],
            capture_output=True, text=True, check=False,
        )
        if replay.returncode:
            raise AssertionError('State Lens release regression failed: ' + replay.stdout + replay.stderr)
    except (AssertionError, OSError, ValueError) as exc:
        print(f"VERIFY_FAILED: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: candidate boundary and synthetic fixture labels; files={result['files']}")
    print('PASS: State Lens current-download and immutable-release regression checks')
    print("PASS: separate human-reviewed evidence boundary")
    print("PASS: deterministic prepare and schema validation")
    print("PASS: Jev line judgment fixture, abstention, keyless live refusal, and write boundary")
    print("PASS: CSV README command, edge cases, and narrative reconciliation")
    print("PASS: Jev recorded fixture, provisional abstention gate, and offline/live boundary")
    print(
        "PASS: Demo Forge CLI, GIF artifact, success contract, localhost scope, "
        "and no external write; "
        "steps={steps}; gif={gif_artifact}".format(**result["demo_forge"])
    )
    print(
        "PASS: Jev CSV exception comparison; cases={cases}; "
        "baseline_false_auto={baseline_false_auto}; jev_false_auto={jev_false_auto}".format(
            **result["jev_csv_exception_report"]
        )
    )
    print(
        "PASS: first_run.inserted={first_inserted}; "
        "repeat_run.inserted={repeat_inserted}; "
        "repeat_run.total_stored={stored}; external_write={external_write}".format(**result)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
