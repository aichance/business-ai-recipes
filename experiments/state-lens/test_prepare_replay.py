"""Release-navigation and immutable-asset regressions; no app/model/network calls."""

import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/playwright-state-lens'
SCRIPT = Path(__file__).with_name('prepare_replay.py')
VERSION = json.loads((SOURCE / 'package.json').read_text())['version']
ARCHIVE = f'aichance-playwright-state-lens-{VERSION}.tgz'
MODULE = f'state-lens-v{VERSION}.mjs'
DECLARATIONS = f'state-lens-v{VERSION}.d.mts'
PYTHON_MODULE = 'state_lens_v' + VERSION.replace('.', '_').replace('-', '_') + '.py'


class ReplayReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='state-lens-release-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.out = self.root / 'out'
        self.inputs = self.root / 'input'
        self.out.mkdir()
        self.inputs.mkdir()
        shutil.copyfile(ROOT / 'docs' / ARCHIVE, self.out / ARCHIVE)
        self.recording = '<!doctype html><style></style><main></main><script type="application/json" id="data">{"schema":1,"title":"Synthetic immutable observation","checkpoints":[]}</script><script>if(r.checkpoints.length)select(0);</script>'
        for mode in ['reload-loss', 'good']:
            (self.inputs / (mode + '-state-lens.html')).write_text(self.recording)
        (self.inputs / 'comparison.json').write_text(json.dumps({'outcomes': [
            {'valuesAgree': True, 'standardAlsoContainsData': True},
            {'valuesAgree': True, 'standardAlsoContainsData': True},
        ]}))
        self.command = [sys.executable, str(SCRIPT), '--input', str(self.inputs),
                        '--preview', str(ROOT / 'docs/state-lens-preview.png'),
                        '--out', str(self.out), '--pages-only']

    def run_replay(self):
        return subprocess.run(self.command, capture_output=True, text=True)

    def test_current_version_and_recording_identity_are_separate(self):
        result = self.run_replay()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.out / MODULE).read_bytes(),
                         (ROOT / 'docs' / MODULE).read_bytes())
        self.assertEqual((self.out / DECLARATIONS).read_bytes(),
                         (ROOT / 'docs' / DECLARATIONS).read_bytes())
        self.assertFalse((self.out / 'state-lens-v0.1.0-experimental.1.mjs').exists())
        for name in ['state-lens.html', 'state-lens-good.html']:
            page = (self.out / name).read_text()
            self.assertIn(f'href="{MODULE}"', page)
            self.assertIn(f'href="{DECLARATIONS}"', page)
            self.assertIn('Current download: ' + VERSION, page)
            self.assertIn(self.recording[self.recording.index('<script type="application/json"'):].replace('select(0)', 'select(r.checkpoints.length-1)'), page)
        for name in ['state-lens-recorded-v0.1.0-experimental.1.html', 'state-lens-good-recorded-v0.1.0-experimental.1.html']:
            self.assertEqual((self.out / name).read_bytes(), (ROOT / 'docs' / name).read_bytes())
        digest = hashlib.sha256((self.out / MODULE).read_bytes()).hexdigest()
        self.assertEqual((self.out / (MODULE + '.sha256')).read_text(), digest + '  ' + MODULE + '\n')

    def test_published_entrypoints_offer_current_assets_without_relabeling_recordings(self):
        for name in ['state-lens.html', 'state-lens-good.html']:
            page = (ROOT / 'docs' / name).read_text()
            banner = page.split('<section class="trial">', 1)[1].split('</section>', 1)[0]
            self.assertIn('Current download: ' + VERSION, banner)
            for filename in [MODULE, MODULE + '.sha256', DECLARATIONS]:
                self.assertIn(f'href="{filename}"', banner)
                self.assertTrue((ROOT / 'docs' / filename).is_file())
            self.assertIn(f'href="{ARCHIVE}"', banner)
            self.assertIn('blob/main/docs/state-lens-manual.md', banner)
            recording = json.loads(page.split('<script type="application/json" id="data">', 1)[1].split('</script>', 1)[0])
            self.assertEqual(recording['libraryVersion'], '0.4.0-experimental.1')
            self.assertEqual(recording['schema'], 3)

    def test_conflicting_immutable_file_is_not_overwritten(self):
        conflict = b'Previous independently reviewed content; retain it.'
        (self.out / MODULE).write_bytes(conflict)
        result = self.run_replay()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing to replace immutable asset', result.stderr)
        self.assertEqual((self.out / MODULE).read_bytes(), conflict)
        self.assertFalse((self.out / 'state-lens.html').exists())
        self.assertFalse((self.out / (ARCHIVE + '.sha256')).exists())

    def test_tgz_source_mismatch_stops_before_output(self):
        with tarfile.open(self.out / ARCHIVE, 'w:gz') as bundle:
            for name in ['package.json', 'lens.mjs', 'LICENSE']:
                payload = (SOURCE / name).read_bytes()
                if name == 'lens.mjs':
                    payload += b'\n// A different implementation under the same version.\n'
                entry = tarfile.TarInfo('package/' + name)
                entry.size = len(payload)
                bundle.addfile(entry, io.BytesIO(payload))
        result = self.run_replay()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing package/source mismatch', result.stderr)
        self.assertFalse((self.out / MODULE).exists())
        self.assertFalse((self.out / 'state-lens.html').exists())

    def test_repeat_generation_keeps_all_bytes_identical(self):
        first = self.run_replay()
        self.assertEqual(first.returncode, 0, first.stderr)
        before = {p.name: p.read_bytes() for p in self.out.iterdir()}
        second = self.run_replay()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual({p.name: p.read_bytes() for p in self.out.iterdir()}, before)

    def test_manual_entry_package_mismatch_stops_before_output(self):
        archive = self.out / ARCHIVE
        with tarfile.open(archive) as source:
            entries = [(entry, source.extractfile(entry).read()) for entry in source.getmembers() if entry.isfile()]
        with tarfile.open(archive, 'w:gz') as target:
            for entry, payload in entries:
                if entry.name == 'package/capture.mjs':
                    payload += b'\n// Mismatching manual entry.\n'
                entry.size = len(payload)
                target.addfile(entry, io.BytesIO(payload))
        result = self.run_replay()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing package/source mismatch: capture.mjs', result.stderr)
        self.assertFalse((self.out / MODULE).exists())
        self.assertFalse((self.out / 'state-lens.html').exists())

    def test_pages_only_needs_no_site_packages(self):
        result = subprocess.run([sys.executable, '-S', *self.command[1:]],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.out / MODULE).exists())

    def test_python_download_matches_the_common_generated_module(self):
        result = self.run_replay()
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = (SOURCE / 'python/state_lens.py').read_bytes()
        self.assertEqual((self.out / PYTHON_MODULE).read_bytes(), expected)
        digest = hashlib.sha256(expected).hexdigest()
        self.assertEqual((self.out / (PYTHON_MODULE + '.sha256')).read_text(),
                         digest + '  ' + PYTHON_MODULE + '\n')
        for name in ['state-lens.html', 'state-lens-good.html']:
            page = (self.out / name).read_text()
            self.assertIn('href="' + PYTHON_MODULE + '"', page)
            self.assertIn('href="state-lens-python.md"', page)

    def test_conflicting_python_download_is_not_overwritten(self):
        original = b'Previously retained Python module'
        (self.out / PYTHON_MODULE).write_bytes(original)
        result = self.run_replay()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing to replace immutable asset', result.stderr)
        self.assertEqual((self.out / PYTHON_MODULE).read_bytes(), original)
        self.assertFalse((self.out / MODULE).exists())
        self.assertFalse((self.out / 'state-lens.html').exists())

    def test_python_package_mismatch_stops_before_output(self):
        archive = self.out / ARCHIVE
        with tarfile.open(archive) as source:
            entries = [(entry, source.extractfile(entry).read())
                       for entry in source.getmembers() if entry.isfile()]
        with tarfile.open(archive, 'w:gz') as target:
            for entry, payload in entries:
                if entry.name == 'package/python/state_lens.py':
                    payload += b'\n# An altered Python implementation.\n'
                entry.size = len(payload)
                target.addfile(entry, io.BytesIO(payload))
        result = self.run_replay()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing package/source mismatch: python/state_lens.py', result.stderr)
        self.assertFalse((self.out / PYTHON_MODULE).exists())
        self.assertFalse((self.out / MODULE).exists())

    def test_package_version_alone_cannot_relabel_the_library(self):
        copied_root = self.root / 'source-copy'
        copied_source = copied_root / 'tools/playwright-state-lens'
        copied_source.mkdir(parents=True)
        for name in ['package.json', 'lens.mjs']:
            shutil.copyfile(SOURCE / name, copied_source / name)
        metadata = json.loads((copied_source / 'package.json').read_text())
        metadata['version'] = '9.9.9-experimental.1'
        (copied_source / 'package.json').write_text(json.dumps(metadata))
        script = copied_root / 'experiments/state-lens/prepare_replay.py'
        script.parent.mkdir(parents=True)
        shutil.copyfile(SCRIPT, script)
        command = self.command.copy()
        command[1] = str(script)
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing library-report/package version mismatch', result.stderr)
        self.assertFalse((self.out / MODULE).exists())
        self.assertFalse((self.out / 'state-lens.html').exists())


if __name__ == '__main__':
    unittest.main()
