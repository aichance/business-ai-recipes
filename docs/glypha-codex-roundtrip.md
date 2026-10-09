# Glypha: reproduce an accepted → rejected → corrected publication

An independent, small Codex trial of [Glypha by Kunihisa Matsuda](https://github.com/kuny/glypha). This page contains the synthetic input and HTTP checks from our [public test report](https://qiita.com/atelier-kame/items/b0c6262a46be8ef416e1#comment-ec0fabed6fddbaa9673c), so someone else can repeat it. Glypha itself was not modified.

**Original HTTP/browser trial on 2026-10-09:** commit `05183171e567ad285d718f08b6ff64620fb9c0c2`, macOS arm64, Go 1.26.5, Node 24.19.0, Python 3.12.14, and the Codex in-app browser. The HTTP example requires Python 3.11+ and runs without calling an AI API. The later recording kit's environment is listed in its section below. aichance is operated with AI under human oversight.

## What this checks

| Step | Expected result |
| --- | --- |
| Publish a Japanese event notice | `200`, room A / 14:00 |
| Move the first text box outside the canvas | `422`, issue `invalid_rectangle` |
| Read after rejection | Previous response body, generation and ETag retained; conditional GET `304` |
| Publish a valid correction | `200`, new generation and ETag, room B / 14:30 |

The original browser trial also retained identical 1280×720 pixels after rejection and updated to room B without reloading. **The commands below verify HTTP behavior.** Rendering must be checked separately in the browser. This covers one static scene with `daily: []`, not daily scheduling, long-running appliances, crash recovery or other browsers.

## 1. Start a disposable local Glypha instance

With Go 1.26+ and Node 24 available, choose a workspace directory and create a separate checkout. The destination `glypha-roundtrip` must not already exist:

```sh
git clone --no-checkout https://github.com/kuny/glypha.git glypha-roundtrip && \
cd glypha-roundtrip && \
git checkout --detach 05183171e567ad285d718f08b6ff64620fb9c0c2
```

Once checkout succeeds, build the renderer and server from that **Glypha directory**:

```sh
git rev-parse HEAD
# Confirm: 05183171e567ad285d718f08b6ff64620fb9c0c2
(cd renderer && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
go build -o ./glypha-trial ./cmd/glypha
```

Start it in the foreground with a fresh temporary database. Port 4384 must be free; if startup reports that it is occupied, stop here rather than sending the trial to another running instance.

```sh
glypha_trial_dir=$(mktemp -d)
GLYPHA_ADDR=127.0.0.1:4384 \
GLYPHA_DB_PATH="$glypha_trial_dir/glypha.db" \
./glypha-trial
```

Leave this terminal open. Visit `http://127.0.0.1:4384/` if you want to inspect the renderer. Do not point the trial at an installation containing real signage: `PUT /content` replaces the whole current package. The script refuses to start unless the initial display is empty (`204`).

## 2. Run the input and HTTP checks

In a second terminal, run this block with Python 3.11+. Only the local instance on `127.0.0.1:4384` is contacted. It uses Python's standard library and synthetic event details, with no pip packages or credentials.

```sh
python3 - <<'PY'
import copy
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = "http://127.0.0.1:4384"

def request(path, *, method="GET", data=None, headers=None):
    req = Request(BASE + path, data=data, headers=headers or {}, method=method)
    try:
        response = urlopen(req, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

def upload(document):
    boundary = "glypha-synthetic-roundtrip-20261009"
    body = (
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="content"; filename="content.json"\r\n'
        'Content-Type: application/json\r\n\r\n'
    ).encode() + json.dumps(document, ensure_ascii=False).encode() + (
        f'\r\n--{boundary}--\r\n'
    ).encode()
    return request("/content", method="PUT", data=body,
                   headers={"Content-Type": "multipart/form-data; boundary=" + boundary})

def text(value, y, size):
    return {"type": "text", "x": 120, "y": y, "width": 1680, "height": 180,
            "text": value, "fontSize": size, "color": "#FFFFFF", "align": "left"}

document = {
    "format": 1,
    "canvas": {"width": 1920, "height": 1080},
    "schedule": {"utcOffset": "+09:00", "defaultScene": "event", "daily": []},
    "scenes": {"event": {
        "background": {"color": "#183848"},
        "elements": [
            text("AI活用ハンズオン", 100, 96),
            text("会場 A / 14:00 開始", 380, 80),
            text("これは合成データを使った検証画面です。", 700, 48),
        ],
    }},
}

assert request("/healthz")[0] == 200
if request("/display")[0] != 204:
    raise SystemExit("Refusing to overwrite a non-empty instance. Start a fresh trial DB.")

assert upload(document)[0] == 200
status, before_headers, before = request("/display")
assert status == 200
before_json = json.loads(before)
assert before_json["ast"]["elements"][1]["text"] == "会場 A / 14:00 開始"
print("accepted: 200, room A / 14:00")

invalid = copy.deepcopy(document)
invalid["scenes"]["event"]["elements"][0]["x"] = 1900
status, _, error_body = upload(invalid)
assert status == 422
issues = json.loads(error_body)["error"]["issues"]
assert any(i["code"] == "invalid_rectangle" and
           i["path"] == "/scenes/event/elements/0" for i in issues)
status, after_headers, after = request("/display")
assert status == 200 and after == before
assert after_headers["ETag"] == before_headers["ETag"]
assert json.loads(after)["generation"] == before_json["generation"]
assert request("/display", headers={"If-None-Match": before_headers["ETag"]})[0] == 304
print("rejected: 422; body, generation and ETag retained; conditional GET: 304")

corrected = copy.deepcopy(document)
corrected["scenes"]["event"]["background"]["color"] = "#184830"
corrected["scenes"]["event"]["elements"][1]["text"] = "会場 B / 14:30 開始"
assert upload(corrected)[0] == 200
status, corrected_headers, corrected_body = request("/display")
assert status == 200
corrected_json = json.loads(corrected_body)
assert corrected_json["generation"] != before_json["generation"]
assert corrected_headers["ETag"] != before_headers["ETag"]
assert corrected_json["ast"]["elements"][1]["text"] == "会場 B / 14:30 開始"
print("corrected: 200, new generation and ETag, room B / 14:30")
PY
```

Expected output:

```text
accepted: 200, room A / 14:00
rejected: 422; body, generation and ETag retained; conditional GET: 304
corrected: 200, new generation and ETag, room B / 14:30
```

The three publication steps run quickly, so a browser may only display the final scene. To repeat the original visual check, run the Python sections interactively and pause after the `accepted` and `rejected` messages. Compare the display before sending the correction. Do not infer pixel identity from the HTTP script alone.

Stop the foreground server with **Ctrl+C** when finished. A second execution against the same database intentionally refuses to run; use a fresh temporary database for another trial.

## Record the same workflow

[Download the replay kit](https://github.com/aichance/business-ai-recipes/releases/tag/glypha-replay-2026-10-09) · [Watch/download the 27-second MP4](https://github.com/aichance/business-ai-recipes/releases/download/glypha-replay-2026-10-09/glypha-replay.mp4)

![Actual Glypha responses: room A, rejected update retaining room A, then room B](https://github.com/aichance/business-ai-recipes/releases/download/glypha-replay-2026-10-09/glypha-replay.gif)

The release's **`glypha-replay-kit.zip`** contains a local recording panel, all three synthetic inputs, `operation.json`, setup/replay instructions and MIT license. Build Glypha as above, start it with a fresh empty database, then follow the kit README **instead of running the HTTP input script**. The kit's buttons send the actual HTTP requests, and Demo Forge can operate those buttons and check the final UI while recording. Python 3.11+ is required for the panel; automatic recording also needs Playwright/Chromium and FFmpeg/ffprobe. Dependencies are not bundled.

The replay was verified from a separate extracted directory on macOS, using an unchanged Glypha build and the recorder at `ca0cc84d7b5e07adc25bc439bf902ce9bb2e9805`, with panel Python 3.12.4, recorder Python 3.11.15 and Playwright 1.63.0/Chromium. The final video is 1280×720 / 27.32 seconds; the GIF is a 3 fps derivative. Four-second holds are for readability, not timing measurements. HTTP evidence and in-page canvas measurements are saved separately; browser measurements are self-reports, not independent attestation. The kit README explains how to stop and repeat safely with fresh state after any failure.

## Original browser evidence

After rejecting the out-of-bounds text box, the previous event notice remained:

![Room A still displayed after the invalid upload was rejected](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/4512930/e83ed141-4fa6-453d-87da-6b2e11852c09.png)

The valid correction updated the same open page:

![Room B displayed after the correction was accepted](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/4512930/a428e566-9959-47cc-af4b-7b49dc6f5d4b.png)

Glypha's implementation and design belong to its upstream author. These are independent test inputs and observations; they are not a claim of complete validation or endorsement.
