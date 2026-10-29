"""Package a replay of the real synthetic demo observations. No app/model calls."""

import argparse
import base64
import hashlib
import html
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--preview', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial.ttf')
    parser.add_argument('--pages-only', action='store_true')
    args = parser.parse_args()
    if not args.pages_only:
        from PIL import Image, ImageDraw, ImageFont

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).resolve().parents[2] / 'tools' / 'playwright-state-lens'
    version = json.loads((source / 'package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version):
        raise SystemExit('Refusing an invalid package version')
    reported = re.search(r"^const LIBRARY_VERSION = '([^']+)';$", (source / 'lens.mjs').read_text(), re.MULTILINE)
    if not reported or reported.group(1) != version:
        raise SystemExit('Refusing library-report/package version mismatch')
    name = f'aichance-playwright-state-lens-{version}.tgz'
    archive = out / name
    with tarfile.open(archive) as bundle:
        for filename in ['package.json', 'lens.mjs', 'LICENSE']:
            member = bundle.getmember('package/' + filename)
            if not member.isfile() or bundle.extractfile(member).read() != (source / filename).read_bytes():
                raise SystemExit(f'Refusing package/source mismatch: {filename}')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    standalone = f'state-lens-v{version}.mjs'
    license_bytes = (source / 'LICENSE').read_bytes().rstrip()
    assert b'*/' not in license_bytes
    module = b'/*\n' + license_bytes + b'\n*/\n' + (source / 'lens.mjs').read_bytes()
    recordings = ['state-lens-recorded-v0.1.0-experimental.1.html', 'state-lens-good-recorded-v0.1.0-experimental.1.html']
    immutable = {
        name + '.sha256': f'{digest}  {name}\n'.encode(),
        standalone: module,
        standalone + '.sha256': (hashlib.sha256(module).hexdigest() + '  ' + standalone + '\n').encode(),
        **{filename: (source.parents[1] / 'docs' / filename).read_bytes() for filename in recordings},
    }
    # Check all conflicts before writing; never put current code under an older version name.
    for filename, content in immutable.items():
        path = out / filename
        if path.exists() and path.read_bytes() != content:
            raise SystemExit(f'Refusing to replace immutable asset: {filename}')
    for filename, content in immutable.items():
        path = out / filename
        if not path.exists():
            with path.open('xb') as output:
                output.write(content)
    comparison = json.loads((args.input / 'comparison.json').read_text())
    assert len(comparison['outcomes']) == 2
    assert all(x['valuesAgree'] and x['standardAlsoContainsData'] for x in comparison['outcomes'])
    (out / 'state-lens-measurements.json').write_text(json.dumps(comparison, indent=2) + '\n')
    command = "import { createStateLens } from './" + standalone + "';"
    banner = '''<section class="trial"><strong>STATE LENS · EXPERIMENTAL</strong>
<p>Recorded save/reload observations from an authored synthetic app. Choose a checkpoint below. This page does not run against your app.</p>
<p>Current download: ''' + html.escape(version) + '''. The recorded observations below are separate from the download version. Preserved earlier recording: <a href="''' + recordings[0] + '''">broken</a> / <a href="''' + recordings[1] + '''">normal</a>.</p>
<p><a href="#start">Add to your Playwright test</a> · <a href="state-lens.html">Broken control</a> · <a href="state-lens-good.html">Normal control</a> · <a href="https://github.com/aichance/business-ai-recipes/tree/main/tools/playwright-state-lens">Source</a></p>
<details><summary>Use it in your own app</summary><p id="start">Already use Playwright with Node22+? <a href="''' + standalone + '''" download>Download the one-file library</a> (<a href="''' + standalone + '''.sha256">SHA256</a>). Place it next to your test without replacing an existing copy, then import:</p><pre>''' + html.escape(command) + '''</pre>
<p>Import createStateLens, select a known storage key and wrap your existing UI actions with lens.step. Keep your normal assertions. Attach the local HTML in finally.</p>
<p><a href="https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-install.md">Copy the integration and full example</a> · <a href="https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-results.md">Measurements and limits</a> · <a href="https://github.com/aichance/business-ai-recipes/issues/new?title=%5BState%20Lens%5D%20Own-app%20trial">Report a trial or blocker</a></p>
<p>For these recorded localStorage/IndexedDB examples, standard snapshots already contain the data. sessionStorage can be read explicitly with page.evaluate; <a href="https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-session-storage.md">observe a selected tab value</a>. This helper adds selected per-step differences and screenshots in one HTML. Reports contain selected app data and stay local unless shared.</p></details></section>'''
    style = '.trial{border:1px solid #354d61;background:#142432;padding:18px;border-radius:12px;margin-bottom:24px}.trial a{color:#b3f16d}.trial summary{cursor:pointer;font-weight:650}.trial p{line-height:1.6}.trial pre{font-size:13px}a{overflow-wrap:anywhere}'
    for mode, target in [('reload-loss', 'state-lens.html'), ('good', 'state-lens-good.html')]:
        content = (args.input / (mode + '-state-lens.html')).read_text()
        assert '<main>' in content and 'if(r.checkpoints.length)select(0);' in content
        content = content.replace('</style>', style + '</style>', 1)
        content = content.replace('<main>', '<main>' + banner, 1)
        content = content.replace('if(r.checkpoints.length)select(0);', 'if(r.checkpoints.length)select(r.checkpoints.length-1);', 1)
        (out / target).write_text(content)
    shutil.copyfile(args.preview, out / 'state-lens-preview.png')
    if args.pages_only:
        print(json.dumps({'package_unchanged_sha256': digest, 'standalone_sha256': hashlib.sha256(module).hexdigest(), 'mode': 'pages-only'}))
        return

    broken = json.loads((args.input / 'reload-loss-state-lens.json').read_text())['checkpoints']
    normal = json.loads((args.input / 'good-state-lens.json').read_text())['checkpoints']
    shots = [
        (broken[1], 4, '1. The UI said Saved', 'Selected draft\nbody: Keep this\nlaunch draft\nrevision: 1'),
        (broken[2], 4, '2. The test reloads', 'Same selected\nrecord before reload\nbody retained\nrevision: 1'),
        (broken[3], 5, '3. Reload changed the stored draft', 'Both selected stores\nbody: empty string\nrevision: 1 -> 2\nUI action completed'),
        (normal[3], 4, '4. Normal control: the draft survives', 'Same workflow\nbody retained\nrevision: 1\nNo field difference'),
        (None, 5, '5. Open the per-step field differences', 'Selected values\n+ existing UI steps\n+ screenshots\nOne local HTML'),
        (None, 4, 'Try it in your own Playwright test', 'One package import\nWrap existing steps\nKeep your assertions\nNo account / API key'),
    ]
    font = args.font
    if not Path(font).exists():
        raise SystemExit('Choose an installed font path before generating the optional video')
    with tempfile.TemporaryDirectory(prefix='state-lens-replay-') as temp:
        temp = Path(temp)
        clips = []
        for i, (checkpoint, seconds, heading, side) in enumerate(shots):
            picture = temp / f'{i}.png'
            source = base64.b64decode(checkpoint['screenshot']) if checkpoint else args.preview.read_bytes()
            image = Image.open(io.BytesIO(source)).convert('RGB')
            image.thumbnail((820, 560), Image.Resampling.LANCZOS)
            frame = Image.new('RGB', (1280, 720), '#0e1720')
            frame.paste(image, (20, 110))
            draw = ImageDraw.Draw(frame)
            texts = [heading, 'Measured replay of an authored synthetic app | standard snapshots contain the same data', side, 'aichance.github.io/business-ai-recipes/state-lens.html']
            for text, size, x, y in zip(texts, [31, 17, 23, 20], [24, 24, 850, 24], [20, 66, 165, 685]):
                draw.multiline_text((x, y), text, font=ImageFont.truetype(font, size), fill='white', spacing=12)
            frame.save(picture)
            clip = temp / f'{i}.mp4'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '24', '-i', str(picture), '-t', str(seconds), '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', str(clip)], check=True)
            clips.append(clip)
        manifest = temp / 'clips.txt'
        manifest.write_text(''.join(f"file '{p}'\n" for p in clips))
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(manifest), '-c', 'copy', '-movflags', '+faststart', str(out / 'state-lens-demo.mp4')], check=True)
    print(json.dumps({'package': name, 'sha256': digest, 'replay_seconds': 26, 'cases': len(comparison['outcomes'])}))


if __name__ == '__main__':
    main()
