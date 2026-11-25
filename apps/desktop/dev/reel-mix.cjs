// Reel sound (25 Nov): the music under the picture plus CC0 sound effects on the transitions (Freesound, via
// Openverse). `mix(picture, music, sfxDir, out, cues, end)` writes `out` with the picture copied and one AAC track:
// the music faded out over the last 1.2 s, each cue [seconds, file, gain dB] laid on top.
'use strict';
const path = require('node:path'), fs = require('node:fs'), { execFileSync } = require('node:child_process');

/** The v7 cues, on the cut sheet (seconds): a whoosh per transition, risers into the bridge and the end card, glitch ticks on studio clicks. */
const V7_CUES = [
  [4.7, 'riser-1.mp3', -15], [15.7, 'swoosh-2.mp3', -11], [21.68, 'whoosh-0.mp3', -9], [25.33, 'whoosh-1.mp3', -12],
  [28.93, 'whoosh-3.mp3', -12], [32.33, 'swoosh-1.mp3', -9], [34.72, 'swoosh-0.mp3', -10], [36.7, 'whoosh-0.mp3', -9],
  [39.54, 'whoosh-1.mp3', -12], [41.34, 'whoosh-3.mp3', -12], [44.6, 'swoosh-2.mp3', -11],
  [45.72, 'glitch-0.mp3', -16], [46.52, 'glitch-1.mp3', -16], [48.12, 'glitch-0.mp3', -16], [49.02, 'glitch-1.mp3', -16],
  [50.62, 'glitch-0.mp3', -16], [51.22, 'glitch-1.mp3', -16], [52.32, 'glitch-0.mp3', -16], [52.82, 'glitch-1.mp3', -16],
  [53.33, 'swoosh-1.mp3', -9], [54.8, 'riser-0.mp3', -16],
];

function mix(picture, music, sfxDir, out, cues = V7_CUES, end = 60) {
  const usable = sfxDir ? cues.filter(([, f]) => fs.existsSync(path.join(sfxDir, f))) : [];
  const args = ['-y', '-loglevel', 'error', '-i', picture, '-i', music];
  for (const [, f] of usable) args.push('-i', path.join(sfxDir, f));
  const parts = [`[1:a]atrim=0:${end},afade=t=out:st=${end - 1.2}:d=1.2,volume=-1.5dB[m]`];
  usable.forEach(([t, , db], k) => parts.push(`[${k + 2}:a]volume=${db}dB,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[s${k}]`));
  parts.push(`[m]${usable.map((_, k) => `[s${k}]`).join('')}amix=inputs=${usable.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  execFileSync('ffmpeg', [...args, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(end), out]);
  return usable.length;
}

module.exports = { mix, V7_CUES };
