import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const loader = new GLTFLoader();

function loadModel(path) {
  return new Promise((resolve, reject) => {
    const file = fs.readFileSync(path);
    loader.parse(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      "",
      resolve,
      reject,
    );
  });
}

function node(scene, name) {
  const match = scene.getObjectByName(name);
  assert(match, `Missing required skeleton node: ${name}`);
  return match;
}

function worldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(object) {
  return object.getWorldQuaternion(new THREE.Quaternion());
}

function sample(scene, mixer, clip, phase) {
  mixer.setTime(clip.duration * phase);
  scene.updateMatrixWorld(true);
  const result = {
    leftFoot: worldPosition(node(scene, "foot_l")),
    rightFoot: worldPosition(node(scene, "foot_r")),
    leftHand: worldPosition(node(scene, "hand_l")),
    rightHand: worldPosition(node(scene, "hand_r")),
    leftIndexRoot: worldPosition(node(scene, "index_01_l")),
    rightIndexRoot: worldPosition(node(scene, "index_01_r")),
    leftPinkyRoot: worldPosition(node(scene, "pinky_01_l")),
    rightPinkyRoot: worldPosition(node(scene, "pinky_01_r")),
    leftIndexDistal: worldPosition(node(scene, "index_02_l")),
    rightIndexDistal: worldPosition(node(scene, "index_02_r")),
    leftMiddleDistal: worldPosition(node(scene, "middle_02_l")),
    rightMiddleDistal: worldPosition(node(scene, "middle_02_r")),
    leftRingDistal: worldPosition(node(scene, "ring_02_l")),
    rightRingDistal: worldPosition(node(scene, "ring_02_r")),
    leftPinkyDistal: worldPosition(node(scene, "pinky_02_l")),
    rightPinkyDistal: worldPosition(node(scene, "pinky_02_r")),
    leftShoulder: worldPosition(node(scene, "upperarm_l")),
    rightShoulder: worldPosition(node(scene, "upperarm_r")),
    leftElbow: worldPosition(node(scene, "lowerarm_l")),
    rightElbow: worldPosition(node(scene, "lowerarm_r")),
    leftHip: worldPosition(node(scene, "thigh_l")),
    rightHip: worldPosition(node(scene, "thigh_r")),
    leftKnee: worldPosition(node(scene, "calf_l")),
    rightKnee: worldPosition(node(scene, "calf_r")),
    pelvis: worldPosition(node(scene, "pelvis")),
    headRotation: worldQuaternion(node(scene, "head")),
    leftShoulderRotation: worldQuaternion(node(scene, "upperarm_l")),
    rightShoulderRotation: worldQuaternion(node(scene, "upperarm_r")),
    leftElbowRotation: worldQuaternion(node(scene, "lowerarm_l")),
    rightElbowRotation: worldQuaternion(node(scene, "lowerarm_r")),
    leftHandRotation: worldQuaternion(node(scene, "hand_l")),
    rightHandRotation: worldQuaternion(node(scene, "hand_r")),
    leftKneeRotation: worldQuaternion(node(scene, "calf_l")),
    rightKneeRotation: worldQuaternion(node(scene, "calf_r")),
    leftFootRotation: worldQuaternion(node(scene, "foot_l")),
    rightFootRotation: worldQuaternion(node(scene, "foot_r")),
  };
  return result;
}

function palmNormal(pose, side) {
  const wrist = side === "left" ? pose.leftHand : pose.rightHand;
  const index = side === "left" ? pose.leftIndexRoot : pose.rightIndexRoot;
  const pinky = side === "left" ? pose.leftPinkyRoot : pose.rightPinkyRoot;
  return index
    .clone()
    .sub(wrist)
    .cross(pinky.clone().sub(wrist))
    .normalize();
}

function distalFingerSpread(pose, side) {
  const prefix = side === "left" ? "left" : "right";
  const chain = [
    pose[`${prefix}IndexDistal`],
    pose[`${prefix}MiddleDistal`],
    pose[`${prefix}RingDistal`],
    pose[`${prefix}PinkyDistal`],
  ];
  return {
    adjacent: chain.slice(1).map((point, index) => point.distanceTo(chain[index])),
    envelope: chain[0].distanceTo(chain[chain.length - 1]),
  };
}

function horizontalForward(rotation) {
  const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  direction.y = 0;
  return direction.lengthSq() > 0 ? direction.normalize() : direction;
}

function kneeFlexion(hip, knee, ankle) {
  const upper = hip.clone().sub(knee).normalize();
  const lower = ankle.clone().sub(knee).normalize();
  return 180 - THREE.MathUtils.radToDeg(upper.angleTo(lower));
}

function jointFlexion(root, joint, end) {
  const proximal = root.clone().sub(joint).normalize();
  const distal = end.clone().sub(joint).normalize();
  return 180 - THREE.MathUtils.radToDeg(proximal.angleTo(distal));
}

function kneeLineError(hip, knee, ankle) {
  const verticalRange = ankle.y - hip.y;
  const amount =
    Math.abs(verticalRange) < 1e-6 ? 0.5 : (knee.y - hip.y) / verticalRange;
  const expectedX = THREE.MathUtils.lerp(hip.x, ankle.x, amount);
  return Math.abs(knee.x - expectedX);
}

function fullFootForward(rotation) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).normalize();
}

function validateHandWeights(scene, name) {
  const results = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (
      !object.isSkinnedMesh ||
      !object.name.includes("GEO-body_") ||
      object.name.includes("eye")
    ) {
      return;
    }
    const position = object.geometry.getAttribute("position");
    const skinIndex = object.geometry.getAttribute("skinIndex");
    const skinWeight = object.geometry.getAttribute("skinWeight");
    if (!position || !skinIndex || !skinWeight) return;
    for (const side of [
      { suffix: "l" },
      { suffix: "r" },
    ]) {
      const wrist = worldPosition(node(scene, `hand_${side.suffix}`));
      // The glTF bone node exposes the head, not Blender's tail. The second
      // middle-finger segment begins almost exactly on the authored palm-axis
      // tail, so it is the stable exported proxy for wrist-to-hand direction.
      const palm = worldPosition(node(scene, `middle_02_${side.suffix}`));
      const axis = palm.clone().sub(wrist).normalize();
      let distalCount = 0;
      let strongControlCount = 0;
      let minimumControlWeight = 1;
      let maximumArmLeak = 0;
      let digitControlledCount = 0;
      for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        const vertexWorld = object.localToWorld(
          new THREE.Vector3(
            position.getX(vertexIndex),
            position.getY(vertexIndex),
            position.getZ(vertexIndex),
          ),
        );
        const offset = vertexWorld.clone().sub(wrist);
        const along = offset.dot(axis);
        const radial = offset.clone().addScaledVector(axis, -along).length();
        if (along < 0.02 || radial > 0.085) continue;
        distalCount += 1;
        let controlWeight = 0;
        let armLeak = 0;
        let digitWeight = 0;
        for (let influenceIndex = 0; influenceIndex < 4; influenceIndex += 1) {
          const boneIndex = skinIndex.getComponent(vertexIndex, influenceIndex);
          const bone = object.skeleton.bones[boneIndex];
          const weight = skinWeight.getComponent(vertexIndex, influenceIndex);
          const boneName = bone?.name ?? "";
          const digitBone =
            boneName.endsWith(`_${side.suffix}`) &&
            /^(index|middle|ring|pinky|thumb)_0[12]_/.test(boneName);
          if (boneName === `hand_${side.suffix}` || digitBone) {
            controlWeight += weight;
            if (digitBone) digitWeight += weight;
          }
          if (
            boneName === `lowerarm_${side.suffix}` ||
            boneName === `upperarm_${side.suffix}`
          ) {
            armLeak += weight;
          }
        }
        minimumControlWeight = Math.min(minimumControlWeight, controlWeight);
        maximumArmLeak = Math.max(maximumArmLeak, armLeak);
        if (controlWeight >= 0.9) strongControlCount += 1;
        if (digitWeight >= 0.75) digitControlledCount += 1;
      }
      if (distalCount > 0) {
        results.push({
          side: side.suffix,
          distalCount,
          strongRatio: strongControlCount / distalCount,
          minimumControlWeight,
          maximumArmLeak,
          digitControlledRatio: digitControlledCount / distalCount,
        });
      }
    }
  });
  assert(results.length >= 2, `${name}: could not inspect both distal hands`);
  console.log(`${name}: distal hand weights`, results);
  for (const result of results) {
    assert(
      result.strongRatio >= 0.95,
      `${name}: ${result.side} distal hand is not controlled by its hand/finger chain`,
    );
    assert(
      result.minimumControlWeight >= 0.9,
      `${name}: ${result.side} distal hand still leaks into the forearm`,
    );
    assert(
      result.maximumArmLeak <= 0.1,
      `${name}: ${result.side} distal hand retains excessive arm influence`,
    );
    assert(
      result.digitControlledRatio >= 0.25,
      `${name}: ${result.side} fingers are not independently deformable`,
    );
  }
}

async function validateModel(name) {
  const gltf = await loadModel(`public/models/characters/${name}.glb`);
  validateHandWeights(gltf.scene, name);
  const clip = THREE.AnimationClip.findByName(gltf.animations, "Native_Walk");
  assert(clip, `${name} is missing Native_Walk`);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();

  const leftContact = sample(gltf.scene, mixer, clip, 0);
  const rightPassing = sample(gltf.scene, mixer, clip, 0.25);
  const rightContact = sample(gltf.scene, mixer, clip, 0.5);
  const leftPassing = sample(gltf.scene, mixer, clip, 0.75);
  const eightPhase = Array.from({ length: 8 }, (_, index) =>
    sample(gltf.scene, mixer, clip, index / 8),
  );

  console.log(`${name}:`, {
    leftContactStride:
      leftContact.leftFoot.z - leftContact.rightFoot.z,
    rightContactStride:
      rightContact.rightFoot.z - rightContact.leftFoot.z,
    rightPassingClearance:
      rightPassing.rightFoot.y - rightPassing.leftFoot.y,
    leftPassingClearance:
      leftPassing.leftFoot.y - leftPassing.rightFoot.y,
    leftContactArmOpposition:
      leftContact.rightHand.z - leftContact.leftHand.z,
    rightContactArmOpposition:
      rightContact.leftHand.z - rightContact.rightHand.z,
    leftKneeFlexion: [
      leftContact,
      rightPassing,
      rightContact,
      leftPassing,
    ].map((pose) =>
      kneeFlexion(pose.leftHip, pose.leftKnee, pose.leftFoot).toFixed(1),
    ),
    rightKneeFlexion: [
      leftContact,
      rightPassing,
      rightContact,
      leftPassing,
    ].map((pose) =>
      kneeFlexion(pose.rightHip, pose.rightKnee, pose.rightFoot).toFixed(1),
    ),
    kneeLateralOffsets: [
      leftContact,
      rightPassing,
      rightContact,
      leftPassing,
    ].map((pose) => [
      (pose.leftKnee.x - pose.leftFoot.x).toFixed(3),
      (pose.rightKnee.x - pose.rightFoot.x).toFixed(3),
    ]),
    pelvisHeights: [
      leftContact,
      rightPassing,
      rightContact,
      leftPassing,
    ].map((pose) => pose.pelvis.y.toFixed(3)),
    footForwardZ: [
      horizontalForward(leftContact.leftFootRotation).z.toFixed(3),
      horizontalForward(leftContact.rightFootRotation).z.toFixed(3),
    ],
    eightPhase: {
      leftKneeFlexion: eightPhase.map((pose) =>
        kneeFlexion(pose.leftHip, pose.leftKnee, pose.leftFoot).toFixed(1),
      ),
      rightKneeFlexion: eightPhase.map((pose) =>
        kneeFlexion(pose.rightHip, pose.rightKnee, pose.rightFoot).toFixed(1),
      ),
      kneeLineErrorsMm: eightPhase.map((pose) => [
        (kneeLineError(pose.leftHip, pose.leftKnee, pose.leftFoot) * 1000).toFixed(1),
        (kneeLineError(pose.rightHip, pose.rightKnee, pose.rightFoot) * 1000).toFixed(1),
      ]),
      pelvisHeights: eightPhase.map((pose) => pose.pelvis.y.toFixed(3)),
      footForwardY: eightPhase.map((pose) => [
        fullFootForward(pose.leftFootRotation).y.toFixed(3),
        fullFootForward(pose.rightFootRotation).y.toFixed(3),
      ]),
      elbowFlexion: eightPhase.map((pose) => [
        jointFlexion(
          pose.leftShoulder,
          pose.leftElbow,
          pose.leftHand,
        ).toFixed(1),
        jointFlexion(
          pose.rightShoulder,
          pose.rightElbow,
          pose.rightHand,
        ).toFixed(1),
      ]),
      handX: eightPhase.map((pose) => [
        pose.leftHand.x.toFixed(3),
        pose.rightHand.x.toFixed(3),
      ]),
    },
  });
  console.log(
    `${name} strict phase metrics:\n${JSON.stringify(
      {
        kneeLineErrorsMm: eightPhase.map((pose) => [
          kneeLineError(pose.leftHip, pose.leftKnee, pose.leftFoot) * 1000,
          kneeLineError(pose.rightHip, pose.rightKnee, pose.rightFoot) * 1000,
        ]),
        footForwardY: eightPhase.map((pose) => [
          fullFootForward(pose.leftFootRotation).y,
          fullFootForward(pose.rightFootRotation).y,
        ]),
        elbowFlexion: eightPhase.map((pose) => [
          jointFlexion(pose.leftShoulder, pose.leftElbow, pose.leftHand),
          jointFlexion(pose.rightShoulder, pose.rightElbow, pose.rightHand),
        ]),
        handX: eightPhase.map((pose) => [
          pose.leftHand.x,
          pose.rightHand.x,
        ]),
      },
      null,
      2,
    )}`,
  );

  assert(
    leftContact.leftFoot.z - leftContact.rightFoot.z > 0.28,
    `${name}: left contact does not clearly lead the right foot`,
  );
  assert(
    rightContact.rightFoot.z - rightContact.leftFoot.z > 0.28,
    `${name}: right contact does not clearly lead the left foot`,
  );
  assert(
    rightPassing.rightFoot.y - rightPassing.leftFoot.y > 0.045,
    `${name}: right foot does not clear the floor during its passing phase`,
  );
  assert(
    leftPassing.leftFoot.y - leftPassing.rightFoot.y > 0.045,
    `${name}: left foot does not clear the floor during its passing phase`,
  );
  assert(
    leftContact.rightHand.z - leftContact.leftHand.z > 0.15,
    `${name}: right arm is not counter-swinging with the left leg`,
  );
  assert(
    rightContact.leftHand.z - rightContact.rightHand.z > 0.15,
    `${name}: left arm is not counter-swinging with the right leg`,
  );

  for (const gaitSample of [
    leftContact,
    rightPassing,
    rightContact,
    leftPassing,
  ]) {
    assert(gaitSample.leftFoot.x > 0, `${name}: left foot crossed the centerline`);
    assert(gaitSample.rightFoot.x < 0, `${name}: right foot crossed the centerline`);
    assert(
      Math.abs(gaitSample.leftKnee.x - gaitSample.leftFoot.x) < 0.13,
      `${name}: left knee is being pulled laterally`,
    );
    assert(
      Math.abs(gaitSample.rightKnee.x - gaitSample.rightFoot.x) < 0.13,
      `${name}: right knee is being pulled laterally`,
    );
    assert(
      horizontalForward(gaitSample.leftFootRotation).z > 0.94,
      `${name}: left foot is not pointing forward`,
    );
    assert(
      horizontalForward(gaitSample.rightFootRotation).z > 0.94,
      `${name}: right foot is not pointing forward`,
    );
  }

  assert(
    leftContact.headRotation.angleTo(rightContact.headRotation) < 0.11,
    `${name}: the head turns too far across opposite contact phases`,
  );
  const walkKneeLineErrors = eightPhase.flatMap((pose) => [
    kneeLineError(pose.leftHip, pose.leftKnee, pose.leftFoot),
    kneeLineError(pose.rightHip, pose.rightKnee, pose.rightFoot),
  ]);
  assert(
    Math.max(...walkKneeLineErrors) <= 0.005,
    `${name}: walk knees leave the anatomical hip-to-ankle plane`,
  );
  const walkLeftKnees = eightPhase.map((pose) =>
    kneeFlexion(pose.leftHip, pose.leftKnee, pose.leftFoot),
  );
  const walkRightKnees = eightPhase.map((pose) =>
    kneeFlexion(pose.rightHip, pose.rightKnee, pose.rightFoot),
  );
  for (const [label, value, minimum, maximum] of [
    ["left contact", walkLeftKnees[0], 5, 15],
    ["right contact", walkRightKnees[4], 5, 15],
    ["left loading", walkLeftKnees[1], 12, 24],
    ["right loading", walkRightKnees[5], 12, 24],
    ["left midstance", walkLeftKnees[2], 3, 12],
    ["right midstance", walkRightKnees[6], 3, 12],
    ["right swing peak", walkRightKnees[2], 45, 60],
    ["left swing peak", walkLeftKnees[6], 45, 60],
  ]) {
    assert(
      value >= minimum && value <= maximum,
      `${name}: walk ${label} knee flexion ${value.toFixed(1)}° is outside ${minimum}–${maximum}°`,
    );
  }
  const walkPelvisHeights = eightPhase.map((pose) => pose.pelvis.y);
  const walkPelvisExcursion =
    Math.max(...walkPelvisHeights) - Math.min(...walkPelvisHeights);
  assert(
    walkPelvisExcursion >= 0.02 && walkPelvisExcursion <= 0.05,
    `${name}: walk pelvis excursion is not human-scaled`,
  );
  const walkElbows = eightPhase.flatMap((pose) => [
    jointFlexion(pose.leftShoulder, pose.leftElbow, pose.leftHand),
    jointFlexion(pose.rightShoulder, pose.rightElbow, pose.rightHand),
  ]);
  assert(
    Math.min(...walkElbows) >= 8 && Math.max(...walkElbows) <= 32.1,
    `${name}: walk elbows lock or flare beyond a relaxed human range`,
  );
  const walkPlantedFootTravel =
    leftContact.leftFoot.z - eightPhase[3].leftFoot.z;
  const walkTimeScale = name === "maya" ? 1.47 : 1.325;
  const walkRootTravel =
    (1.1 * clip.duration * 0.375) / walkTimeScale;
  const walkFootDrift = Math.abs(walkPlantedFootTravel - walkRootTravel);
  console.log(`${name}: walk planted-foot drift`, {
    plantedFootTravel: walkPlantedFootTravel,
    rootTravel: walkRootTravel,
    drift: walkFootDrift,
  });
  assert(
    walkFootDrift <= 0.03,
    `${name}: runtime walk speed would visibly skate the planted foot`,
  );
  const contactStepWidth = Math.abs(
    leftContact.leftFoot.x - leftContact.rightFoot.x,
  );
  const [minimumStepWidth, maximumStepWidth] =
    name === "maya" ? [0.12, 0.16] : [0.14, 0.18];
  assert(
    contactStepWidth >= minimumStepWidth &&
      contactStepWidth <= maximumStepWidth,
    `${name}: walk step width is outside the body-proportional range`,
  );
  assert(
    rightPassing.rightFoot.y - rightPassing.leftFoot.y <= 0.08 &&
      leftPassing.leftFoot.y - leftPassing.rightFoot.y <= 0.08,
    `${name}: walk foot clearance is too high`,
  );
  const leftContactForward = fullFootForward(
    eightPhase[0].leftFootRotation,
  ).y;
  const leftNeutralForward = fullFootForward(
    eightPhase[2].leftFootRotation,
  ).y;
  const rightToeOffForward = fullFootForward(
    eightPhase[0].rightFootRotation,
  ).y;
  assert(
    leftContactForward > leftNeutralForward + 0.06 &&
      rightToeOffForward < leftNeutralForward - 0.12,
    `${name}: heel-strike/toe-off roll is reversed`,
  );
  const runClip = THREE.AnimationClip.findByName(
    gltf.animations,
    "Native_Run",
  );
  assert(runClip, `${name} is missing Native_Run`);
  mixer.stopAllAction();
  mixer.clipAction(runClip).reset().play();
  const runEightPhase = Array.from({ length: 8 }, (_, index) =>
    sample(gltf.scene, mixer, runClip, index / 8),
  );
  const groundHeight = Math.min(
    leftContact.leftFoot.y,
    rightContact.rightFoot.y,
  );
  console.log(
    `${name} run phase metrics:\n${JSON.stringify(
      {
        leftKneeFlexion: runEightPhase.map((pose) =>
          kneeFlexion(pose.leftHip, pose.leftKnee, pose.leftFoot),
        ),
        rightKneeFlexion: runEightPhase.map((pose) =>
          kneeFlexion(pose.rightHip, pose.rightKnee, pose.rightFoot),
        ),
        kneeLineErrorsMm: runEightPhase.map((pose) => [
          kneeLineError(pose.leftHip, pose.leftKnee, pose.leftFoot) * 1000,
          kneeLineError(pose.rightHip, pose.rightKnee, pose.rightFoot) * 1000,
        ]),
        footClearance: runEightPhase.map((pose) => [
          pose.leftFoot.y - groundHeight,
          pose.rightFoot.y - groundHeight,
        ]),
        pelvisHeights: runEightPhase.map((pose) => pose.pelvis.y),
        elbowFlexion: runEightPhase.map((pose) => [
          jointFlexion(pose.leftShoulder, pose.leftElbow, pose.leftHand),
          jointFlexion(pose.rightShoulder, pose.rightElbow, pose.rightHand),
        ]),
      },
      null,
      2,
    )}`,
  );
  const runLeftKnees = runEightPhase.map((pose) =>
    kneeFlexion(pose.leftHip, pose.leftKnee, pose.leftFoot),
  );
  const runRightKnees = runEightPhase.map((pose) =>
    kneeFlexion(pose.rightHip, pose.rightKnee, pose.rightFoot),
  );
  assert(
    runLeftKnees[0] >= 18 &&
      runLeftKnees[0] <= 27 &&
      runRightKnees[4] >= 18 &&
      runRightKnees[4] <= 27,
    `${name}: run contact knees lock or collapse`,
  );
  assert(
    Math.max(...runLeftKnees) >= 65 &&
      Math.max(...runLeftKnees) <= 90 &&
      Math.max(...runRightKnees) >= 65 &&
      Math.max(...runRightKnees) <= 90,
    `${name}: run swing knees do not reach a human recovery angle`,
  );
  const runKneeLineErrors = runEightPhase.flatMap((pose) => [
    kneeLineError(pose.leftHip, pose.leftKnee, pose.leftFoot),
    kneeLineError(pose.rightHip, pose.rightKnee, pose.rightFoot),
  ]);
  assert(
    Math.max(...runKneeLineErrors) <= 0.0045,
    `${name}: run knees leave the anatomical hip-to-ankle plane`,
  );
  for (const flightIndex of [3, 7]) {
    assert(
      runEightPhase[flightIndex].leftFoot.y - groundHeight > 0.08 &&
        runEightPhase[flightIndex].rightFoot.y - groundHeight > 0.08,
      `${name}: run lacks a two-foot airborne phase`,
    );
  }
  const runPelvisHeights = runEightPhase.map((pose) => pose.pelvis.y);
  const runPelvisExcursion =
    Math.max(...runPelvisHeights) - Math.min(...runPelvisHeights);
  assert(
    runPelvisExcursion >= 0.05 && runPelvisExcursion <= 0.09,
    `${name}: run pelvis excursion is outside a human range`,
  );
  const runElbows = runEightPhase.flatMap((pose) => [
    jointFlexion(pose.leftShoulder, pose.leftElbow, pose.leftHand),
    jointFlexion(pose.rightShoulder, pose.rightElbow, pose.rightHand),
  ]);
  const runFingerSpread = runEightPhase.map((pose) => ({
    left: distalFingerSpread(pose, "left"),
    right: distalFingerSpread(pose, "right"),
  }));
  const maximumRunFingerGap = Math.max(
    ...runFingerSpread.flatMap((pose) => [
      ...pose.left.adjacent,
      ...pose.right.adjacent,
    ]),
  );
  console.log(`${name}: run distal finger spread`, {
    maximumAdjacentGap: maximumRunFingerGap,
    maximumEnvelope: Math.max(
      ...runFingerSpread.flatMap((pose) => [
        pose.left.envelope,
        pose.right.envelope,
      ]),
    ),
  });
  assert(
    maximumRunFingerGap <= 0.0185,
    `${name}: run fingers fan outside the compact fist envelope`,
  );
  assert(
    Math.min(...runElbows) >= 65 && Math.max(...runElbows) <= 102,
    `${name}: run arm carriage is not naturally flexed`,
  );
  const runElbowOverhang = runEightPhase.flatMap((pose) => [
    Math.abs(pose.leftElbow.x) - Math.abs(pose.leftShoulder.x),
    Math.abs(pose.rightElbow.x) - Math.abs(pose.rightShoulder.x),
  ]);
  console.log(`${name}: run elbow overhang`, runElbowOverhang);
  console.log(
    `${name}: run palm normals`,
    runEightPhase.map((pose) => ({
      left: palmNormal(pose, "left").toArray(),
      right: palmNormal(pose, "right").toArray(),
    })),
  );
  assert(
    Math.max(...runElbowOverhang) <= 0.06,
    `${name}: run elbows flare outside the rib silhouette`,
  );
  const runHandClearance = runEightPhase.flatMap((pose) => [
    pose.leftHand.y - pose.pelvis.y,
    pose.rightHand.y - pose.pelvis.y,
  ]);
  assert(
    Math.min(...runHandClearance) >= 0.12,
    `${name}: run hands fall into the hips/waist`,
  );
  const runStanceDuration = 4 / 24;
  const runStancePhase = runStanceDuration / runClip.duration;
  const runStanceEnd = sample(
    gltf.scene,
    mixer,
    runClip,
    runStancePhase,
  );
  const runPlantedFootTravel =
    runEightPhase[0].leftFoot.z - runStanceEnd.leftFoot.z;
  const runTimeScale = name === "maya" ? 1.375 : 1.25;
  const runRootTravel =
    (3.3 * runStanceDuration) / runTimeScale;
  const runFootDrift = Math.abs(runPlantedFootTravel - runRootTravel);
  console.log(`${name}: run planted-foot drift`, {
    plantedFootTravel: runPlantedFootTravel,
    rootTravel: runRootTravel,
    drift: runFootDrift,
  });
  assert(
    runFootDrift <= 0.05,
    `${name}: runtime run speed would visibly skate the planted foot`,
  );
  for (const recoveryFrame of [6, 16]) {
    const recoveryPhase = (recoveryFrame / 24) / runClip.duration;
    const pose = sample(gltf.scene, mixer, runClip, recoveryPhase);
    const footSeparation = Math.abs(pose.leftFoot.z - pose.rightFoot.z);
    const handSeparation = Math.abs(pose.leftHand.z - pose.rightHand.z);
    const minimumFootSeparation = name === "maya" ? 0.31 : 0.35;
    const minimumHandSeparation = name === "maya" ? 0.25 : 0.32;
    console.log(
      `${name}: run recovery opposition ${JSON.stringify({
        frame: recoveryFrame,
        phase: recoveryPhase,
        footSeparation,
        handSeparation,
      })}`,
    );
    assert(
      footSeparation >= minimumFootSeparation,
      `${name}: run recovery feet collapse into a bunny-hop silhouette`,
    );
    assert(
      handSeparation >= minimumHandSeparation,
      `${name}: run arms do not visibly oppose one another`,
    );
    assert(
      (pose.leftFoot.z - pose.rightFoot.z) *
        (pose.leftHand.z - pose.rightHand.z) <
        0,
      `${name}: run arms move with the same-side leg instead of counter-swinging`,
    );
  }
  const runContactWidth = Math.abs(
    runEightPhase[0].leftFoot.x - runEightPhase[0].rightFoot.x,
  );
  const [minimumRunWidth, maximumRunWidth] =
    name === "maya" ? [0.09, 0.11] : [0.11, 0.13];
  assert(
    runContactWidth >= minimumRunWidth && runContactWidth <= maximumRunWidth,
    `${name}: run step width is outside the body-proportional range`,
  );

  const attackClip = THREE.AnimationClip.findByName(
    gltf.animations,
    "Native_Attack",
  );
  assert(attackClip, `${name} is missing Native_Attack`);
  mixer.stopAllAction();
  mixer.clipAction(attackClip).reset().play();
  const attackStart = sample(gltf.scene, mixer, attackClip, 0);
  const attackWindup = sample(gltf.scene, mixer, attackClip, 7 / 30);
  const attackStrike = sample(gltf.scene, mixer, attackClip, 13 / 30);
  const attackEnd = sample(gltf.scene, mixer, attackClip, 1);
  for (const [label, startPoint, endPoint] of [
    ["left hand", attackStart.leftHand, attackEnd.leftHand],
    ["right hand", attackStart.rightHand, attackEnd.rightHand],
    ["left foot", attackStart.leftFoot, attackEnd.leftFoot],
    ["right foot", attackStart.rightFoot, attackEnd.rightFoot],
  ]) {
    assert(
      startPoint.distanceTo(endPoint) <= 0.002,
      `${name}: attack recovery pops at the ${label}`,
    );
  }
  for (const [label, startRotation, endRotation] of [
    ["left shoulder", attackStart.leftShoulderRotation, attackEnd.leftShoulderRotation],
    ["right shoulder", attackStart.rightShoulderRotation, attackEnd.rightShoulderRotation],
    ["left elbow", attackStart.leftElbowRotation, attackEnd.leftElbowRotation],
    ["right elbow", attackStart.rightElbowRotation, attackEnd.rightElbowRotation],
    ["left hand", attackStart.leftHandRotation, attackEnd.leftHandRotation],
    ["right hand", attackStart.rightHandRotation, attackEnd.rightHandRotation],
    ["left knee", attackStart.leftKneeRotation, attackEnd.leftKneeRotation],
    ["right knee", attackStart.rightKneeRotation, attackEnd.rightKneeRotation],
  ]) {
    assert(
      startRotation.angleTo(endRotation) <= THREE.MathUtils.degToRad(2),
      `${name}: attack recovery rotates the ${label} away from its start pose`,
    );
  }
  for (const [label, pose] of [
    ["windup", attackWindup],
    ["strike", attackStrike],
  ]) {
    const leftElbow = jointFlexion(
      pose.leftShoulder,
      pose.leftElbow,
      pose.leftHand,
    );
    const rightElbow = jointFlexion(
      pose.rightShoulder,
      pose.rightElbow,
      pose.rightHand,
    );
    console.log(`${name}: attack ${label} elbow flexion`, {
      leftElbow,
      rightElbow,
    });
    assert(
      Math.max(leftElbow, rightElbow) <= 110,
      `${name}: attack ${label} elbow collapses beyond a natural range`,
    );
    if (label === "windup") {
      assert(
        leftElbow >= 20 && leftElbow <= 55 && rightElbow >= 75,
        `${name}: attack windup does not read as a braced human preparation`,
      );
    } else {
      assert(
        leftElbow >= 5 &&
          leftElbow <= 45 &&
          rightElbow >= 40 &&
          rightElbow <= 80,
        `${name}: attack strike does not read as a controlled one-handed axe arc`,
      );
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(gltf.scene);
  console.log(
    `${name}: gait valid — alternating contacts, foot clearance, arm opposition, forward feet, centered knees, stable head`,
  );
}

await validateModel("hero");
await validateModel("maya");
