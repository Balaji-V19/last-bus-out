// Shrink the character GLBs by storing skin weights as normalised bytes.
//
// WEIGHTS_0 ships as float32 VEC4 — sixteen bytes per vertex to describe four
// values that are all between 0 and 1 and sum to 1. glTF core explicitly allows
// unsigned byte normalised for this attribute, which is four bytes, and the
// eleven and a half megabytes of character data is the reason zombies took so
// long to appear on a cold cache.
//
// Weights are renormalised so each vertex still sums to exactly 255/255, which
// matters because the gait validator asserts on combined hand-weight totals.
//
// Usage: node scripts/compact-character-glb.mjs [--check]

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const MODELS = ["hero", "maya", "infected"];
const checkOnly = process.argv.includes("--check");

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a glb");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString("utf8"));
    if (type === BIN_CHUNK) bin = Buffer.from(body);
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  return { json, bin };
}

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

function writeGlb(path, json, bin) {
  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(jsonText.length), 0x20);
  const binPad = Buffer.alloc(pad4(bin.length), 0);
  const jsonLength = jsonText.length + jsonPad.length;
  const binLength = bin.length + binPad.length;
  const total = 12 + 8 + jsonLength + 8 + binLength;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonLength, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binLength, 0);
  binHeader.writeUInt32LE(BIN_CHUNK, 4);

  writeFileSync(
    path,
    Buffer.concat([header, jsonHeader, jsonText, jsonPad, binHeader, bin, binPad]),
  );
}

let totalBefore = 0;
let totalAfter = 0;

for (const name of MODELS) {
  const path = `public/models/characters/${name}.glb`;
  const backup = `${path}.orig`;
  const before = readFileSync(path).length;
  totalBefore += before;

  const { json, bin } = readGlb(path);

  // Which bufferViews hold float skin weights.
  const weightViews = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.attributes?.WEIGHTS_0;
      if (index === undefined) continue;
      const accessor = json.accessors[index];
      if (accessor.componentType !== 5126) continue;
      weightViews.set(accessor.bufferView, index);
    }
  }

  if (weightViews.size === 0) {
    console.log(`${name}: already compact, skipped`);
    totalAfter += before;
    continue;
  }
  if (checkOnly) {
    console.log(`${name}: ${weightViews.size} float weight view(s) could be packed`);
    totalAfter += before;
    continue;
  }
  if (!existsSync(backup)) copyFileSync(path, backup);

  // Nothing here is interleaved and no view is shared between accessors, so the
  // buffer can be rebuilt view by view. Simply appending the packed data
  // without doing this leaves the original floats orphaned in the file, which
  // makes it larger rather than smaller.
  const blocks = [];
  let cursor = 0;
  for (let index = 0; index < json.bufferViews.length; index += 1) {
    const view = json.bufferViews[index];
    const from = view.byteOffset ?? 0;
    let data;

    if (weightViews.has(index)) {
      const accessor = json.accessors[weightViews.get(index)];
      const count = accessor.count;
      data = Buffer.alloc(count * 4);
      for (let vertex = 0; vertex < count; vertex += 1) {
        const at = from + (accessor.byteOffset ?? 0) + vertex * 16;
        const raw = [
          bin.readFloatLE(at),
          bin.readFloatLE(at + 4),
          bin.readFloatLE(at + 8),
          bin.readFloatLE(at + 12),
        ];
        const sum = raw[0] + raw[1] + raw[2] + raw[3];
        // Largest-remainder rounding, so the four bytes total exactly 255. A
        // vertex that summed to less than 1 would show as a collapsing limb,
        // and the gait validator asserts on combined hand-weight totals.
        const scaled = raw.map((value) => (sum > 0 ? (value / sum) * 255 : 0));
        const packed = scaled.map((value) => Math.floor(value));
        let remainder = 255 - packed.reduce((a, b) => a + b, 0);
        const order = scaled
          .map((value, i) => ({ i, frac: value - Math.floor(value) }))
          .sort((a, b) => b.frac - a.frac);
        for (let k = 0; remainder > 0 && k < 4; k += 1, remainder -= 1) {
          packed[order[k].i] += 1;
        }
        if (remainder > 0) packed[order[0].i] += remainder;
        for (let c = 0; c < 4; c += 1) data[vertex * 4 + c] = packed[c];
      }
      accessor.componentType = 5121;
      accessor.normalized = true;
      accessor.byteOffset = 0;
    } else {
      data = bin.subarray(from, from + view.byteLength);
    }

    const padding = pad4(cursor);
    if (padding) {
      blocks.push(Buffer.alloc(padding, 0));
      cursor += padding;
    }
    view.byteOffset = cursor;
    view.byteLength = data.length;
    blocks.push(data);
    cursor += data.length;
  }

  const newBin = Buffer.concat(blocks);
  json.buffers[0].byteLength = newBin.length;
  writeGlb(path, json, newBin);

  const after = readFileSync(path).length;
  totalAfter += after;
  console.log(
    `${name}: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB` +
      `  (${(((before - after) / before) * 100).toFixed(0)}% smaller)`,
  );
}

console.log(
  `\ntotal ${(totalBefore / 1e6).toFixed(2)} MB -> ${(totalAfter / 1e6).toFixed(2)} MB`,
);
if (!checkOnly) {
  console.log("Originals kept alongside as *.glb.orig — run validate:characters before committing.");
}
