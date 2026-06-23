# Easy Way to Make a URDF

> **A browser-based, zero-installation visual tool to design and export complete URDF robot description files for ROS/ROS2.**

---

## What is this tool?

**Easy Way to Make a URDF** is a fully client-side web application that lets robotics engineers and students interactively design a differential-drive or 4-wheel skid-steer robot using basic primitive geometries (boxes, cylinders, spheres), visualize it in a real-time 3D viewport, and download a production-ready `.urdf` file with a single click.

No ROS installation, no Python, no terminal, no build tools. Everything runs entirely inside your web browser.

---

## Features

| Feature | Details |
|---|---|
| **Real-time 3D Preview** | Three.js scene with OrbitControls — orbit, zoom, pan |
| **ROS REP-103 Compliant** | Z-up, X-forward, Y-left axis convention displayed correctly |
| **Differential Drive** | 2 drive wheels + 2 passive caster balls |
| **Skid-Steer (4-wheel)** | 4 independently driven continuous wheels |
| **Dynamic Sensor Manager** | Add/remove LiDAR, Camera, Depth Camera, IMU sensors at will |
| **Full URDF Physics** | Every link gets `<inertial>`, `<visual>`, and `<collision>` tags |
| **Correct Inertia Math** | Box and cylinder inertia tensors computed from dimensions and mass |
| **Live URDF Preview** | View the raw XML before downloading |
| **One-click Download** | Exports `<robot_name>.urdf` via browser Blob API |
| **Keyboard Shortcuts** | `Ctrl+S` download · `Ctrl+P` preview · `R` reset camera · `Esc` close |

---

## How to Run (Zero Installation)

This tool requires **no server**, **no npm**, **no Python**, and **no installation of any kind**.

### Option 1 — Double-click (simplest)

1. Download or clone this repository.
2. Open the project folder.
3. Double-click `index.html`.
4. It opens in your default browser and works immediately.

> ⚠️ **Note:** Some browsers block ES module features or `fetch()` on `file://` origins (Firefox does not; Chrome/Edge may).  
> If you see a blank screen or console errors on `file://`, use Option 2 below.

### Option 2 — Local HTTP server (recommended for Chrome/Edge)

Using Python (comes pre-installed on macOS/Linux, available on Windows):

```bash
# Python 3
python -m http.server 8080

# Then open:  http://localhost:8080
```

Or using Node.js:

```bash
npx -y serve .
```

Or VS Code's **Live Server** extension — right-click `index.html` → *Open with Live Server*.

---

## Project Architecture

```
Easy Way to Make a URDF/
├── index.html   ← UI shell, CDN imports (Three.js + OrbitControls)
├── style.css    ← Design system (CSS custom properties, dark theme)
├── script.js    ← All logic: state management, 3D rendering, URDF generation
└── README.md    ← This file
```

### Pure Frontend Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser Tab                       │
│                                                      │
│  ┌──────────────┐     ┌──────────────────────────┐  │
│  │  Control     │────▶│     RobotState (JS obj)  │  │
│  │  Panel (DOM) │     │  chassis, wheels,        │  │
│  │  Inputs /    │     │  sensors[], driveType    │  │
│  │  Selects     │     └────────────┬─────────────┘  │
│  └──────────────┘                  │                 │
│                           ┌────────┴──────────┐      │
│                           │                   │      │
│                    buildScene()          buildURDF()  │
│                           │                   │      │
│                    ┌──────▼──────┐    ┌───────▼────┐ │
│                    │  Three.js   │    │ XML String │ │
│                    │  3D Canvas  │    │ → Blob     │ │
│                    │  (WebGL)    │    │ → Download │ │
│                    └─────────────┘    └────────────┘ │
└─────────────────────────────────────────────────────┘
```

There is **no backend**. No data is sent anywhere. Everything happens inside a single browser tab.

---

## The URDF Structure Generated

```
base_link  (virtual root, at ground level)
    │
    └── [fixed] chassis  (box, with mass & inertia)
            │
            ├── [continuous] left_wheel     (diff drive)
            ├── [continuous] right_wheel    (diff drive)
            ├── [fixed]      front_caster   (sphere, diff drive)
            ├── [fixed]      rear_caster    (sphere, diff drive)
            │
            │   — OR (skid steer) —
            │
            ├── [continuous] front_left_wheel
            ├── [continuous] front_right_wheel
            ├── [continuous] rear_left_wheel
            ├── [continuous] rear_right_wheel
            │
            ├── [fixed]  lidar_1           (sensors, user-defined)
            ├── [fixed]  camera_1
            └── [fixed]  imu_1
```

### Inertia Mathematics

All inertia tensors are calculated from geometry and mass using standard rigid-body mechanics:

**Solid Box** (chassis, cameras, IMU) — dimensions `x`, `y`, `z`, mass `m`:
```
Ixx = (1/12) · m · (y² + z²)
Iyy = (1/12) · m · (x² + z²)
Izz = (1/12) · m · (x² + y²)
```

**Solid Cylinder** (wheels, LiDAR) — radius `r`, height/length `h`, mass `m`:
```
Ixx = Iyy = (1/12) · m · (3r² + h²)
Izz = (1/2) · m · r²
```

**Solid Sphere** (caster balls) — radius `r`, mass `m`:
```
Ixx = Iyy = Izz = (2/5) · m · r²
```

### ROS REP-103 Axis Convention

The 3D viewer is configured to match ROS's Z-up, X-forward, Y-left convention exactly:

| Arrow Colour | Axis | Meaning |
|---|---|---|
| 🔴 Red | +X | Forward |
| 🟢 Green | +Y | Left |
| 🔵 Blue | +Z | Up |

The Three.js scene group is rotated `-90°` around its X axis so that the visual representation perfectly matches what `rviz2` or `robot_state_publisher` would show.

---

## Using the Generated URDF in ROS2

```bash
# View in RViz2
ros2 run robot_state_publisher robot_state_publisher --ros-args \
     -p robot_description:="$(cat my_robot.urdf)"

# Or with joint_state_publisher_gui
ros2 launch urdf_tutorial display.launch.py model:=my_robot.urdf
```

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Safari 15+ | ✅ Full |
| Mobile (modern) | ⚠️ Usable (touch controls) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` | Download URDF |
| `Ctrl + P` | Toggle URDF source preview |
| `R` | Reset camera |
| `Escape` | Close URDF preview panel |

---

## License

MIT License — free to use, modify, and distribute.

---

*Built with ❤️ for the ROS/ROS2 community.*
