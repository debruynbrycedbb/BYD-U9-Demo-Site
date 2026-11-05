// BYD Yangwang U9 Xtreme — scroll-driven 3D stage
// three.js 0.170.0 (import map in index.html)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WetFloor } from './wetfloor.js';
import { SHOTS, shotForAspect } from './shots.js';

let requestRenderImpl = () => {};
const TITLE_Y = 1.6, TITLE_Z = -3.8;
const HORIZON = 0x1f2127;   // backdrop glow colour; the floor fades into it
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stageEl = document.querySelector('.stage');
const canvas = document.getElementById('scene');
const loaderEl = document.querySelector('.loader');
const loaderFill = document.querySelector('.loader__fill');
const chapters = [...document.querySelectorAll('.chapter')];
const panels = chapters.map((c) => c.querySelector('.panel'));
const navLinks = [...document.querySelectorAll('.nav a')];
const progressBar = document.querySelector('.progress span');

/* ------------------------------------------------------------------ page UI (works without WebGL) */
setupMenu();

let scrollState = { index: 0, local: 0 };   // which chapter, and 0..1 inside it
function readScroll() {
  const y = window.scrollY;
  const vh = window.innerHeight;
  let index = chapters.length - 1;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    if (y < c.offsetTop + c.offsetHeight) { index = i; break; }
  }
  const c = chapters[index];
  const local = THREE.MathUtils.clamp((y - c.offsetTop) / Math.max(1, c.offsetHeight - vh * 0.0), 0, 1);
  scrollState = { index, local };

  const max = document.documentElement.scrollHeight - vh;
  progressBar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;

  // text panels: fade in after the camera arrives, fade out before it leaves
  panels.forEach((p, i) => {
    let o = 0;
    if (i === index) {
      const t = local;
      if (i === 0) o = 1 - smooth(0.18, 0.34, t);                      // hero cue
      else if (i === chapters.length - 1) o = smooth(0.08, 0.24, t);    // finale button
      else o = smooth(0.02, 0.16, t) * (1 - smooth(0.42, 0.54, t));
    }
    p.style.opacity = o.toFixed(3);
    p.style.transform = `translateY(${((1 - o) * (i === index && local > 0.4 ? -16 : 16)).toFixed(1)}px)`;
  });

  // nav: highlight the chapter whose text is (or was last) on screen
  const id = chapters[index].id;
  navLinks.forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#${id}` ? 'true' : 'false'));
}
window.addEventListener('scroll', () => { readScroll(); requestRender(); }, { passive: true });
window.addEventListener('resize', readScroll);
readScroll();

/* ------------------------------------------------------------------ renderer */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  console.warn('WebGL unavailable, showing the still image instead.', err);
  loaderEl.classList.add('is-done');
}
if (renderer) start();

function start() {
  const isSmall = () => Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.02);

  const camera = new THREE.PerspectiveCamera(23, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.layers.enable(2);

  /* ---------- reflections on the car: a dark studio with a softbox and light strips */
  scene.environment = buildStudioEnvironment(renderer);
  scene.environmentIntensity = 1.35;

  /* ---------- overhead spot */
  // kept low: in a glossy clear coat a strong point light reads as a hard glare
  const spot = new THREE.SpotLight(0xfff6ee, 260, 0, THREE.MathUtils.degToRad(22), 0.85, 2);
  spot.position.set(0, 9, 0.4);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 4; spot.shadow.camera.far = 12;
  scene.add(spot, spot.target);

  /* ---------- soft fill so the car reads clearly from every angle */
  scene.add(new THREE.HemisphereLight(0xb9c2d6, 0x0a0a0c, 0.9));
  // key light that travels with the camera (up and to the left of it), no shadows
  const camKey = new THREE.DirectionalLight(0xffffff, 1.1);
  camKey.position.set(-6, 7, 4);
  camKey.target.position.set(0, 0, -10);
  camera.add(camKey, camKey.target);
  scene.add(camera);

  /* ---------- dim backdrop: lifts the horizon behind the car so its silhouette stands out */
  scene.add(buildBackdrop());

  /* ---------- soft fill on the rear-right wheel, only for the tyre close-up */
  const wheelFill = new THREE.PointLight(0xdfe6ff, 0, 6, 2);
  wheelFill.position.set(-2.6, 1.0, -2.4);
  scene.add(wheelFill);

  /* ---------- wet floor */
  const floor = new WetFloor({ size: 70, resolutionScale: isSmall() ? 0.35 : 0.5, horizon: HORIZON });
  scene.add(floor);

  /* ---------- contact shadow under the car */
  scene.add(buildContactShadow());

  /* ---------- haze beam */
  const beam = buildBeam();
  scene.add(beam);

  /* ---------- light bars that only show up as streaks in the wet floor (layer 1) */
  const bars = buildReflectionBars();
  scene.add(bars);

  /* ---------- title behind the car */
  const title = new THREE.Group();
  scene.add(title);
  buildTitle().then((mesh) => { title.add(mesh); document.documentElement.classList.add('is-3d'); layoutTitle(); requestRender(); });

  /* ---------- post: gentle bloom on the DRLs and hot highlights */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.4, 8.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- car */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('assets/byd_u9.glb', (gltf) => {
    const car = gltf.scene;
    car.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (m && m.name === 'MAT_Lights' && m.map) makeLightsGlow(m);
      // slightly softer clear coat than the Blender file: keeps the overhead spot from flaring under bloom
      if (m && m.name === 'MAT_BYD_YangWang_U9_Carpaint') { m.envMapIntensity = 1.15; m.clearcoatRoughness = 0.09; }
      if (m && m.name === 'MAT_BYD_YangWang_U9__Carbon') { m.clearcoatRoughness = 0.12; }
      if (m && /^MAT_Glass/.test(m.name)) { m.envMapIntensity = 0.35; }
    });
    scene.add(car);
    loaderFill.style.width = '100%';
    renderer.compile(scene, camera);
    requestRender();
    setTimeout(() => {
      stageEl.classList.add('is-live');
      loaderEl.classList.add('is-done');
    }, 150);
  }, (e) => {
    if (e.lengthComputable) loaderFill.style.width = `${Math.round((e.loaded / e.total) * 90)}%`;
  }, (err) => {
    console.error('Could not load the car model', err);
    loaderEl.querySelector('.loader__label').textContent = 'Could not load the 3D car';
  });

  /* ---------- camera path */
  const cur = shotForAspect(SHOTS[0], camera.aspect);   // damped camera state
  let goal = cur;
  const tmpPos = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function goalFromScroll() {
    const { index, local } = scrollState;
    const a = shotForAspect(SHOTS[Math.min(index, SHOTS.length - 1)], camera.aspect);
    const b = shotForAspect(SHOTS[Math.min(index + 1, SHOTS.length - 1)], camera.aspect);
    const t = index >= SHOTS.length - 1 ? 0 : easeInOut(smooth(0.55, 1.0, local));
    return lerpShot(a, b, t);
  }

  function applyShot(s) {
    tmpTarget.set(s.tx, s.ty, s.tz);
    const th = THREE.MathUtils.degToRad(s.theta), el = THREE.MathUtils.degToRad(s.elev);
    tmpPos.set(Math.sin(th) * Math.cos(el), Math.sin(el), Math.cos(th) * Math.cos(el)).multiplyScalar(s.dist).add(tmpTarget);
    camera.position.copy(tmpPos);
    camera.lookAt(tmpTarget);
    camera.fov = s.fov;
    // shift the car off-centre to leave room for the text
    const w = window.innerWidth, h = window.innerHeight;
    camera.setViewOffset(w, h, -s.sx * w, s.sy * h, w, h);
    camera.updateProjectionMatrix();

    title.children.forEach((m) => { m.material.opacity = s.titleOpacity; m.visible = s.titleOpacity > 0.003; });
    wheelFill.intensity = 7 * smooth(5.5, 3.2, s.dist);
  }

  /* ---------- title placement: keep it inside the view width on narrow screens */
  function layoutTitle() {
    const mesh = title.children[0];
    if (!mesh) return;
    const hero = shotForAspect(SHOTS[0], camera.aspect);
    const dist = hero.dist + Math.abs(TITLE_Z);
    const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(hero.fov / 2));
    const viewW = viewH * camera.aspect;
    const s = Math.min(1, (viewW * 0.86) / mesh.userData.width);
    mesh.scale.setScalar(s);
    mesh.position.y = TITLE_Y + (camera.aspect < 1 ? 0.9 : 0) - (1 - s) * 0.3;
  }

  /* ---------- render loop (renders only while something is changing) */
  let needsRender = true;
  let rafId = 0;
  let last = performance.now();
  function requestRenderInner() { needsRender = true; if (!rafId) rafId = requestAnimationFrame(tick); }
  requestRenderImpl = requestRenderInner;

  function tick(now) {
    rafId = 0;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    goal = goalFromScroll();
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 5.5);
    let moving = false;
    for (const key of Object.keys(goal)) {
      const d = goal[key] - cur[key];
      if (Math.abs(d) > 1e-4) { cur[key] += d * k; moving = true; } else cur[key] = goal[key];
    }
    if (moving || needsRender) {
      applyShot(cur);
      composer.render(dt);
      needsRender = false;
    }
    if (moving) rafId = requestAnimationFrame(tick);
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall() ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    floor.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    layoutTitle();
    Object.assign(cur, goalFromScroll());
    requestRender();
  }
  window.addEventListener('resize', onResize);
  onResize();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });

  // for automated checks
  window.__u9 = { scene, camera, renderer, composer, bloom, spot, cur, shots: SHOTS, requestRender, isSettled: () => rafId === 0 && !needsRender };
}

/* ------------------------------------------------------------------ helpers */
function requestRender() { requestRenderImpl(); }

function smooth(a, b, x) { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerpShot(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

function setupMenu() {
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'Menu'; };
  btn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Close' : 'Menu';
    if (open) menu.querySelector('a').focus();
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
}

/* Dark studio used only for reflections on the car paint, glass and chrome. */
function buildStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const panel = (w, h, intensity, color = 0xffffff) =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
  // soft grey surround: gives the metallic paint a red base from every angle instead of black
  const wallGeo = new THREE.CylinderGeometry(11, 11, 12, 48, 1, true);
  const wallCols = [];
  const pos = wallGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + 6) / 12, 0, 1);
    const v = THREE.MathUtils.lerp(0.22, 0.04, t);
    wallCols.push(v, v, v * 1.05);
  }
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCols, 3));
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  wall.position.y = 5; env.add(wall);
  // big softbox above
  const top = panel(2.2, 6, 2.2); top.rotation.x = Math.PI / 2; top.position.set(0, 6, -0.6); env.add(top);
  // ring of tall strips at a distance (gives long vertical highlights from every angle)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const s = panel(0.9, 3.6, 1.4, 0xdfe6ff);
    s.position.set(Math.sin(a) * 9, 2.2, Math.cos(a) * 9);
    s.lookAt(0, 2.2, 0);
    env.add(s);
  }
  // faint floor bounce
  const fl = panel(40, 40, 0.06); fl.rotation.x = -Math.PI / 2; env.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}

/* DRLs and light strips glow: keep only the bright parts of the lights texture as emission. */
function makeLightsGlow(m) {
  const img = m.map.image;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, w, h);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    const k = Math.min(1, Math.max(0, (l - 0.55) / 0.35));
    p[i] *= k; p[i + 1] *= k; p[i + 2] *= k;
  }
  cx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = m.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.channel = m.map.channel;
  t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT;
  m.emissiveMap = t;
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveIntensity = 18.0;
  m.needsUpdate = true;
}

function buildBackdrop() {
  const geo = new THREE.CylinderGeometry(34, 34, 30, 64, 1, true);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uLow: { value: new THREE.Color(HORIZON) }, uHigh: { value: new THREE.Color(0x000000) } },
    vertexShader: /* glsl */`varying float vY; void main(){ vY = (modelMatrix * vec4(position,1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLow, uHigh; varying float vY;
      void main(){
        float t = smoothstep(0.0, 11.0, vY);          // glow sits on the horizon, fades upward
        vec3 c = mix(uLow, uHigh, pow(t, 0.6));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 15 - 0.5;
  m.renderOrder = -1;
  return m;
}

function buildContactShadow() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.5, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 7.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 1;
  return m;
}

/* Soft volumetric-looking cone of light under the overhead spot. */
function buildBeam() {
  const h = 9.2;
  const geo = new THREE.CylinderGeometry(0.25, 3.4, h, 64, 24, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(0xfff4ea) }, uStrength: { value: 0.15 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vView; varying float vY;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vY = wp.y;
        vec4 mv = viewMatrix * wp;
        vView = -mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vView; varying float vY;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vView)));
        float edge = pow(facing, 2.2);                 // soft edges
        float fall = smoothstep(0.6, 9.0, vY);         // brighter towards the lamp
        fall = pow(fall, 1.5);
        float nearCar = smoothstep(1.3, 4.0, vY);      // don't wash over the car
        float a = edge * fall * mix(0.15, 1.0, nearCar) * uStrength;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(0, 9.2, 0.4);
  beam.renderOrder = 2;
  return beam;
}

function buildReflectionBars() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8ecff).multiplyScalar(0.28), fog: false, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(0.55, 6);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.11 + Math.sin(i * 7.3) * 0.08;
    const r = 22 + ((i * 5) % 7) * 1.2;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.sin(a) * r, 3.2, Math.cos(a) * r);
    m.lookAt(0, 3.2, 0);
    m.layers.set(1);                 // invisible to the main camera, visible to the floor's reflection camera
    g.add(m);
  }
  return g;
}

async function buildTitle() {
  try { await document.fonts.load('400 120px Michroma'); } catch (e) { /* fall back to whatever loaded */ }
  const W = 3000, H = 620;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.textAlign = 'center';
  cx.textBaseline = 'alphabetic';
  // line 1: brand, small and widely tracked
  cx.font = '400 74px Michroma';
  drawTracked(cx, 'BYD YANGWANG', W / 2, 150, 0.42);
  // line 2: model, large
  cx.font = '400 300px Michroma';
  drawTracked(cx, 'U9 XTREME', W / 2, 520, 0.06);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const worldW = 7.4, worldH = worldW * (H / W);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(0.86, 0.86, 0.86), fog: true }),
  );
  mesh.position.set(0, TITLE_Y, TITLE_Z);
  mesh.layers.set(2);              // main camera only: keep the title out of the floor reflection
  mesh.userData.width = worldW;
  mesh.renderOrder = 0;
  return mesh;
}
function drawTracked(cx, text, x, y, tracking) {
  const size = parseFloat(cx.font.match(/(\d+)px/)[1]);
  const sp = size * tracking;
  const widths = [...text].map((ch) => cx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + sp * (text.length - 1);
  let px = x - total / 2;
  cx.textAlign = 'left';
  [...text].forEach((ch, i) => { cx.fillText(ch, px, y); px += widths[i] + sp; });
  cx.textAlign = 'center';
}
