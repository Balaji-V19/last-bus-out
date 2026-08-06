# Blackout at St. Orison implementation and 3D model guide

This file is the detailed build contract for developers and coding agents. The
short repository-wide rules are in `AGENTS.md`; product and setup information
is in `README.md`.

## 1. Game architecture

The runtime is split deliberately:

- `LastBusOutGame.tsx` owns durable campaign state and UI.
- `GameViewport3D.tsx` owns live Three.js simulation.
- `scene.ts` owns environments, props, collisions, bounds, and interaction
  placement.
- `animatedCharacter.ts` owns GLB loading, skeleton cloning, animation-state
  changes, equipment attachment, character LOD, and disposal.
- `audio.ts` owns local music and synthesized sound effects.

Do not move per-frame simulation into React. Pass narrow callbacks from the
viewport to campaign state and throttle continuously reported values.

### Adding an objective

1. Add visible objective copy to the correct floor in `OBJECTIVES`.
2. Place a believable prop with a unique interaction ID in `scene.ts`.
3. Add its availability rule to `isInteractionAvailable`.
4. Handle the ID and state transition in `handleInteraction`.
5. Add or update encounter activation and completion rules.
6. Verify the next objective cannot be skipped or permanently blocked.
7. Verify saving, refreshing, and continuing at every changed step.

### Adding a hospital floor

Every floor needs:

- A clear floor/department identity and navigational signs.
- Ground, ceiling, walls, room boundaries, appropriate clinical/service props,
  collisions, start point, and movement bounds.
- A logical connection to an elevator or stairwell used on adjacent floors.
- At least one non-combat purpose: rescue, repair, collection, investigation,
  escort, or safe-room support.
- A controlled lighting palette and a blackout plan that still allows the
  flashlight to matter.
- Encounters that fit the room width and never spawn outside bounds.

## 2. Character source policy

New characters must be:

- Modeled originally for this project; or
- Derived from a source whose license explicitly permits the intended use and
  modification.

Changing a copyrighted character's face, clothes, proportions, or textures
does not make it copyright-free. Never use that approach. Add complete
provenance to `public/models/THIRD_PARTY.md` before the model is accepted.

The current anatomical bases are derived from Blender Studio Human Base Meshes
under CC0. The skeleton/motion source is Mesh2Motion under CC0. The shipped GLBs
include substantial local work and embedded gameplay clips.

## 3. Character design requirements

Create a front, back, left, and right reference before modeling. Define:

- Height, shoulder/hip relationship, limb lengths, hand and foot size.
- Hair silhouette from every view.
- Clothing layers and how they bend at shoulders, elbows, hips, and knees.
- Equipment attachment points and straps.
- Damage, infection, or mutation features that do not obscure joint motion.

The player and allies must read as living humans before clothing or equipment
is added. Zombies should begin with credible human anatomy; infection changes
posture, tissue, gait, and asymmetry instead of replacing the body with boxes
or spheres.

### Anatomy checklist

- Head, rib cage, pelvis, knees, and feet face the same forward direction.
- Clavicles connect the shoulder mass to the chest.
- Upper arms begin inside the shoulder silhouette; there is no visible gap.
- Elbows sit between upper arm and forearm with continuous deformation.
- Wrists connect forearms to palms without pinching or detached vertices.
- Palms have thickness, thumbs oppose the fingers, and four finger chains are
  visibly distinct.
- Thighs leave the pelvis naturally, knees track over the matching foot, and
  neither knee collapses toward the centerline.
- Feet remain parallel enough for a normal gait and use heel strike, planted
  stance, toe-off, and swing clearance.
- Hair grows from the scalp and has an intentional hairline, crown, side
  profile, and back silhouette. A smooth cap is not an acceptable final style.
- Backpacks, medical bags, radios, axes, and pouches use straps, contact points,
  and body-conforming placement. Do not attach floating rectangular boxes.

## 4. Mesh, material, and performance budgets

These are target budgets, not permission to harm silhouette quality:

- One hero or ally: preferably under 80k rendered triangles.
- Standard infected: preferably under 55k rendered triangles.
- Hair: use cards or efficient modeled clumps; avoid strand rendering.
- Four 2K texture sets maximum per primary character; 1K is preferred for
  secondary infected. Pack roughness/metalness/occlusion where practical.
- Avoid 4K textures unless a measured close-up requires them.
- Use a small material count and reuse compatible materials.
- Apply transforms, remove hidden duplicate bodies, merge unused vertex groups,
  and delete non-rendering construction objects before export.
- Current GLBs are approximately 3–4 MB each. Treat a materially larger file as
  a regression unless visual benefit is demonstrated.

The runtime clones skeletons and materials. Geometry is shared for loaded GLBs,
so never mutate shared vertex data per actor.

## 5. Skeleton contract

Units are meters. The character stands on the ground plane at `y = 0`.
Preserve the current GLB facing convention and test it in the actual viewport;
`animatedCharacter.ts` applies the runtime correction.

Required nodes:

```text
pelvis
spine_01
spine_02
spine_03
neck_01
head
jaw
clavicle_l / clavicle_r
upperarm_l / upperarm_r
lowerarm_l / lowerarm_r
hand_l / hand_r
thigh_l / thigh_r
calf_l / calf_r
foot_l / foot_r
thumb_01_l, thumb_02_l, thumb_01_r, thumb_02_r
index_01_l, index_02_l, index_01_r, index_02_r
middle_01_l, middle_02_l, middle_01_r, middle_02_r
ring_01_l, ring_02_l, ring_01_r, ring_02_r
pinky_01_l, pinky_02_l, pinky_01_r, pinky_02_r
```

Additional twist, toe, facial, and finger-end bones are allowed. Do not rename
the required nodes without updating the loader and validator together.

### Skinning requirements

- Normalize weights and keep a maximum of four influences per vertex for the
  game export.
- Hand and finger vertices must be controlled by the matching hand/finger
  chain, not the forearm or upper arm.
- Test shoulder lift, elbow bend, wrist rotation, fist closure, hip flexion,
  knee bend, ankle roll, crouch, and a full stride.
- Inspect armpits, elbows, wrists, groin, knees, ankles, straps, and layered
  clothing at animation extremes.
- Correct weights and topology; do not hide broken deformation with a rigid
  accessory.

## 6. Required animation clips

Each shipped GLB must embed these exact clip names:

```text
Native_Idle
Native_Walk
Native_Run
Native_Attack
Native_AttackRun
Native_Shoot
Native_Hit
Native_Death
```

Locomotion clips loop. Attacks, shooting, hit, and death are one-shots.

### Human locomotion acceptance

- Left and right contacts alternate; the same leg never leads twice.
- The opposite arm counter-swings with the leading leg.
- Elbows remain softly bent rather than locked.
- The head remains forward with restrained vertical motion.
- Knees stay in the hip-to-ankle plane and do not point inward.
- The planted foot does not visibly skate at the runtime movement speed.
- Each swing foot clears the floor without an exaggerated marching step.
- The pelvis has subtle vertical excursion and no side-to-side snapping.
- Start/end poses and root motion are compatible with in-place playback.

### Attack acceptance

- The hero plants or braces the feet, rotates pelvis and chest, drives the axe
  from shoulder and elbow, follows through, and recovers balance.
- Both hands remain attached and correctly weighted throughout.
- The axe grip does not pass through the palm or detach from the wrist.
- `Native_AttackRun` preserves forward momentum without foot skating.
- Zombie attacks use reach, torso commitment, and recovery rather than moving
  one arm up and down.

### Zombie movement acceptance

- Walkers use an asymmetrical death walk with a recognizable contact cycle.
- Runners are unstable but remain anatomically connected and readable.
- Heavies carry mass through slower acceleration, wider stance, and committed
  attacks.
- Random variation belongs in pace, turn bias, pauses, posture, and sound
  timing. Never randomize joint motion so far that limbs disconnect.

## 7. Blender authoring workflow

1. Duplicate the approved source `.blend`; never work destructively on the only
   copy.
2. Set scene units to metric and verify human height in meters.
3. Finish the neutral bind pose and forward orientation.
4. Model or retopologize the body with deformation loops around shoulders,
   elbows, wrists, fingers, hips, knees, and ankles.
5. Build hair and clothing as intentional, body-following forms.
6. Fit the required skeleton; keep left/right naming exact.
7. Bind with automatic weights only as a starting point.
8. Correct weights manually, especially hands, shoulders, hips, and knees.
9. Add equipment with believable straps and attach handheld items to the
   correct hand bone.
10. Author or retarget the eight required clips. Bake animation to the deform
    skeleton and remove control-rig dependencies from export.
11. Test the model in solid, material, and rendered views from four directions.
12. Export a GLB with selected objects, visible geometry, skinning, materials,
    and animations. Exclude cameras, studio lights, controls, and reference
    images.

Recommended export checks:

- Apply mesh scale/rotation where safe; armature and animations must remain
  consistent.
- Include normals and tangents when normal maps need them.
- Use glTF-compatible Principled BSDF materials.
- Confirm all eight clips have distinct, correct frame ranges and names.
- Open the exported GLB in a clean Blender file or neutral viewer before adding
  it to the game.

## 8. Integration workflow

1. Put the optimized GLB in `public/models/characters/`.
2. Keep the expected filename or update `LICENSED_MODELS` and the loader.
3. Update `public/models/THIRD_PARTY.md`.
4. Run:

   ```bash
   npm run validate:characters
   npx tsc --noEmit
   npm run lint
   npm run build:pages
   ```

5. Start the game locally and inspect:
   - Idle, walk, and run from front, back, and both sides.
   - Slow turns and rapid direction changes.
   - Axe idle grip, attack, attack while moving, and recovery.
   - Pistol grip and shot.
   - Hit and death.
   - Companion follow behavior.
   - Zombie walk, chase, attack, hit, death, and health bar height.
   - Blackout visibility and flashlight silhouette.
6. Monitor frame time, memory, GPU load, network size, and laptop temperature.
7. Stop the server and Blender when validation is complete.

Do not accept a model because a single still image looks correct. Animation,
deformation, gameplay scale, camera orientation, equipment contact, and
performance are part of the model.

## 9. Validation loop

If a model fails:

1. Capture the exact pose, view, clip, and timestamp.
2. Classify the defect: topology, bind pose, bone orientation, weight,
   animation curve, equipment attachment, material, or runtime mapping.
3. Fix the source cause.
4. Re-export to a temporary filename.
5. Run the automated validator.
6. Inspect the four directional views and gameplay action.
7. Replace the game asset only after both automated and visual checks pass.

Repeat until hands are connected, knees track correctly, feet face forward,
hair is intentional, equipment is integrated, and all gameplay clips pass.

## 10. Completion rules

A change is complete only when:

- The requested gameplay is implemented, not merely documented.
- Typecheck and lint pass.
- Relevant automated tests pass.
- Character validation passes when models or animation code change.
- A production Pages build completes.
- A local visual check confirms loading, movement, objectives, interactions,
  combat, lighting, and layout.
- No local server or Blender process is left running.
- Nothing is pushed or deployed without explicit current authorization.
