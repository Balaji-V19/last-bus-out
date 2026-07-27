// Turn raw sound downloads into game-ready one-shots.
//
// Trims leading/trailing silence, downmixes to mono, resamples to 32 kHz,
// loudness-matches to the rest of the game's audio and encodes to Ogg Vorbis.
// Input files are named after the slot they fill, e.g. axe-swing-a.wav, and
// land in public/audio/<group>/ based on the name prefix.
//
// Usage: npm run audio:prepare -- <folder> [--group weapons]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

const args = process.argv.slice(2);
const folder = args.find((value) => !value.startsWith("--"));
const groupFlag = args.indexOf("--group");
const group = groupFlag >= 0 ? args[groupFlag + 1] : "weapons";

if (!folder) {
  console.error("usage: npm run audio:prepare -- <folder> [--group weapons]");
  process.exit(1);
}
if (!existsSync(folder)) {
  console.error(`no such folder: ${folder}`);
  process.exit(1);
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg is required and was not found on PATH.");
  process.exit(1);
}

const outDir = join("public", "audio", group);
mkdirSync(outDir, { recursive: true });

const inputs = readdirSync(folder).filter((name) =>
  [".wav", ".mp3", ".ogg", ".flac", ".aiff", ".aif"].includes(
    extname(name).toLowerCase(),
  ),
);

if (inputs.length === 0) {
  console.error(`no audio files found in ${folder}`);
  process.exit(1);
}

let failed = 0;
for (const input of inputs) {
  const stem = basename(input, extname(input));
  const target = join(outDir, `${stem}.ogg`);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-v", "error", "-y",
        "-i", join(folder, input),
        "-ac", "1",
        "-ar", "32000",
        "-af",
        // Trim silence at both ends, then match the loudness of the existing
        // creature one-shots so nothing jumps out of the mix.
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02," +
          "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse," +
          "loudnorm=I=-16:TP=-1.5:LRA=11," +
          "afade=t=in:st=0:d=0.008",
        "-c:a", "libvorbis",
        "-q:a", "2",
        target,
      ],
      { stdio: "pipe" },
    );
    console.log(`ok    ${input} -> ${target}`);
  } catch (error) {
    failed += 1;
    const detail = error instanceof Error ? error.message.split("\n")[0] : error;
    console.error(`FAIL  ${input}: ${detail}`);
  }
}

console.log(
  `\n${inputs.length - failed}/${inputs.length} prepared into ${outDir}.`,
);
console.log(
  "Record creator, source URL, licence and licence URL for each in " +
    "public/models/THIRD_PARTY.md before shipping.",
);
process.exit(failed ? 1 : 0);
