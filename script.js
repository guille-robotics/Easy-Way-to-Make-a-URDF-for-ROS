/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Easy Way to Make a URDF — script.js
 *  Full Three.js 3D preview + URDF generation engine
 *
 *  Architecture:
 *    RobotState   → single source of truth (plain JS object)
 *    readState()  → reads all DOM inputs → updates RobotState
 *    buildScene() → re-creates all Three.js meshes from RobotState
 *    buildURDF()  → produces URDF XML string from RobotState
 *
 *  ROS Axis convention (REP-103): X-forward, Y-left, Z-up
 *  Three.js default:              X-right,   Y-up,   Z-toward-viewer
 *
 *  Convention mapping applied here:
 *    ROS X → Three.js  X   (forward)
 *    ROS Y → Three.js -Y   (left  — Three.js Y is up, so we rotate scene)
 *    ROS Z → Three.js  Y   (up)
 *
 *  The camera and scene are rotated so that:
 *    Three.js +X  →  displayed as  ROS +X (red, forward)
 *    Three.js +Y  →  displayed as  ROS +Z (blue, up)
 *    Three.js +Z  →  displayed as  ROS -Y (i.e. ROS right, not shown)
 *
 *  We achieve the Z-up world by rotating the entire scene group by
 *  -π/2 around X, then mirror Y→ -Y within placement helpers.
 *  Simpler approach used here: place everything in a "ROS frame group"
 *  with group.rotation.x = -Math.PI/2  so the group's local Y becomes
 *  the world's Z (which Three.js treats as up after rotation).
 *  The camera starts at a position that makes X forward, Z up intuitive.
 * ════════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ═══════════════════════════════════════════════════════════════════════════
   1. GLOBAL STATE
═══════════════════════════════════════════════════════════════════════════ */

/** @type {RobotState} */
let robotState = {};

/** Sensor array: [{id, type, name, x, y, z}] */
let sensors = [];
let sensorCounter = 0;

/* ═══════════════════════════════════════════════════════════════════════════
   2. THREE.JS SETUP
═══════════════════════════════════════════════════════════════════════════ */

const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0a0c12, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 200);

/* ── ROS Z-up convention setup ──────────────────────────────────────────────
   We place all robot geometry inside `rosGroup`. The group is rotated so
   that the group's local frame matches ROS REP-103:
     rosGroup local +X  →  world +X  (→ displayed right, but camera is at X+)
     rosGroup local +Y  →  world +Z  (up in Three.js when group rotated -90° X)
     rosGroup local +Z  →  world -Y  (into screen = ROS -Y = right)

   Camera positioned at [+1.2, +0.9, +0.7] looking at origin.
   After the grid / axes helper rotation the red axis will point "into" X
   which visually is the robot's forward direction.
─────────────────────────────────────────────────────────────────────────── */

/** All robot meshes live inside this group. Rotate group to achieve Z-up. */
const rosGroup = new THREE.Group();
// Rotate around X by -90 degrees: Three.js Y becomes Z-up world axis
rosGroup.rotation.x = -Math.PI / 2;
scene.add(rosGroup);

// Grid on the XY plane of the ROS frame (which is the floor)
const gridHelper = new THREE.GridHelper(4, 40, 0x1e2235, 0x1a1d2e);
gridHelper.rotation.x = Math.PI / 2; // Grid lies in ROS XY (floor)
rosGroup.add(gridHelper);

// Axes helper: Red=X(forward), Green=Y(left), Blue=Z(up) — ROS REP-103
// AxesHelper: Red=Three.X, Green=Three.Y, Blue=Three.Z
// After rosGroup rotation: Three.Y is ROS Z, Three.X is ROS X, Three.Z is ROS -Y
// We swap axes manually by building custom arrows.
(function addRosAxesHelper() {
  const origin = new THREE.Vector3(0, 0, 0);
  const len = 0.3;
  const dirs = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xff4d6d }, // ROS X forward (red)
    { dir: new THREE.Vector3(0, 1, 0), color: 0x4dff91 }, // ROS Y left   (green)
    { dir: new THREE.Vector3(0, 0, 1), color: 0x4d9fff }, // ROS Z up     (blue)
  ];
  dirs.forEach(({ dir, color }) => {
    const arrow = new THREE.ArrowHelper(dir, origin, len, color, len * 0.22, len * 0.12);
    rosGroup.add(arrow);
  });
})();

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
sunLight.position.set(3, 6, 4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.1;
sunLight.shadow.camera.far = 20;
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -2;
sunLight.shadow.camera.right = sunLight.shadow.camera.top = 2;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x6c63ff, 0.4);
fillLight.position.set(-2, 2, -2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x00d4aa, 0.25);
rimLight.position.set(0, -3, 3);
scene.add(rimLight);

// Camera initial position (ROS convention: looking from front-right-above)
camera.position.set(1.2, 0.85, 0.9);
camera.lookAt(0, 0, 0.1);

// OrbitControls (imported as ES module)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.15;
controls.maxDistance = 12;
controls.target.set(0, 0, 0.1);
controls.update();

// Shadow catcher floor
const shadowFloorGeo = new THREE.PlaneGeometry(6, 6);
const shadowFloorMat = new THREE.ShadowMaterial({ opacity: 0.18 });
const shadowFloor = new THREE.Mesh(shadowFloorGeo, shadowFloorMat);
shadowFloor.receiveShadow = true;
shadowFloor.rotation.x = -Math.PI / 2; // world XZ plane (floor)
scene.add(shadowFloor);

// Resize observer
const resizeObs = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
});
resizeObs.observe(canvas.parentElement);

// Initial size
(function initSize() {
  const { width, height } = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
})();

/* ═══════════════════════════════════════════════════════════════════════════
   3. MATERIALS
═══════════════════════════════════════════════════════════════════════════ */

const MAT = {
  chassis: makeMat(0x4a5cad, 0.15, 0.65),
  wheel: makeMat(0x1a1f2e, 0.05, 0.35),
  wheelRim: makeMat(0x2d3561, 0.3, 0.5),
  caster: makeMat(0x888888, 0.1, 0.4),
  lidar: makeMat(0xffd166, 0.2, 0.6),
  camera: makeMat(0x06d6a0, 0.15, 0.55),
  depthCamera: makeMat(0x118ab2, 0.2, 0.6),
  imu: makeMat(0xef476f, 0.1, 0.5),
};

function makeMat(hexColor, roughness = 0.4, metalness = 0.5) {
  return new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness,
    metalness,
    envMapIntensity: 0.6,
  });
}

function sensorMat(type) {
  switch (type) {
    case 'lidar': return MAT.lidar;
    case 'camera': return MAT.camera;
    case 'depth_camera': return MAT.depthCamera;
    case 'imu': return MAT.imu;
    default: return MAT.lidar;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. SCENE ROBOT GROUP (holds only robot meshes, rebuilt on every change)
═══════════════════════════════════════════════════════════════════════════ */

/** Cleared and rebuilt every time any parameter changes. */
let robotMeshGroup = new THREE.Group();
rosGroup.add(robotMeshGroup);

function clearRobotMeshes() {
  robotMeshGroup.traverse(obj => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      // Materials are shared, don't dispose
    }
  });
  robotMeshGroup.clear();
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. READ STATE FROM DOM
═══════════════════════════════════════════════════════════════════════════ */

function readState() {
  const f = (id, def) => {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
  };
  const s = (id, def) => {
    const el = document.getElementById(id);
    return el ? el.value : def;
  };

  robotState = {
    robotName: s('robot-name', 'my_robot'),
    driveType: s('drive-type', 'diff'),   // 'diff' | 'skid'

    chassis: {
      length: f('chassis-length', 0.40),  // X
      width: f('chassis-width', 0.30),  // Y
      height: f('chassis-height', 0.12),  // Z
      mass: f('chassis-mass', 5.0),
    },

    wheels: {
      radius: f('wheel-radius', 0.065),
      width: f('wheel-width', 0.030),
      mass: f('wheel-mass', 0.25),
      groundClearance: f('wheel-ground-clearance', 0.005),
      offsetX: f('wheel-offset-x', 0.0),
      offsetY: f('wheel-offset-y', 0.16),
    },

    caster: {
      radius: f('caster-radius', 0.020),
      offsetX: f('caster-offset-x', -0.15),
    },

    sensors: sensors.map(s => ({
      id: s.id,
      type: s.type,
      name: s.name,
      x: s.x,
      y: s.y,
      z: s.z,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. BUILD THREE.JS SCENE
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Place a mesh at ROS position (rx, ry, rz).
 * Because rosGroup.rotation.x = -PI/2, the group's local axes are:
 *   local +X = ROS +X (forward)
 *   local +Y = ROS +Z (up)
 *   local +Z = ROS -Y (right in ROS = left in Three.js world after rot)
 * So we map: mesh.position.set(rx, rz, -ry)
 */
/**
 * REEMPLAZA TUS FUNCIONES rosPos y buildScene POR ESTAS:
 */

function rosPos(mesh, rx, ry, rz) {
  // Ahora el mapeo es directo porque el grupo ya está rotado correctamente a Z-up
  mesh.position.set(rx, ry, rz);
}

function buildScene() {
  clearRobotMeshes();
  readState();

  const st = robotState;
  const ch = st.chassis;
  const wh = st.wheels;

  // Centro del chasis en Z
  const chassisZ = wh.radius + wh.groundClearance + ch.height / 2;

  // ── Chassis ──────────────────────────────────────────────────────────────
  // Dimensiones correctas: X (Length), Y (Width), Z (Height)
  const chassisGeo = new THREE.BoxGeometry(ch.length, ch.width, ch.height);
  const chassisMesh = new THREE.Mesh(chassisGeo, MAT.chassis);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  rosPos(chassisMesh, 0, 0, chassisZ);
  robotMeshGroup.add(chassisMesh);

  // Líneas brillantes del chasis
  const edgesGeo = new THREE.EdgesGeometry(chassisGeo);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.4 });
  const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
  chassisMesh.add(edgeLines);

  // ── Wheels ────────────────────────────────────────────────────────────────
  const offX = wh.offsetX;
  const offY = wh.offsetY;

  // En Three.js el cilindro se crea a lo largo del eje Y. 
  // En nuestro sistema, Y es Izquierda/Derecha, ¡así que NO necesitan rotación!
  const wheelGeo = new THREE.CylinderGeometry(wh.radius, wh.radius, wh.width, 32);
  const wheelRimGeo = new THREE.CylinderGeometry(wh.radius * 0.5, wh.radius * 0.5, wh.width + 0.002, 8);

  function addWheel(rx, ry, rz) {
    const wMesh = new THREE.Mesh(wheelGeo, MAT.wheel);
    wMesh.castShadow = true;
    rosPos(wMesh, rx, ry, rz);
    robotMeshGroup.add(wMesh);

    const rim = new THREE.Mesh(wheelRimGeo, MAT.wheelRim);
    rosPos(rim, rx, ry, rz);
    robotMeshGroup.add(rim);
  }

  const wz = wh.radius;

  if (st.driveType === 'diff') {
    addWheel(offX, offY, wz);
    addWheel(offX, -offY, wz);

    const castR = st.caster.radius;
    const castGeo = new THREE.SphereGeometry(castR, 16, 16);
    const castMesh = new THREE.Mesh(castGeo, MAT.caster);
    castMesh.castShadow = true;
    rosPos(castMesh, st.caster.offsetX, 0, castR);
    robotMeshGroup.add(castMesh);

    const castMesh2 = new THREE.Mesh(castGeo, MAT.caster);
    castMesh2.castShadow = true;
    rosPos(castMesh2, -st.caster.offsetX, 0, castR);
    robotMeshGroup.add(castMesh2);

  } else {
    addWheel(offX, offY, wz);
    addWheel(offX, -offY, wz);
    addWheel(-offX, offY, wz);
    addWheel(-offX, -offY, wz);
  }

  // ── Sensors ───────────────────────────────────────────────────────────────
  st.sensors.forEach(sensor => {
    const mat = sensorMat(sensor.type);
    let mesh;

    if (sensor.type === 'lidar') {
      const r = 0.052, h = 0.072;
      const geo = new THREE.CylinderGeometry(r, r, h, 32);
      mesh = new THREE.Mesh(geo, mat);
      // El LiDAR gira en el eje Z (Up), así que rotamos el cilindro para que quede de pie
      mesh.rotation.x = Math.PI / 2;
    } else if (sensor.type === 'camera') {
      const geo = new THREE.BoxGeometry(0.06, 0.04, 0.035);
      mesh = new THREE.Mesh(geo, mat);
      const lensGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.012, 12);
      const lensMesh = new THREE.Mesh(lensGeo, new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.1, metalness: 0.9
      }));
      // Lente mirando hacia el frente (Eje X)
      lensMesh.rotation.z = -Math.PI / 2;
      lensMesh.position.set(0.036, 0, 0);
      mesh.add(lensMesh);
    } else if (sensor.type === 'depth_camera') {
      const geo = new THREE.BoxGeometry(0.08, 0.025, 0.030);
      mesh = new THREE.Mesh(geo, mat);
    } else if (sensor.type === 'imu') {
      const geo = new THREE.BoxGeometry(0.04, 0.04, 0.012);
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
      mesh = new THREE.Mesh(geo, mat);
    }

    mesh.castShadow = true;

    const absX = sensor.x;
    const absY = sensor.y;
    const absZ = chassisZ + ch.height / 2 + sensor.z;
    rosPos(mesh, absX, absY, absZ);
    robotMeshGroup.add(mesh);

    // Línea conectora
    const pts = [
      new THREE.Vector3(absX, absY, absZ),
      new THREE.Vector3(0, 0, chassisZ + ch.height / 2),
    ];
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x444466, transparent: true, opacity: 0.5
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(lineGeo, lineMat);
    robotMeshGroup.add(line);
  });

  updateStatusBar();
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. URDF GENERATION
═══════════════════════════════════════════════════════════════════════════ */

/** Format a floating-point number for URDF (6 sig-figs) */
function fmt(n) { return Number(n).toFixed(6); }

/** Inertia for a solid box: dimensions x, y, z (meters), mass m */
function boxInertia(m, x, y, z) {
  return {
    ixx: (1 / 12) * m * (y * y + z * z),
    iyy: (1 / 12) * m * (x * x + z * z),
    izz: (1 / 12) * m * (x * x + y * y),
    ixy: 0, ixz: 0, iyz: 0,
  };
}

/**
 * Inertia for a solid cylinder with circular axis along the Z axis of the link.
 * In URDF wheel links, the wheel rotates around the Y axis.
 * The cylinder "height" h is the wheel width; "radius" r is the wheel radius.
 * Standard cylinder inertia (axis = Z in link frame):
 *   ixx = iyy = (1/12)*m*(3r² + h²)
 *   izz = (1/2)*m*r²
 * But since URDF wheels rotate around Y, by symmetry ixx=izz and we just
 * set all three consistently. The URDF axis tag handles rotation direction.
 */
function cylinderInertia(m, r, h) {
  const ixx_iyy = (1 / 12) * m * (3 * r * r + h * h);
  const izz = (1 / 2) * m * r * r;
  return {
    ixx: ixx_iyy,
    iyy: ixx_iyy,
    izz: izz,
    ixy: 0, ixz: 0, iyz: 0,
  };
}

/** Sphere inertia (for caster balls) */
function sphereInertia(m, r) {
  const i = (2 / 5) * m * r * r;
  return { ixx: i, iyy: i, izz: i, ixy: 0, ixz: 0, iyz: 0 };
}

/** Build the <inertial> block */
function inertialBlock(mass, inertia, indent = '      ') {
  const { ixx, iyy, izz, ixy, ixz, iyz } = inertia;
  return `${indent}<inertial>
${indent}  <origin xyz="0 0 0" rpy="0 0 0"/>
${indent}  <mass value="${fmt(mass)}"/>
${indent}  <inertia ixx="${fmt(ixx)}" ixy="${fmt(ixy)}" ixz="${fmt(ixz)}"
${indent}           iyy="${fmt(iyy)}" iyz="${fmt(iyz)}"
${indent}           izz="${fmt(izz)}"/>
${indent}</inertial>`;
}

/** Build a <link> for a box geometry */
function boxLink(name, mass, x, y, z, material = 'chassis_material') {
  const inert = boxInertia(mass, x, y, z);
  return `
    <link name="${name}">
${inertialBlock(mass, inert)}
      <visual>
        <origin xyz="0 0 0" rpy="0 0 0"/>
        <geometry>
          <box size="${fmt(x)} ${fmt(y)} ${fmt(z)}"/>
        </geometry>
        <material name="${material}"/>
      </visual>
      <collision>
        <origin xyz="0 0 0" rpy="0 0 0"/>
        <geometry>
          <box size="${fmt(x)} ${fmt(y)} ${fmt(z)}"/>
        </geometry>
      </collision>
    </link>`;
}

/**
 * Build a <link> for a cylinder (wheel).
 * URDF cylinder axis is always Z by default.
 * The joint will include rpy="1.5707963 0 0" to rotate so the cylinder
 * axis aligns with the world Y axis (wheel spinning around Y).
 */
function cylinderLink(name, mass, radius, length, material = 'wheel_material') {
  const inert = cylinderInertia(mass, radius, length);
  return `
    <link name="${name}">
${inertialBlock(mass, inert)}
      <visual>
        <origin xyz="0 0 0" rpy="1.5707963 0 0"/>
        <geometry>
          <cylinder radius="${fmt(radius)}" length="${fmt(length)}"/>
        </geometry>
        <material name="${material}"/>
      </visual>
      <collision>
        <origin xyz="0 0 0" rpy="1.5707963 0 0"/>
        <geometry>
          <cylinder radius="${fmt(radius)}" length="${fmt(length)}"/>
        </geometry>
      </collision>
    </link>`;
}

/** Build a <link> for a sphere (caster) */
function sphereLink(name, mass, radius) {
  const inert = sphereInertia(mass, radius);
  return `
    <link name="${name}">
${inertialBlock(mass, inert)}
      <visual>
        <origin xyz="0 0 0" rpy="0 0 0"/>
        <geometry>
          <sphere radius="${fmt(radius)}"/>
        </geometry>
        <material name="caster_material"/>
      </visual>
      <collision>
        <origin xyz="0 0 0" rpy="0 0 0"/>
        <geometry>
          <sphere radius="${fmt(radius)}"/>
        </geometry>
      </collision>
    </link>`;
}

/** Build a <joint> block */
function jointBlock(name, type, parent, child, ox, oy, oz, rr, rp, ry_ang, axisXYZ = null) {
  let axisTag = '';
  if (type === 'continuous' || type === 'revolute') {
    axisTag = `\n      <axis xyz="${axisXYZ || '0 1 0'}"/>`;
  }
  return `
    <joint name="${name}" type="${type}">
      <parent link="${parent}"/>
      <child link="${child}"/>
      <origin xyz="${fmt(ox)} ${fmt(oy)} ${fmt(oz)}" rpy="${fmt(rr)} ${fmt(rp)} ${fmt(ry_ang)}"/>${axisTag}
    </joint>`;
}

/** Sensor geometry dimensions */
const SENSOR_DIMS = {
  lidar: { type: 'cylinder', radius: 0.052, length: 0.072 },
  camera: { type: 'box', x: 0.060, y: 0.040, z: 0.035 },
  depth_camera: { type: 'box', x: 0.080, y: 0.025, z: 0.030 },
  imu: { type: 'box', x: 0.040, y: 0.040, z: 0.012 },
};

const SENSOR_MASS = {
  lidar: 0.200,
  camera: 0.100,
  depth_camera: 0.150,
  imu: 0.030,
};

function sensorLink(sensor) {
  const dims = SENSOR_DIMS[sensor.type] || SENSOR_DIMS.imu;
  const mass = SENSOR_MASS[sensor.type] || 0.1;
  const matName = `${sensor.type}_material`;

  if (dims.type === 'cylinder') {
    return cylinderLink(sensor.name, mass, dims.radius, dims.length, matName);
  } else {
    return boxLink(sensor.name, mass, dims.x, dims.y, dims.z, matName);
  }
}

/** Main URDF builder */
function buildURDF() {
  readState();
  const st = robotState;
  const ch = st.chassis;
  const wh = st.wheels;

  // Chassis Z offset: chassis_joint origin is from base_link
  // base_link is at the floor (z=0), chassis centre is at:
  const chassisOriginZ = wh.radius + wh.groundClearance + ch.height / 2;

  // Wheel Z offset from chassis centre = -(ch.height/2) - wh.groundClearance - wh.radius
  // But joint origin is expressed in chassis frame:
  const wheelJointZ = -(ch.height / 2) - wh.groundClearance - wh.radius;

  // Absolute offsets from chassis centre (no halving — user inputs are the exact distance)
  const offX = wh.offsetX;
  const offY = wh.offsetY;

  let links = '';
  let joints = '';
  let mats = '';

  // ── Materials block ──────────────────────────────────────────────────────
  mats = `
    <material name="chassis_material">
      <color rgba="0.29 0.36 0.68 1.0"/>
    </material>
    <material name="wheel_material">
      <color rgba="0.10 0.12 0.18 1.0"/>
    </material>
    <material name="caster_material">
      <color rgba="0.53 0.53 0.53 1.0"/>
    </material>
    <material name="lidar_material">
      <color rgba="1.0 0.82 0.40 1.0"/>
    </material>
    <material name="camera_material">
      <color rgba="0.02 0.84 0.63 1.0"/>
    </material>
    <material name="depth_camera_material">
      <color rgba="0.07 0.54 0.70 1.0"/>
    </material>
    <material name="imu_material">
      <color rgba="0.94 0.28 0.44 1.0"/>
    </material>`;

  // ── base_link ────────────────────────────────────────────────────────────
  links += `
    <!-- base_link: virtual root, position at ground contact point -->
    <link name="base_link"/>`;

  // ── chassis ──────────────────────────────────────────────────────────────
  links += boxLink('chassis', ch.mass, ch.length, ch.width, ch.height);
  joints += jointBlock(
    'base_link_to_chassis', 'fixed',
    'base_link', 'chassis',
    0, 0, chassisOriginZ, 0, 0, 0
  );

  // ── wheels ───────────────────────────────────────────────────────────────
  if (st.driveType === 'diff') {
    // Left drive wheel (ROS Y positive = left)
    links += cylinderLink('left_wheel', wh.mass, wh.radius, wh.width);
    joints += jointBlock(
      'chassis_to_left_wheel', 'continuous',
      'chassis', 'left_wheel',
      offX, offY, wheelJointZ,
      0, 0, 0, '0 1 0'
    );

    // Right drive wheel (ROS Y negative = right)
    links += cylinderLink('right_wheel', wh.mass, wh.radius, wh.width);
    joints += jointBlock(
      'chassis_to_right_wheel', 'continuous',
      'chassis', 'right_wheel',
      offX, -offY, wheelJointZ,
      0, 0, 0, '0 1 0'
    );

    // Front caster (ball — fixed, passive)
    const cr = st.caster.radius;
    const casterFrontX = st.caster.offsetX; // user-defined (typically positive = front)
    // Caster Z in chassis frame: bottom of chassis + caster radius
    const casterZ = -(ch.height / 2) - cr;

    links += sphereLink('front_caster', cr * 0.05, cr); // lightweight
    joints += jointBlock(
      'chassis_to_front_caster', 'fixed',
      'chassis', 'front_caster',
      Math.abs(casterFrontX), 0, casterZ, 0, 0, 0
    );

    links += sphereLink('rear_caster', cr * 0.05, cr);
    joints += jointBlock(
      'chassis_to_rear_caster', 'fixed',
      'chassis', 'rear_caster',
      -Math.abs(casterFrontX), 0, casterZ, 0, 0, 0
    );

  } else {
    // 4-wheel skid steer
    const wheelDefs = [
      { name: 'front_left_wheel', x: offX, y: offY },
      { name: 'front_right_wheel', x: offX, y: -offY },
      { name: 'rear_left_wheel', x: -offX, y: offY },
      { name: 'rear_right_wheel', x: -offX, y: -offY },
    ];

    wheelDefs.forEach(w => {
      links += cylinderLink(w.name, wh.mass, wh.radius, wh.width);
      joints += jointBlock(
        `chassis_to_${w.name}`, 'continuous',
        'chassis', w.name,
        w.x, w.y, wheelJointZ,
        0, 0, 0, '0 1 0'
      );
    });
  }

  // ── sensors ───────────────────────────────────────────────────────────────
  st.sensors.forEach(sensor => {
    links += sensorLink(sensor);
    // Sensor joint origin: offset from chassis (top of chassis = ch.height/2)
    // The sensor.z is relative to the top of the chassis
    joints += jointBlock(
      `chassis_to_${sensor.name}`, 'fixed',
      'chassis', sensor.name,
      sensor.x, sensor.y, ch.height / 2 + sensor.z,
      0, 0, 0
    );
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString();
  const driveLabel = st.driveType === 'diff' ? 'Differential Drive (2-wheel + casters)' : '4-Wheel Skid-Steer';

  const urdf = `<?xml version="1.0"?>
<!--
  Robot:      ${st.robotName}
  Drive type: ${driveLabel}
  Generated:  ${timestamp}
  Tool:       Easy Way to Make a URDF (https://github.com/easywayurdf)
  Convention: ROS REP-103 — X-forward, Y-left, Z-up
-->
<robot name="${st.robotName}" xmlns:xacro="http://ros.org/wiki/xacro">

  <!-- ═══════════════════════════════════════════════
       MATERIALS
  ═══════════════════════════════════════════════ -->${mats}

  <!-- ═══════════════════════════════════════════════
       LINKS
  ═══════════════════════════════════════════════ -->${links}

  <!-- ═══════════════════════════════════════════════
       JOINTS
  ═══════════════════════════════════════════════ -->${joints}

</robot>
`;

  return urdf;
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. STATUS BAR
═══════════════════════════════════════════════════════════════════════════ */

function updateStatusBar() {
  const st = robotState;
  const driveLinks = st.driveType === 'diff' ? 5 : 5; // base+chassis+2wheels+casters or 4wheels

  let linkCount = 2; // base_link + chassis
  let jointCount = 1; // base_to_chassis

  if (st.driveType === 'diff') {
    linkCount += 4; // left, right wheels + 2 casters
    jointCount += 4;
  } else {
    linkCount += 4;
    jointCount += 4;
  }

  linkCount += st.sensors.length;
  jointCount += st.sensors.length;

  document.getElementById('status-link-count').textContent = `${linkCount} links`;
  document.getElementById('status-joint-count').textContent = `${jointCount} joints`;

  const ind = document.getElementById('status-indicator');
  const txt = document.getElementById('status-text');
  ind.className = 'status-indicator';
  txt.textContent = `${st.robotName || 'my_robot'} · ${st.driveType === 'diff' ? 'Diff Drive' : 'Skid Steer'} · ${st.sensors.length} sensor(s)`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. SENSOR CARD DOM MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */

const SENSOR_TYPES = [
  { value: 'lidar', label: 'LiDAR', cssClass: 'dot-lidar', color: '#ffd166' },
  { value: 'camera', label: 'Camera', cssClass: 'dot-camera', color: '#06d6a0' },
  { value: 'depth_camera', label: 'Depth Camera', cssClass: 'dot-depth_camera', color: '#118ab2' },
  { value: 'imu', label: 'IMU', cssClass: 'dot-imu', color: '#ef476f' },
];

function sensorTypeInfo(type) {
  return SENSOR_TYPES.find(t => t.value === type) || SENSOR_TYPES[0];
}

function addSensorCard(initialType = 'lidar') {
  const id = ++sensorCounter;
  const info = sensorTypeInfo(initialType);
  const sName = `${initialType}_${id}`;

  // Push to sensor array
  sensors.push({ id, type: initialType, name: sName, x: 0, y: 0, z: 0.01 });

  const container = document.getElementById('sensors-container');
  const empty = document.getElementById('sensors-empty');
  if (empty) empty.style.display = 'none';

  const card = document.createElement('div');
  card.className = `sensor-card sensor-type--${initialType}`;
  card.id = `sensor-card-${id}`;
  card.dataset.sid = id;

  card.innerHTML = `
    <div class="sensor-card-header">
      <span class="sensor-type-dot ${info.cssClass}" style="background:${info.color};"></span>
      <span class="sensor-card-label" id="sensor-label-${id}">${info.label}</span>
      <span class="sensor-card-index">#${id}</span>
      <button class="btn-remove-sensor" data-sid="${id}" aria-label="Remove sensor ${id}" title="Remove sensor">✕</button>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label class="form-label" for="sensor-name-${id}">Link Name</label>
        <input type="text" id="sensor-name-${id}" class="form-input sensor-name-input" value="${sName}"
               data-sid="${id}" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="form-group" style="flex:1.5">
        <label class="form-label" for="sensor-type-${id}">Type</label>
        <select id="sensor-type-${id}" class="form-select" data-sid="${id}">
          ${SENSOR_TYPES.map(t =>
    `<option value="${t.value}"${t.value === initialType ? ' selected' : ''}>${t.label}</option>`
  ).join('')}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="sensor-x-${id}">Offset X <span class="unit">m</span></label>
        <input type="number" id="sensor-x-${id}" class="form-input" value="0" step="0.01" data-sid="${id}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="sensor-y-${id}">Offset Y <span class="unit">m</span></label>
        <input type="number" id="sensor-y-${id}" class="form-input" value="0" step="0.01" data-sid="${id}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="sensor-z-${id}">Offset Z <span class="unit">m</span></label>
        <input type="number" id="sensor-z-${id}" class="form-input" value="0.01" step="0.005" data-sid="${id}"/>
      </div>
    </div>`;

  container.appendChild(card);

  // Bind events for this card
  card.querySelector(`#sensor-type-${id}`).addEventListener('change', (e) => {
    const sid = parseInt(e.target.dataset.sid);
    const entry = sensors.find(s => s.id === sid);
    if (!entry) return;
    const newType = e.target.value;
    entry.type = newType;
    // Update name if it was the default
    const nameEl = document.getElementById(`sensor-name-${sid}`);
    if (nameEl.value === `${entry.type}_${sid}` || nameEl.value.startsWith(entry.type.split('_')[0])) {
      nameEl.value = `${newType}_${sid}`;
      entry.name = nameEl.value;
    }
    // Update card styling
    const info2 = sensorTypeInfo(newType);
    card.className = `sensor-card sensor-type--${newType}`;
    const dot = card.querySelector('.sensor-type-dot');
    dot.className = `sensor-type-dot ${info2.cssClass}`;
    dot.style.background = info2.color;
    card.querySelector(`#sensor-label-${sid}`).textContent = info2.label;
    onAnyChange();
  });

  card.querySelector(`#sensor-name-${id}`).addEventListener('input', (e) => {
    const sid = parseInt(e.target.dataset.sid);
    const entry = sensors.find(s => s.id === sid);
    if (entry) { entry.name = e.target.value || `sensor_${sid}`; }
    onAnyChange();
  });

  ['x', 'y', 'z'].forEach(axis => {
    card.querySelector(`#sensor-${axis}-${id}`).addEventListener('input', (e) => {
      const sid = parseInt(e.target.dataset.sid);
      const entry = sensors.find(s => s.id === sid);
      if (entry) { entry[axis] = parseFloat(e.target.value) || 0; }
      onAnyChange();
    });
  });

  card.querySelector('.btn-remove-sensor').addEventListener('click', (e) => {
    const sid = parseInt(e.currentTarget.dataset.sid);
    removeSensor(sid);
  });

  onAnyChange();
}

function removeSensor(id) {
  sensors = sensors.filter(s => s.id !== id);
  const card = document.getElementById(`sensor-card-${id}`);
  if (card) {
    card.style.animation = 'slideIn 200ms var(--ease-out) reverse both';
    card.addEventListener('animationend', () => card.remove(), { once: true });
    // Fallback
    setTimeout(() => card.remove(), 250);
  }
  const empty = document.getElementById('sensors-empty');
  if (empty && sensors.length === 0) {
    empty.style.display = '';
  }
  onAnyChange();
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. CHANGE HANDLER — debounced
═══════════════════════════════════════════════════════════════════════════ */

let changeTimer = null;

function onAnyChange() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    buildScene();
    // If URDF preview is open, refresh it
    const panel = document.getElementById('urdf-preview-panel');
    if (!panel.hidden) {
      refreshURDFPreview();
    }
  }, 60); // 60 ms debounce = immediate feel but throttled
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. URDF PREVIEW PANEL
═══════════════════════════════════════════════════════════════════════════ */

function syntaxHighlightURDF(xml) {
  // Very lightweight XML syntax colouring
  return xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Comments
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>')
    // Tag names
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="xml-tag">$2</span>')
    // Attributes
    .replace(/([\w:-]+)=/g, '<span class="xml-attr">$1</span>=')
    // Quoted values
    .replace(/="([^"]*)"/g, '="<span class="xml-value">$1</span>"');
}

function refreshURDFPreview() {
  const content = document.getElementById('urdf-preview-content');
  const urdf = buildURDF();
  content.innerHTML = syntaxHighlightURDF(urdf);
  content.scrollTop = 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   12. EVENT LISTENERS
═══════════════════════════════════════════════════════════════════════════ */

// All standard form inputs
document.querySelectorAll(
  '#sidebar input, #sidebar select'
).forEach(el => {
  const evt = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(evt, onAnyChange);
});

// Drive type toggle: show/hide caster section
document.getElementById('drive-type').addEventListener('change', (e) => {
  const casterSection = document.getElementById('caster-section');
  casterSection.style.display = e.target.value === 'diff' ? '' : 'none';
  onAnyChange();
});

// Add sensor button
document.getElementById('btn-add-sensor').addEventListener('click', () => {
  addSensorCard('lidar');
});

// Download URDF
document.getElementById('btn-download-urdf').addEventListener('click', () => {
  const urdf = buildURDF();
  const blob = new Blob([urdf], { type: 'text/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(robotState.robotName || 'my_robot').replace(/\s+/g, '_')}.urdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Brief visual feedback on button
  const btn = document.getElementById('btn-download-urdf');
  const origLabel = btn.innerHTML;
  btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg> Downloaded!`;
  btn.style.background = 'linear-gradient(135deg, #00d4aa, #00a884)';
  setTimeout(() => {
    btn.innerHTML = origLabel;
    btn.style.background = '';
  }, 2000);
});

// URDF preview toggle
document.getElementById('btn-preview-urdf').addEventListener('click', () => {
  const panel = document.getElementById('urdf-preview-panel');
  if (panel.hidden) {
    panel.hidden = false;
    refreshURDFPreview();
  } else {
    panel.hidden = true;
  }
});

document.getElementById('btn-close-preview').addEventListener('click', () => {
  document.getElementById('urdf-preview-panel').hidden = true;
});

// Reset camera
document.getElementById('btn-reset-camera').addEventListener('click', () => {
  camera.position.set(1.2, 0.85, 0.9);
  controls.target.set(0, 0, 0.1);
  controls.update();
});

/* ═══════════════════════════════════════════════════════════════════════════
   13. ANIMATION LOOP
═══════════════════════════════════════════════════════════════════════════ */

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

/* ═══════════════════════════════════════════════════════════════════════════
   14. INITIAL BUILD
═══════════════════════════════════════════════════════════════════════════ */

// Trigger initial scene build
buildScene();

/* ═══════════════════════════════════════════════════════════════════════════
   15. KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('keydown', (e) => {
  // Ctrl+S → download
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    document.getElementById('btn-download-urdf').click();
  }
  // Ctrl+P → preview
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    document.getElementById('btn-preview-urdf').click();
  }
  // Escape → close preview
  if (e.key === 'Escape') {
    const panel = document.getElementById('urdf-preview-panel');
    if (!panel.hidden) panel.hidden = true;
  }
  // R → reset camera
  if (e.key === 'r' || e.key === 'R') {
    const active = document.activeElement;
    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') return;
    document.getElementById('btn-reset-camera').click();
  }
});
