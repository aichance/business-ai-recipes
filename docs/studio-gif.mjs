// gifenc 1.0.3 is vendored from the verified npm tarball, not loaded from a CDN.
// See gifenc.LICENSE.txt. Quantization is lossy; exports are always opaque/silent.
export function gifPlan(start, end, duration) {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0 || duration > 120 || start < 0 || end > duration || end <= start) {
    throw new Error('GIF range must be within the recording, with end after start.');
  }
  const span = end - start;
  if (span < 0.1 - 1e-8 || span > 15 + 1e-8) throw new Error('Select a GIF range from 0.1 to 15 seconds.');
  const count = Math.ceil((span - 1e-8) * 10);
  return {width:640, height:360, delay:100, times:Array.from({length:count}, (_, i) => start + i / 10)};
}

export async function encodeGif({start, end, duration, renderFrame, signal, onProgress = () => {}, maxBytes = 15 * 1024 * 1024}) {
  const plan = gifPlan(start, end, duration);
  const check = () => { if (signal?.aborted) throw new DOMException('GIF export canceled. No new GIF was saved.', 'AbortError'); };
  check();
  const {GIFEncoder, quantize, applyPalette} = await import('./gifenc.mjs');
  check();
  const encoder = GIFEncoder();
  for (let i = 0; i < plan.times.length; i++) {
    check();
    let rgba = await renderFrame(plan.times[i], plan, signal);
    check();
    if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== plan.width * plan.height * 4) throw new Error('The GIF frame could not be captured.');
    // gifenc reads the entire backing buffer; sliced views must be copied first.
    if (rgba.byteOffset !== 0 || rgba.byteLength !== rgba.buffer.byteLength) rgba = rgba.slice();
    const palette = quantize(rgba, 256);
    encoder.writeFrame(applyPalette(rgba, palette), plan.width, plan.height, {palette, delay:plan.delay});
    if (encoder.bytesView().length + 1 > maxBytes) throw new Error('GIF exceeds 15 MB. Select a shorter range and try again.');
    onProgress(i + 1, plan.times.length);
    // Give the UI a chance to repaint and deliver Cancel between bounded frames.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  check();
  encoder.finish();
  return new Blob([encoder.bytes()], {type:'image/gif'});
}
