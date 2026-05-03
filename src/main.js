import './styles.css';
import { gsap } from 'gsap';
import * as THREE from 'three';
import drawingUrl from '../Document_20260503_0001.jpg?url';

const canvas = document.querySelector('#foldCanvas');
const toggleButton = document.querySelector('#toggleButton');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0.12, 5.7);

const paperGroup = new THREE.Group();
paperGroup.rotation.x = -0.12;
paperGroup.rotation.y = -0.05;
scene.add(paperGroup);

const ambient = new THREE.HemisphereLight(0xffffff, 0xd6ccbb, 2.45);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-1.8, 2.6, 3.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbde7ff, 0.9);
fillLight.position.set(2.8, -1.4, 3);
scene.add(fillLight);

const loader = new THREE.TextureLoader();

const state = {
  progress: 0,
  imageWidth: 2494,
  imageHeight: 3524,
  paperHeight: 3.82,
  get paperWidth() {
    return this.paperHeight * (this.imageWidth / this.imageHeight);
  },
};

const foldLines = [0, 881, 1762, 2643, 3524];
const panels = [];
let animation;
let isOpen = false;

function makePanelMaterial(baseTexture, y0, y1) {
  const texture = baseTexture.clone();
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, (y1 - y0) / state.imageHeight);
  texture.offset.set(0, 1 - y1 / state.imageHeight);

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function addFoldCrease(width, panelHeight, panelIndex) {
  const crease = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.011),
    new THREE.MeshBasicMaterial({
      color: panelIndex % 2 ? 0x8d7f74 : 0xffffff,
      transparent: true,
      opacity: panelIndex % 2 ? 0.18 : 0.22,
      depthWrite: false,
    })
  );
  crease.position.set(0, panelHeight / 2 - 0.006, 0.004);
  return crease;
}

function buildPaper(texture) {
  const paperWidth = state.paperWidth;
  const panelCount = foldLines.length - 1;

  for (let index = 0; index < panelCount; index += 1) {
    const y0 = foldLines[index];
    const y1 = foldLines[index + 1];
    const panelHeight = ((y1 - y0) / state.imageHeight) * state.paperHeight;
    const geometry = new THREE.PlaneGeometry(paperWidth, panelHeight, 1, 1);
    const material = makePanelMaterial(texture, y0, y1);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      panelHeight,
      closedAngle: [0, Math.PI / 2, -Math.PI / 2, 0][index],
      openAngle: 0,
    };

    if (index > 0) {
      mesh.add(addFoldCrease(paperWidth, panelHeight, index));
    }

    panels.push(mesh);
    paperGroup.add(mesh);
  }

  updateFold(0);
}

function easeFold(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function updateFold(rawProgress) {
  const progress = THREE.MathUtils.clamp(rawProgress, 0, 1);
  const eased = easeFold(progress);
  const paperHeight = state.paperHeight;
  const topY = paperHeight / 2;

  let cursor = new THREE.Vector3(0, topY, 0);
  panels.forEach((panel) => {
    const { panelHeight, closedAngle } = panel.userData;
    const angle = THREE.MathUtils.lerp(closedAngle, 0, eased);
    const down = new THREE.Vector3(0, -Math.cos(angle) * panelHeight, -Math.sin(angle) * panelHeight);
    const center = cursor.clone().addScaledVector(down, 0.5);

    panel.position.copy(center);
    panel.rotation.set(angle, 0, 0);
    cursor.add(down);
  });

  const closedZoom = 0.82;
  const openZoom = camera.aspect < 0.72 ? 0.98 : 1.03;
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitHeightZ = (state.paperHeight * openZoom) / (2 * tanHalfFov) * 1.03;
  const fitWidthZ = (state.paperWidth * openZoom) / (2 * tanHalfFov * camera.aspect) * 1.03;
  const openCameraZ = Math.max(7.25, fitHeightZ, fitWidthZ);
  const cameraZ = THREE.MathUtils.lerp(3.65, openCameraZ, eased);
  const cameraY = THREE.MathUtils.lerp(0.45, 0.03, eased);
  const groupX = THREE.MathUtils.lerp(-0.02, 0, eased);
  const groupY = THREE.MathUtils.lerp(-0.28, 0.03, eased);

  paperGroup.scale.setScalar(THREE.MathUtils.lerp(closedZoom, openZoom, eased));
  paperGroup.position.set(groupX, groupY, 0);
  paperGroup.rotation.x = THREE.MathUtils.lerp(-0.03, -0.12, eased);
  paperGroup.rotation.y = THREE.MathUtils.lerp(-0.02, -0.055, eased);
  camera.position.set(0, cameraY, cameraZ);
  camera.lookAt(0, THREE.MathUtils.lerp(0.5, 0.02, eased), 0);

  state.progress = progress;
  toggleButton.lastChild.textContent = progress >= 0.98 ? ' Fold' : ' Surprise';
}

function playTo(target) {
  animation?.kill();

  if (prefersReducedMotion) {
    updateFold(target);
    isOpen = state.progress > 0.5;
    return;
  }

  animation = gsap.to(state, {
    progress: target,
    duration: target > state.progress ? 2.45 : 1.6,
    ease: target > state.progress ? 'power3.inOut' : 'power2.inOut',
    onUpdate: () => updateFold(state.progress),
    onComplete: () => {
      isOpen = state.progress > 0.5;
    },
  });
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(430, Math.floor(rect.height));

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

loader.load(
  drawingUrl,
  (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    buildPaper(texture);
    resize();
    render();
    window.foldExperience = { playTo, updateFold };
    updateFold(0);
  },
  undefined,
  () => {
    document.body.classList.add('load-error');
  }
);

toggleButton.addEventListener('click', () => {
  isOpen = state.progress > 0.5;
  playTo(isOpen ? 0 : 1);
});

window.addEventListener('resize', resize);
