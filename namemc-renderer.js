const THREE = window.THREE;
const TAU = Math.PI * 2;
const EPSILON = 0.001;

const UV = [
  [
    [[[16,8,8,8],[0,8,8,8],[8,0,8,8],[16,7,8,-8],[8,8,8,8],[24,8,8,8]],[[48,8,8,8],[32,8,8,8],[40,0,8,8],[48,7,8,-8],[40,8,8,8],[56,8,8,8]]],
    [[[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,19,8,-4],[20,20,8,12],[32,20,8,12]]],
    [[[[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,19,4,-4],[44,20,4,12],[52,20,4,12]],[[47,20,4,12],[40,20,4,12],[44,16,3,4],[47,19,3,-4],[44,20,3,12],[51,20,3,12]]]],
    [[[[43,20,-4,12],[51,20,-4,12],[47,16,-4,4],[51,19,-4,-4],[47,20,-4,12],[55,20,-4,12]],[[43,20,-4,12],[50,20,-4,12],[46,16,-3,4],[49,19,-3,-4],[46,20,-3,12],[53,20,-3,12]]]],
    [[[8,20,4,12],[0,20,4,12],[4,16,4,4],[8,19,4,-4],[4,20,4,12],[12,20,4,12]]],
    [[[3,20,-4,12],[11,20,-4,12],[7,16,-4,4],[11,19,-4,-4],[7,20,-4,12],[15,20,-4,12]]]
  ],
  [
    [[[16,8,8,8],[0,8,8,8],[8,0,8,8],[16,7,8,-8],[8,8,8,8],[24,8,8,8]],[[48,8,8,8],[32,8,8,8],[40,0,8,8],[48,7,8,-8],[40,8,8,8],[56,8,8,8]]],
    [[[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,19,8,-4],[20,20,8,12],[32,20,8,12]],[[28,36,4,12],[16,36,4,12],[20,32,8,4],[28,35,8,-4],[20,36,8,12],[32,36,8,12]]],
    [[[[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,19,4,-4],[44,20,4,12],[52,20,4,12]],[[47,20,4,12],[40,20,4,12],[44,16,3,4],[47,19,3,-4],[44,20,3,12],[51,20,3,12]]],[[[48,36,4,12],[40,36,4,12],[44,32,4,4],[48,35,4,-4],[44,36,4,12],[52,36,4,12]],[[47,36,4,12],[40,36,4,12],[44,32,3,4],[47,35,3,-4],[44,36,3,12],[51,36,3,12]]]],
    [[[[40,52,4,12],[32,52,4,12],[36,48,4,4],[40,51,4,-4],[36,52,4,12],[44,52,4,12]],[[39,52,4,12],[32,52,4,12],[36,48,3,4],[39,51,3,-4],[36,52,3,12],[43,52,3,12]]],[[[56,52,4,12],[48,52,4,12],[52,48,4,4],[56,51,4,-4],[52,52,4,12],[60,52,4,12]],[[55,52,4,12],[48,52,4,12],[52,48,3,4],[55,51,3,-4],[52,52,3,12],[59,52,3,12]]]],
    [[[8,20,4,12],[0,20,4,12],[4,16,4,4],[8,19,4,-4],[4,20,4,12],[12,20,4,12]],[[8,36,4,12],[0,36,4,12],[4,32,4,4],[8,35,4,-4],[4,36,4,12],[12,36,4,12]]],
    [[[24,52,4,12],[16,52,4,12],[20,48,4,4],[24,51,4,-4],[20,52,4,12],[28,52,4,12]],[[8,52,4,12],[0,52,4,12],[4,48,4,4],[8,51,4,-4],[4,52,4,12],[12,52,4,12]]]
  ]
];

const state = {
  canvas: null,
  image: null,
  model: null,
  scene: null,
  camera: null,
  renderer: null,
  modelType: 'slim',
  theta: 30,
  phi: 21,
  time: 90,
  playing: false,
  animationId: null,
  drag: null
};

const radians = degrees => degrees * TAU / 360;

function imageToCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function bitmap(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

function hasAlpha(data) {
  for (let index = 3; index < data.data.length; index += 4) if (data.data[index] < 255) return true;
  return false;
}

function opaqueCopy(canvas) {
  const data = bitmap(canvas);
  for (let index = 3; index < data.data.length; index += 4) data.data[index] = 255;
  return data;
}

function colorGeometry(geometry, pixels, rectangles) {
  if (!rectangles) return null;
  const faces = [];
  const materials = [];
  const materialByAlpha = [];
  let faceIndex = 0;
  let side = THREE.FrontSide;

  rectangles.forEach(rectangle => {
    const horizontalStep = 4 * Math.sign(rectangle[2]);
    const verticalStep = 4 * Math.sign(rectangle[3]) * pixels.width;
    const start = 4 * (rectangle[1] * pixels.width + rectangle[0]);
    const end = start + 4 * rectangle[3] * pixels.width;

    for (let row = start, rowEnd = start + 4 * rectangle[2]; row !== end; row += verticalStep, rowEnd += verticalStep) {
      for (let pixel = row; pixel !== rowEnd; pixel += horizontalStep, faceIndex += 2) {
        const alpha = pixels.data[pixel + 3];
        if (alpha < 255) side = THREE.DoubleSide;
        if (alpha === 0) continue;

        let materialIndex = materialByAlpha[alpha];
        if (materialIndex === undefined) {
          materialIndex = materials.length;
          materialByAlpha[alpha] = materialIndex;
          materials.push(new THREE.MeshLambertMaterial({ vertexColors: THREE.FaceColors, opacity: alpha / 255, transparent: alpha < 255 }));
        }

        const first = geometry.faces[faceIndex];
        const second = geometry.faces[faceIndex + 1];
        first.color.setRGB(pixels.data[pixel] / 255, pixels.data[pixel + 1] / 255, pixels.data[pixel + 2] / 255);
        second.color.copy(first.color);
        first.materialIndex = second.materialIndex = materialIndex;
        faces.push(first, second);
      }
    }
  });

  if (!faces.length) return null;
  geometry.faces = faces;
  const bufferGeometry = new THREE.BufferGeometry().fromGeometry(geometry);
  materials.forEach(material => { material.side = side; });
  return new THREE.Mesh(bufferGeometry, materials);
}

function addLayer(group, geometry, pixels, rectangles) {
  const mesh = colorGeometry(geometry, pixels, rectangles);
  if (mesh) group.add(mesh);
}

function buildModel(imageCanvas, slim) {
  if (imageCanvas.width < 64 || imageCanvas.height < 32) throw new Error('皮肤尺寸无效');
  const version = imageCanvas.height >= 64 ? 1 : 0;
  const armWidth = slim ? 3 : 4;
  const pixels = bitmap(imageCanvas);
  const alpha = hasAlpha(pixels);
  const base = alpha ? opaqueCopy(imageCanvas) : pixels;

  const head = new THREE.Object3D();
  head.position.set(0, 12, 0);
  addLayer(head, new THREE.BoxGeometry(8, 8, 8, 8, 8, 8), base, UV[version][0][0]);
  if (alpha) addLayer(head, new THREE.BoxGeometry(9, 9, 9, 8, 8, 8), pixels, UV[version][0][1]);

  const torso = new THREE.Object3D();
  torso.position.set(0, 2, 0);
  addLayer(torso, new THREE.BoxGeometry(8 + EPSILON, 12 + EPSILON, 4 + EPSILON, 8, 12, 4), base, UV[version][1][0]);
  if (version && alpha) addLayer(torso, new THREE.BoxGeometry(8.5 + EPSILON, 12.5 + EPSILON, 4.5 + EPSILON, 8, 12, 4), pixels, UV[version][1][1]);

  const rightArm = new THREE.Object3D();
  rightArm.position.set(slim ? -5.5 : -6, 6, 0);
  addLayer(rightArm, new THREE.BoxGeometry(armWidth, 12, 4, armWidth, 12, 4).translate(0, -4, 0), base, UV[version][2][0][slim ? 1 : 0]);
  if (version && alpha) addLayer(rightArm, new THREE.BoxGeometry(armWidth + .5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, armWidth, 12, 4).translate(0, -4, 0), pixels, UV[version][2][1][slim ? 1 : 0]);

  const leftArm = new THREE.Object3D();
  leftArm.position.set(slim ? 5.5 : 6, 6, 0);
  addLayer(leftArm, new THREE.BoxGeometry(armWidth, 12, 4, armWidth, 12, 4).translate(0, -4, 0), base, UV[version][3][0][slim ? 1 : 0]);
  if (version && alpha) addLayer(leftArm, new THREE.BoxGeometry(armWidth + .5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, armWidth, 12, 4).translate(0, -4, 0), pixels, UV[version][3][1][slim ? 1 : 0]);

  const rightLeg = new THREE.Object3D();
  rightLeg.position.set(-2, -4, 0);
  addLayer(rightLeg, new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0), base, UV[version][4][0]);
  if (version && alpha) addLayer(rightLeg, new THREE.BoxGeometry(4.5 + EPSILON * 2, 12.5 + EPSILON * 2, 4.5 + EPSILON * 2, 4, 12, 4).translate(0, -6, 0), pixels, UV[version][4][1]);

  const leftLeg = new THREE.Object3D();
  leftLeg.position.set(2, -4, 0);
  addLayer(leftLeg, new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0), base, UV[version][5][0]);
  if (version && alpha) addLayer(leftLeg, new THREE.BoxGeometry(4.5 + EPSILON * 3, 12.5 + EPSILON * 3, 4.5 + EPSILON * 3, 4, 12, 4).translate(0, -6, 0), pixels, UV[version][5][1]);

  const model = new THREE.Object3D();
  model.add(head, torso, rightArm, leftArm, rightLeg, leftLeg);
  return model;
}

function disposeModel(model) {
  if (!model) return;
  model.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach(material => material.dispose());
  });
}

function render() {
  if (!state.model) return;
  state.model.rotation.x = radians(state.phi);
  state.model.rotation.y = radians(state.theta);
  const angle = Math.sin(radians(state.time));
  state.model.children[2].rotation.x = -radians(18) * angle;
  state.model.children[3].rotation.x = radians(18) * angle;
  state.model.children[4].rotation.x = radians(20) * angle;
  state.model.children[5].rotation.x = -radians(20) * angle;
  state.renderer.render(state.scene, state.camera);
}

function emitAngles() {
  window.dispatchEvent(new CustomEvent('namemc-angle-change', { detail: { theta: state.theta, phi: state.phi, time: state.time } }));
}

function animationLoop(now) {
  state.time = (now - state.startTime) * (360 / 1500) % 1440;
  render();
  emitAngles();
  state.animationId = requestAnimationFrame(animationLoop);
}

function setPlaying(playing) {
  state.playing = playing;
  if (playing && !state.animationId) {
    state.startTime = performance.now() - state.time * (1500 / 360);
    state.animationId = requestAnimationFrame(animationLoop);
  } else if (!playing && state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}

function enableDragging() {
  const start = (x, y, id) => { state.drag = { x, y, id }; };
  const move = (x, y, id) => {
    if (!state.drag || state.drag.id !== id) return false;
    state.theta += x - state.drag.x;
    state.phi = Math.max(-90, Math.min(90, state.phi + y - state.drag.y));
    state.drag = { x, y, id };
    render();
    emitAngles();
    return true;
  };
  const end = id => { if (state.drag?.id === id) state.drag = null; };

  state.canvas.addEventListener('mousedown', event => { event.preventDefault(); start(event.screenX, event.screenY, 'mouse'); });
  window.addEventListener('mousemove', event => move(event.screenX, event.screenY, 'mouse'));
  window.addEventListener('mouseup', () => end('mouse'));
  state.canvas.addEventListener('touchstart', event => { const touch = event.changedTouches[0]; start(touch.screenX, touch.screenY, touch.identifier); }, { passive: true });
  state.canvas.addEventListener('touchmove', event => { const touch = event.changedTouches[0]; if (move(touch.screenX, touch.screenY, touch.identifier)) event.preventDefault(); }, { passive: false });
  state.canvas.addEventListener('touchend', event => end(event.changedTouches[0]?.identifier));
  state.canvas.addEventListener('touchcancel', event => end(event.changedTouches[0]?.identifier));
}

function configureCanvas() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  state.canvas.width = Math.round(180 * ratio);
  state.canvas.height = Math.round(360 * ratio);
  state.canvas.style.width = '180px';
  state.canvas.style.height = '360px';
  state.camera.aspect = state.canvas.width / state.canvas.height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(state.canvas.width, state.canvas.height, false);
  render();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('皮肤图片载入失败'));
    image.src = source;
  });
}

async function loadSkin(source) {
  const image = await loadImage(source);
  const replacement = buildModel(imageToCanvas(image), state.modelType === 'slim');
  if (state.model) {
    state.scene.remove(state.model);
    disposeModel(state.model);
  }
  state.image = image;
  state.model = replacement;
  state.scene.add(replacement);
  render();
}

async function init(options) {
  state.canvas = options.canvas;
  state.modelType = options.model;
  state.theta = options.theta;
  state.phi = options.phi;
  state.time = options.time;

  state.scene = new THREE.Scene();
  state.scene.add(new THREE.AmbientLight(0xffffff, .7));
  const directional = new THREE.DirectionalLight(0xffffff, .3);
  directional.position.set(.678, .284, .678);
  state.scene.add(directional);

  state.camera = new THREE.PerspectiveCamera(38, .5, 40, 80);
  state.camera.position.set(0, 0, 60);
  state.camera.lookAt(new THREE.Vector3(0, 0, 0));
  state.renderer = new THREE.WebGLRenderer({ canvas: state.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  configureCanvas();
  window.addEventListener('resize', configureCanvas);
  enableDragging();
  await loadSkin(options.skin);
}

function setModel(modelType) {
  state.modelType = modelType;
  if (!state.image) return;
  const replacement = buildModel(imageToCanvas(state.image), modelType === 'slim');
  state.scene.remove(state.model);
  disposeModel(state.model);
  state.model = replacement;
  state.scene.add(replacement);
  render();
}

function setAngles(next) {
  state.theta = Number.isFinite(next.theta) ? next.theta : state.theta;
  state.phi = Number.isFinite(next.phi) ? Math.max(-90, Math.min(90, next.phi)) : state.phi;
  state.time = Number.isFinite(next.time) ? next.time : state.time;
  render();
  emitAngles();
}

window.nameMcRenderer = {
  init,
  loadSkin,
  setModel,
  setAngles,
  setPlaying,
  capture() { render(); return state.canvas.toDataURL('image/png'); },
  inspect() { return { revision: THREE.REVISION, theta: state.theta, phi: state.phi, time: state.time, model: state.modelType, lights: state.scene.children.slice(0, 2).map(light => ({ type: light.type, intensity: light.intensity, position: light.position.toArray() })), camera: { fov: state.camera.fov, near: state.camera.near, far: state.camera.far, position: state.camera.position.toArray() }, canvas: { width: state.canvas.width, height: state.canvas.height, cssWidth: state.canvas.clientWidth, cssHeight: state.canvas.clientHeight } }; }
};
state.render = render;
window.nameMcRendererState = state;
