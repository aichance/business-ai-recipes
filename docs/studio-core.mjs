export function validateStory(value, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error('Choose a video between 0 and 120 seconds.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Story must be a JSON object.');
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label || Array.from(label).length > 48) throw new Error('Label must contain 1–48 characters.');
  if (!Array.isArray(value.cues) || value.cues.length < 1 || value.cues.length > 8) throw new Error('Use 1–8 explanations.');
  let previousFrame = -1;
  const cues = value.cues.map((cue, index) => {
    if (!cue || typeof cue !== 'object' || typeof cue.at !== 'number' || !Number.isFinite(cue.at)) throw new Error(`Explanation ${index + 1}: enter a numeric time.`);
    const text = typeof cue.text === 'string' ? cue.text.trim() : '';
    if (!text || Array.from(text).length > 90) throw new Error(`Explanation ${index + 1}: use 1–90 characters.`);
    const frame = Math.round(cue.at * 25);
    if (cue.at < 0 || cue.at >= duration || frame / 25 >= duration) throw new Error(`Explanation ${index + 1}: time must be within the video.`);
    if (index === 0 && cue.at !== 0) throw new Error('The first explanation must start at 0 seconds.');
    if (frame <= previousFrame) throw new Error('Explanation times must increase, at least one 25 fps frame apart.');
    previousFrame = frame;
    return { at: frame / 25, text };
  });
  return { label, cues };
}

export function cueAt(cues, seconds) {
  let index = 0;
  for (let i = 1; i < cues.length && cues[i].at <= seconds; i++) index = i;
  return index;
}

export function fitFrame(width, height, boxWidth = 1280, boxHeight = 576) {
  if (!(width > 0 && height > 0)) throw new Error('Invalid video dimensions.');
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale, x: (boxWidth - width * scale) / 2, y: 144 + (boxHeight - height * scale) / 2 };
}
