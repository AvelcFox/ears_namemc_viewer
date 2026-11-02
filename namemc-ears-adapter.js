// NameMC + Ears Mod Integration Adapter

(function() {
  const MAGIC_BLUE = 0x3F23D8;
  const MAGIC_ALFALFA = 0xEA2101;

  let currentSkinCanvas = null;
  let earsEnabled = true;
  let activeEarsMeshes = [];

  // Initialize Ears runtime if available
  if (typeof initCommon === 'function') {
    initCommon();
  }

  function detectEars(canvas) {
    if (!canvas || canvas.width < 64 || canvas.height < 64) {
      return { detected: false, format: null, hex: '000000' };
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixel = ctx.getImageData(0, 32, 1, 1).data;
    const rgb = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

    if (rgb === MAGIC_BLUE) {
      return { detected: true, format: 'Magic Blue (Classic)', hex };
    } else if (rgb === MAGIC_ALFALFA) {
      return { detected: true, format: 'Alfalfa (v2)', hex };
    }
    return { detected: false, format: null, hex };
  }

  function convertUV(arr) {
    return new THREE.Vector2(arr[0], 1 - arr[1]);
  }

  function clearEarsMeshes(scene) {
    activeEarsMeshes.forEach(mesh => {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m?.dispose());
      } else {
        mesh.material?.dispose();
      }
    });
    activeEarsMeshes = [];
  }

  function buildEarsModel(skinCanvas, model, isSlim) {
    if (!earsEnabled) return [];

    const dummySkin = document.getElementById('skin');
    if (dummySkin) {
      const dctx = dummySkin.getContext('2d', { willReadFrequently: true });
      dctx.clearRect(0, 0, 64, 64);
      dctx.drawImage(skinCanvas, 0, 0);
    }
    const slimEl = document.getElementById('slim-enabled');
    if (slimEl) slimEl.checked = isSlim;

    if (typeof rebuildQuads !== 'function') {
      console.warn('rebuildQuads not defined');
      return [];
    }

    rebuildQuads();

    const renderObjects = window.renderObjects || [];
    if (!renderObjects.length) return [];

    // Load Alfalfa textures (wings, capes) if present
    const wingsCanvas = document.getElementById('wings');
    let wingsTex = null;
    if (wingsCanvas) {
      const wctx = wingsCanvas.getContext('2d', { willReadFrequently: true });
      wctx.clearRect(0, 0, 20, 16);
      if (window.alfalfaData && window.alfalfaData.wing) {
        const wimg = new Image();
        wimg.onload = () => {
          wctx.drawImage(wimg, 0, 0);
          if (wingsTex) wingsTex.needsUpdate = true;
          const st = window.nameMcRendererState;
          if (st && st.render) st.render();
        };
        wimg.src = 'data:image/png;base64,' + btoa(window.alfalfaData.wing);
      }
      wingsTex = new THREE.CanvasTexture(
        wingsCanvas, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter
      );
    }
    // NameMC children order: [0: head, 1: torso, 2: rightArm, 3: leftArm, 4: rightLeg, 5: leftLeg]
    const armWidth = isSlim ? 3 : 4;
    const bodyParts = {
      head: { obj: model.children[0], w: 8, h: 8, d: 8, yPivotOffset: 0 },
      torso: { obj: model.children[1], w: 8, h: 12, d: 4, yPivotOffset: 0 },
      right_arm: { obj: model.children[2], w: armWidth, h: 12, d: 4, yPivotOffset: 4 },
      left_arm: { obj: model.children[3], w: armWidth, h: 12, d: 4, yPivotOffset: 4 },
      right_leg: { obj: model.children[4], w: 4, h: 12, d: 4, yPivotOffset: 6 },
      left_leg: { obj: model.children[5], w: 4, h: 12, d: 4, yPivotOffset: 6 }
    };

    const skinTex = new THREE.CanvasTexture(
      skinCanvas,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter
    );

    const textures = {
      skin: skinTex,
      wing: wingsTex || skinTex,
      cape: skinTex
    };

    const earsMatParams = {
      reflectivity: -1,
      flatShading: true,
      color: 0xffffff,
      side: THREE.FrontSide,
      alphaTest: 0.1,
      transparent: true
    };

    const newMeshes = [];

    renderObjects.forEach(o => {
      let targetPart = null;
      let mat = new THREE.Matrix4().makeScale(1, 1, -1);

      o.moves.forEach(m => {
        if (m.type === 'anchor') {
          targetPart = bodyParts[m.part];
          if (targetPart) {
            // Anchor relative to part corner
            const tgt = targetPart;
            mat.multiply(new THREE.Matrix4().makeTranslation(
              -tgt.w / 2,
              -tgt.h / 2 + tgt.yPivotOffset,
              -tgt.d / 2
            ));
          }
        } else if (m.type === 'translate') {
          mat.multiply(new THREE.Matrix4().makeTranslation(m.x, -m.y, m.z));
        } else if (m.type === 'scale') {
          mat.multiply(new THREE.Matrix4().makeScale(m.x, m.y, m.z));
        } else if (m.type === 'rotate') {
          mat.multiply(new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(-m.x, m.y, -m.z),
            THREE.Math.degToRad(m.ang)
          ));
        }
      });

      if (!targetPart) return;

      if (o.type === 'quad') {
        const geom = new THREE.PlaneGeometry(o.width, o.height);
        geom.faceVertexUvs[0] = [
          [convertUV(o.uvs[3]), convertUV(o.uvs[0]), convertUV(o.uvs[2])],
          [convertUV(o.uvs[0]), convertUV(o.uvs[1]), convertUV(o.uvs[2])]
        ];
        geom.translate(o.width / 2, -o.height / 2, 0);
        geom.applyMatrix4(mat);
        geom.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
          ...earsMatParams,
          side: o.back ? THREE.BackSide : THREE.FrontSide,
          map: textures[o.texture] || skinTex
        });

        const mesh = new THREE.Mesh(geom, material);
        targetPart.obj.add(mesh);
        newMeshes.push(mesh);
      }
    });

    return newMeshes;
  }

  // Hook into NameMC Renderer
  const originalLoadSkin = window.nameMcRenderer.loadSkin;
  const originalSetModel = window.nameMcRenderer.setModel;

  window.nameMcRenderer.loadSkinWithEars = async function(source) {
    await originalLoadSkin(source);
    currentSkinCanvas = document.createElement('canvas');
    currentSkinCanvas.width = 64;
    currentSkinCanvas.height = 64;
    const ctx = currentSkinCanvas.getContext('2d', { willReadFrequently: true });
    
    // Draw current image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      updateEarsState();
    };
    img.src = typeof source === 'string' ? source : (source.src || '');
  };

  function updateEarsState() {
    if (!currentSkinCanvas) return;
    const detection = detectEars(currentSkinCanvas);
    const badge = document.getElementById('ears-badge');
    const pixelInfo = document.getElementById('info-pixel');
    const earsStatus = document.getElementById('info-ears-status');
    const quadsInfo = document.getElementById('info-quads-count');
    const earsDetails = document.getElementById('ears-details');

    if (pixelInfo) pixelInfo.textContent = `${detection.hex} ${detection.format ? '(' + detection.format + ')' : '(Standard)'}`;
    
    if (detection.detected) {
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = detection.format.includes('Alfalfa') ? 'Ears (Alfalfa)' : 'Ears Active';
      }
      if (earsStatus) {
        earsStatus.textContent = 'Обнаружен (' + detection.format + ')';
        earsStatus.style.color = '#c084fc';
      }
      if (earsDetails) {
        earsDetails.style.display = 'block';
        const list = document.getElementById('ears-features-list');
        if (list && window.renderObjects) {
          const objs = window.renderObjects;
          const hasEars = objs.some(o => o.moves.some(m => m.part === 'head' && o.height >= 8));
          const hasSnout = objs.some(o => o.moves.some(m => m.part === 'head' && o.width === 4 && o.height <= 2));
          const hasWings = objs.some(o => o.texture === 'wing');
          const hasTail = objs.some(o => o.moves.some(m => m.part === 'torso' && o.texture !== 'wing'));

          let html = '';
          if (hasEars) html += '<li>Уши (Ears: Cat / Around)</li>';
          if (hasSnout) html += '<li>Мордочка (Snout: 4x2x2)</li>';
          if (hasWings) html += '<li>Крылья (Wings: Symmetric Single 20x16)</li>';
          if (hasTail) html += '<li>Хвост (Tail: Active)</li>';
          else html += '<li style="color:var(--text-muted);">Хвост: отключён (Tail: None)</li>';
          list.innerHTML = html;
        }
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (earsStatus) {
        earsStatus.textContent = 'Не обнаружен (Vanilla)';
        earsStatus.style.color = '#93c5fd';
      }
      if (earsDetails) earsDetails.style.display = 'none';
    }

    // Rebuild Ears meshes on current model
    const state = window.nameMcRendererState;
    if (state && state.model) {
      clearEarsMeshes();
      if (detection.detected && earsEnabled) {
        activeEarsMeshes = buildEarsModel(currentSkinCanvas, state.model, state.modelType === 'slim');
      }
      if (quadsInfo) quadsInfo.textContent = activeEarsMeshes.length + ' элементов';
      if (state.render) state.render();
    }
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('skin-canvas');
    
    await window.nameMcRenderer.init({
      canvas: canvas,
      model: 'slim',
      theta: 30,
      phi: 15,
      time: 90,
      skin: 'skin.png'
    });

    // Save image to canvas
    currentSkinCanvas = document.createElement('canvas');
    currentSkinCanvas.width = 64;
    currentSkinCanvas.height = 64;
    const cctx = currentSkinCanvas.getContext('2d', { willReadFrequently: true });
    
    const skinImg = new Image();
    skinImg.onload = () => {
      cctx.drawImage(skinImg, 0, 0);
      updateEarsState();
    };
    skinImg.src = 'skin.png';

    // Controls
    let isPlaying = false;
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        isPlaying = !isPlaying;
        window.nameMcRenderer.setPlaying(isPlaying);
        btnPlay.textContent = isPlaying ? 'Пауза анимации' : 'Включить анимацию';
      });
      // Start playing by default
      isPlaying = true;
      window.nameMcRenderer.setPlaying(true);
    }

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        window.nameMcRenderer.setAngles({ theta: 30, phi: 15, time: 90 });
      });
    }

    const toggleEars = document.getElementById('toggle-ears');
    if (toggleEars) {
      toggleEars.addEventListener('change', () => {
        earsEnabled = toggleEars.checked;
        updateEarsState();
      });
    }

    const btnLoadUser = document.getElementById('btn-load-user');
    const inputUser = document.getElementById('input-username');
    if (btnLoadUser && inputUser) {
      btnLoadUser.addEventListener('click', async () => {
        const username = inputUser.value.trim();
        if (!username) return;
        document.getElementById('info-username').textContent = username;
        // Fetch skin via Crafatar / Minotar
        const url = `https://minotar.net/skin/${encodeURIComponent(username)}`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
          cctx.clearRect(0, 0, 64, 64);
          cctx.drawImage(img, 0, 0);
          await window.nameMcRenderer.loadSkin(url);
          updateEarsState();
        };
        img.onerror = () => {
          alert('Не удалось загрузить скин игрока ' + username);
        };
        img.src = url;
      });
    }

    const inputFile = document.getElementById('input-file');
    if (inputFile) {
      inputFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
            cctx.clearRect(0, 0, 64, 64);
            cctx.drawImage(img, 0, 0);
            await window.nameMcRenderer.loadSkin(event.target.result);
            document.getElementById('info-username').textContent = file.name;
            updateEarsState();
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  });

  window.earsAdapter = {
    detectEars,
    updateEarsState,
    buildEarsModel
  };
})();
