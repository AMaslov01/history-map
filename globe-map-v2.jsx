/* global React, Globe, topojson */
/* eslint-disable */
// ------------------------------------------------------------------
// Globe3DMap — Google-Earth-style satellite globe with accurate
// country borders (real GeoJSON), distinct colors per neighbor, and
// historical Russian territories overlaid for the current period.
//
// Implementation:
//   • globe.gl (three.js wrapper) draws the sphere with NASA's Blue
//     Marble texture as the base — looks like the satellite view in
//     Google Earth.
//   • Country borders/fills come from world-atlas (110m TopoJSON),
//     decoded with topojson-client into real GeoJSON polygons. These
//     are painted ONTO the sphere as `polygonsData` — they rotate
//     rigidly with the globe.
//   • For each historical period we synthesise extra polygon features
//     from the SVG paths in data.js (converted x,y → lon,lat) and
//     paint them on top at a slightly higher altitude so they sit
//     visibly above the modern country fills.
//   • OrbitControls (built into globe.gl) gives natural drag rotation.
// ------------------------------------------------------------------
const { useEffect, useRef, useState } = React;

// World borders — 110m resolution is plenty for this view and ~100KB.
const COUNTRIES_URL = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";
// NASA Blue Marble, shipped as the three-globe example asset.
// We post-process it into a warm sepia terrain map on load.
const EARTH_TEX = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
const TOPO_TEX  = "https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png";

// ---- Build a warm "antique terrain" texture from the Blue Marble.
// Returns a CANVAS element with proper warm-sepia land + deep-dark oceans.
// The caller wraps it in a THREE.CanvasTexture so we can set colorSpace
// correctly (data URL / blob URL paths lose sRGB metadata and the globe
// renders as a flat orange ball).
function buildWarmTerrainTextureCanvas(){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Downsample to 2048×1024 — plenty for a 500-1000px-wide globe.
      const W = 2048, H = 1024;

      // -- Pass 1: detect ocean pixels in the ORIGINAL imagery
      const c0 = document.createElement("canvas");
      c0.width = W; c0.height = H;
      const ctx0 = c0.getContext("2d");
      ctx0.drawImage(img, 0, 0, W, H);
      const od = ctx0.getImageData(0, 0, W, H).data;
      const oceanMask = new Uint8Array((od.length / 4) | 0);
      for (let i = 0, j = 0; i < od.length; i += 4, j++){
        const r = od[i], g = od[i+1], b = od[i+2];
        if (b > r + 6 && b > g + 4 && b > 25) oceanMask[j] = 1;
      }

      // -- Pass 2: warm sepia pass over the whole image (we'll overwrite
      //    ocean pixels in pass 3)
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.filter = "sepia(0.45) saturate(0.80) contrast(1.20)";
      ctx.drawImage(img, 0, 0, W, H);
      ctx.filter = "none";

      // -- Pass 3: overwrite oceans with deep dark warm ink
      const id = ctx.getImageData(0, 0, W, H);
      const d = id.data;
      for (let i = 0, j = 0; i < d.length; i += 4, j++){
        if (oceanMask[j]){
          d[i]   = 18;
          d[i+1] = 13;
          d[i+2] = 9;
        }
      }
      ctx.putImageData(id, 0, 0);

      window.__warmTex = { ok: true, w: W, h: H };
      resolve(c);
    };
    img.onerror = (e) => {
      window.__warmTex = { ok: false, err: "img.onerror" };
      reject(e);
    };
    img.src = EARTH_TEX;
  });
}

// ---- Russian + neighbour palette ----------------------------------
// Each is a {fill, side, stroke} triple. Fills are intentionally
// translucent so the satellite texture shows through and the globe
// still reads as Earth.
const NEIGHBOR_PALETTE = {
  "Russia":        { fill: "rgba(231,128,46,0.42)",  stroke: "rgba(255,234,200,0.85)" },
  "Ukraine":       { fill: "rgba(247,212,90,0.42)",  stroke: "rgba(255,234,200,0.75)" },
  "Belarus":       { fill: "rgba(140,196,108,0.42)", stroke: "rgba(255,234,200,0.75)" },
  "Poland":        { fill: "rgba(231,90,90,0.36)",   stroke: "rgba(255,234,200,0.7)"  },
  "Lithuania":     { fill: "rgba(132,196,208,0.42)", stroke: "rgba(255,234,200,0.7)"  },
  "Latvia":        { fill: "rgba(95,164,232,0.40)",  stroke: "rgba(255,234,200,0.7)"  },
  "Estonia":       { fill: "rgba(186,212,255,0.42)", stroke: "rgba(255,234,200,0.7)"  },
  "Finland":       { fill: "rgba(112,140,232,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "Norway":        { fill: "rgba(176,148,232,0.36)", stroke: "rgba(255,234,200,0.6)"  },
  "Sweden":        { fill: "rgba(204,176,236,0.34)", stroke: "rgba(255,234,200,0.6)"  },
  "Germany":       { fill: "rgba(212,168,128,0.30)", stroke: "rgba(255,234,200,0.55)" },
  "Romania":       { fill: "rgba(232,168,108,0.32)", stroke: "rgba(255,234,200,0.55)" },
  "Moldova":       { fill: "rgba(247,196,108,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "Georgia":       { fill: "rgba(180,228,164,0.44)", stroke: "rgba(255,234,200,0.8)"  },
  "Armenia":       { fill: "rgba(231,160,196,0.44)", stroke: "rgba(255,234,200,0.8)"  },
  "Azerbaijan":    { fill: "rgba(116,196,180,0.44)", stroke: "rgba(255,234,200,0.8)"  },
  "Turkey":        { fill: "rgba(231,120,96,0.32)",  stroke: "rgba(255,234,200,0.55)" },
  "Iran":          { fill: "rgba(176,212,160,0.30)", stroke: "rgba(255,234,200,0.5)"  },
  "Kazakhstan":    { fill: "rgba(247,184,84,0.42)",  stroke: "rgba(255,234,200,0.78)" },
  "Uzbekistan":    { fill: "rgba(220,212,108,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "Turkmenistan":  { fill: "rgba(228,164,124,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "Kyrgyzstan":    { fill: "rgba(247,168,164,0.42)", stroke: "rgba(255,234,200,0.7)"  },
  "Tajikistan":    { fill: "rgba(184,148,212,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "Afghanistan":   { fill: "rgba(208,176,140,0.30)", stroke: "rgba(255,234,200,0.5)"  },
  "China":         { fill: "rgba(231,108,84,0.32)",  stroke: "rgba(255,234,200,0.55)" },
  "Mongolia":      { fill: "rgba(220,176,116,0.40)", stroke: "rgba(255,234,200,0.7)"  },
  "North Korea":   { fill: "rgba(208,140,180,0.36)", stroke: "rgba(255,234,200,0.6)"  },
  "South Korea":   { fill: "rgba(180,196,231,0.32)", stroke: "rgba(255,234,200,0.55)" },
  "Japan":         { fill: "rgba(231,148,148,0.32)", stroke: "rgba(255,234,200,0.55)" },
};
const DEFAULT_FILL = "rgba(120,100,72,0.10)";
const DEFAULT_STROKE = "rgba(255,234,200,0.18)";

// ---- Historical territory colors --------------------------------
// Solid, high-opacity colors that pop against the warm sepia terrain.
// Translucency was producing a halftone-stipple pattern (alpha-test
// cutoff in globe.gl's polygon material) so we keep alpha >= 0.85 —
// territories then render like a political-atlas plate.
// Historical borders are drawn as outlines (no fill) in BRIGHT colors that
// match the info-panel legend swatches (redesign.css). Modern country borders
// are drawn white/faint underneath, so these must stay bright & saturated.
const HIST_COLORS = {
  magenta: { stroke: "rgba(255,138,38,1)" }, // --warm-2 orange (Russia)
  cyan:    { stroke: "rgba(61,213,255,1)"  }, // bright cyan
  amber:   { stroke: "rgba(255,194,51,1)"  }, // gold
  mint:    { stroke: "rgba(95,224,138,1)"  }, // green
  violet:  { stroke: "rgba(199,125,255,1)" }, // violet
};

// ---- SVG-path → GeoJSON ring -------------------------------------
// Existing data uses x = (lon-10)*9.4, y = (75-lat)*20. After converting,
// we densify edges so triangulation produces smooth great-circle-ish
// curves on the sphere instead of long chord cuts.
function svgPathToCoords(d){
  if (!d) return [];
  const t = d.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const raw = [];
  for (let i = 0; i < t.length; i++){
    const c = t[i];
    if (c === "M" || c === "L" || c === "m" || c === "l") continue;
    if (c === "Z" || c === "z") continue;
    const x = parseFloat(c);
    const y = parseFloat(t[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)){
      const lon = x / 9.4 + 10;
      const lat = 75 - y / 20;
      raw.push([lon, lat]);
      i++;
    }
  }
  if (raw.length < 2) return raw;

  // Densify: every segment <= 2° of arc, so the polygon's flat
  // triangulation hugs the sphere closely.
  const STEP = 2.0;
  const dense = [];
  for (let i = 0; i < raw.length; i++){
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    dense.push(a);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > STEP){
      const n = Math.ceil(len / STEP);
      for (let k = 1; k < n; k++){
        const tt = k / n;
        dense.push([a[0] + dx * tt, a[1] + dy * tt]);
      }
    }
  }
  // Close the ring
  if (dense[0][0] !== dense[dense.length-1][0] || dense[0][1] !== dense[dense.length-1][1]){
    dense.push([dense[0][0], dense[0][1]]);
  }

  // Enforce counter-clockwise winding. three-globe follows the right-hand
  // rule: it fills the side to the LEFT of the ring, so a CCW exterior ring
  // renders the small interior. Our SVG paths are drawn clockwise on screen
  // and the y→lat flip (lat = 75 - y/20) keeps them clockwise in lon/lat, so
  // three-globe would otherwise paint the COMPLEMENT — flooding the whole
  // globe with the territory color and leaving the real territory as a hole.
  let area2 = 0;
  for (let i = 0; i < dense.length - 1; i++){
    area2 += dense[i][0] * dense[i + 1][1] - dense[i + 1][0] * dense[i][1];
  }
  if (area2 < 0) dense.reverse();
  return dense;
}

function territoryToFeatures(t, idx){
  const paths = t.paths || (t.path ? [t.path] : []);
  const rings = paths.map(svgPathToCoords).filter(r => r.length >= 4);
  if (rings.length === 0) return [];
  const out = [];
  rings.forEach((ring, ri) => {
    // Clip against the land mask so polygons don't paint over oceans/seas.
    const clipped = clipRingToLand(ring);
    clipped.forEach((poly, pi) => {
      // poly is an array of rings: [outer, hole1, hole2...]
      // Treat each clipped poly as its own feature so globe.gl renders
      // each landmass piece individually.
      if (!poly[0] || poly[0].length < 4) return;
      out.push({
        type: "Feature",
        properties: {
          __hist: true,
          __name: t.name,
          __color: t.color || "magenta",
          __dashed: !!t.dashed,
          __key: `hist-${idx}-${ri}-${pi}`
        },
        geometry: { type: "Polygon", coordinates: poly }
      });
    });
  });
  return out;
}

// ---- Cached fetch of world borders --------------------------------
let _bordersPromise = null;
let _landMask = null; // MultiPolygon coords array, used to clip historical polys
function loadBorders(){
  if (_bordersPromise) return _bordersPromise;
  _bordersPromise = fetch(COUNTRIES_URL)
    .then(r => r.json())
    .then(world => {
      // topojson-client → real GeoJSON FeatureCollection
      const fc = window.topojson.feature(world, world.objects.countries);
      const features = fc.features.map(f => ({
        ...f,
        properties: { ...f.properties, __country: true }
      }));
      // Build a land mask for clipping. polygon-clipping expects an array
      // of polygons (each polygon = array of rings).
      try {
        const polys = [];
        for (const f of features){
          const g = f.geometry;
          if (!g) continue;
          if (g.type === "Polygon"){
            polys.push(g.coordinates);
          } else if (g.type === "MultiPolygon"){
            for (const p of g.coordinates) polys.push(p);
          }
        }
        // Union into one big multipolygon — used as the clip mask.
        if (window.polygonClipping){
          _landMask = window.polygonClipping.union(...polys);
        }
      } catch(err){ console.warn("land-mask build failed", err); }
      return features;
    })
    .catch(err => { console.error("borders load failed", err); return []; });
  return _bordersPromise;
}

// Clip a single ring against the land mask, returning a (possibly multi-)
// polygon. Falls back to the original ring if clipping fails or isn't ready.
function clipRingToLand(ring){
  if (!_landMask || !window.polygonClipping){
    if (!_clipWarned){ console.log("clipRingToLand: no mask yet", { hasMask: !!_landMask, hasLib: !!window.polygonClipping }); _clipWarned = true; }
    return [[ring]];
  }
  try {
    const result = window.polygonClipping.intersection([[ring]], _landMask);
    if (result && result.length){
      return result;
    } else {
      // No intersection — historical polygon was entirely ocean (rare for
      // our hand-drawn data, but possible for small offsets). Keep the
      // original so the user sees SOMETHING.
      return [[ring]];
    }
  } catch(e){
    console.warn("clipRingToLand failed", e);
    return [[ring]];
  }
}
let _clipWarned = false;

// ---- City marker as a canvas sprite (dot + Cyrillic name) -----------
// globe.gl's `labelsData` renders extruded text from a typeface font whose
// glyph set has no Cyrillic — it draws "????" for Russian names. A 2D canvas
// does render Cyrillic, so we build the marker as a THREE.Sprite from a canvas.
// Sprites depth-test against the globe (far-side cities are occluded) and are
// positioned by globe.gl, so the markers stay hard-locked to the surface.
function makeCityLabelObject(d){
  const THREE = window.THREE;
  const isCap = d.kind === "cap";
  const dpr   = Math.min(window.devicePixelRatio || 1, 2);
  const fontPx = isCap ? 28 : 36;
  const weight = isCap ? 500 : 600;
  const dotR   = isCap ? 5 : 7;
  const gap = 10, padX = 10, padY = 10;
  const font = `${weight} ${fontPx}px "Inter", Arial, sans-serif`;

  const meas = document.createElement("canvas").getContext("2d");
  meas.font = font;
  const textW = Math.ceil(meas.measureText(d.name).width);

  const W = padX + dotR * 2 + gap + textW + padX;
  const H = padY * 2 + Math.max(fontPx, dotR * 2);
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const cy = H / 2;
  const dotX = padX + dotR;

  // dot (warm glow)
  ctx.beginPath(); ctx.arc(dotX, cy, dotR, 0, Math.PI * 2);
  ctx.shadowColor = "rgba(255,170,80,0.9)"; ctx.shadowBlur = 12;
  ctx.fillStyle = isCap ? "rgba(255,234,200,0.95)" : "#ffffff";
  ctx.fill();
  ctx.shadowBlur = 0;

  // name (Cyrillic-safe via canvas)
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 6;
  ctx.fillStyle = isCap ? "rgba(255,234,200,0.88)" : "#ffffff";
  ctx.fillText(d.name, dotX + dotR + gap, cy + 1);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearFilter;

  // depthTest:false so the flat sprite quad never clips into the curved globe
  // near the limb; far-side labels are hidden by manual culling on rotate.
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  // Anchor the DOT (not the box centre) on the geographic point.
  sprite.center.set(dotX / W, 0.5);
  const targetH = isCap ? 1.9 : 2.6; // world units tall (globe radius ~100)
  sprite.scale.set(targetH * (W / H), targetH, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// =====================================================================
function Globe3DMap({ period, periodIdx, showCities, showRef, autoSpin = false }){
  const wrapRef  = useRef(null);
  const globeRef = useRef(null);
  const countriesRef = useRef([]);
  const cityObjsRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [countriesReady, setCountriesReady] = useState(false);

  // ---- One-time init ----
  useEffect(() => {
    if (!wrapRef.current || !window.Globe) return;
    const el = wrapRef.current;

    const globe = window.Globe()(el)
      .backgroundColor("rgba(0,0,0,0)")
      // Bright NASA Blue Marble satellite imagery + topographic relief. We keep
      // the warm orange atmosphere below so the globe still matches the theme.
      .globeImageUrl(EARTH_TEX)
      .bumpImageUrl(TOPO_TEX)
      .showAtmosphere(true)
      .atmosphereColor("#ff9b3a")
      .atmosphereAltitude(0.14)
      .polygonsTransitionDuration(700)
      // Historical border sits on top (0.006); modern country borders form a
      // faint white backdrop just above the surface (0.0015).
      .polygonAltitude(d => d.properties.__hist ? 0.006 : 0.0015)
      // No fills anywhere — everything is an outline, so there's no orange wash
      // and no fill to "flood" the globe regardless of ring winding.
      .polygonCapColor(() => "rgba(0,0,0,0)")
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor(d => {
        if (d.properties.__hist){
          return HIST_COLORS[d.properties.__color]?.stroke || HIST_COLORS.magenta.stroke;
        }
        // Modern-day country borders: faint white geographic reference.
        return "rgba(255,255,255,0.22)";
      })
      .polygonLabel(d => {
        if (d.properties.__hist){
          return `<div class="globe-tip"><b>${d.properties.__name}</b></div>`;
        }
        return d.properties.name
          ? `<div class="globe-tip">${d.properties.name}</div>`
          : "";
      });

    // Camera: point at Russia, zoomed in so the globe fills the viewport
    // (no black letterbox top/bottom).
    globe.pointOfView({ lat: 55, lng: 75, altitude: 1.55 }, 0);

    // Controls: gentle auto-rotate if requested, natural drag direction
    const controls = globe.controls();
    controls.enableZoom = true;
    controls.minDistance = 150;
    controls.maxDistance = 460;
    controls.autoRotate = !!autoSpin;
    controls.autoRotateSpeed = 0.45;
    controls.rotateSpeed = 0.7;
    // OrbitControls drag direction is correct by default; nothing to flip.

    // Hide city labels on the far hemisphere as the globe rotates. A surface
    // point P (centre at origin) faces the camera C when dot(P, C) > |P|².
    const cullCityLabels = () => {
      const cam = globeRef.current && globeRef.current.camera();
      if (!cam) return;
      for (const o of cityObjsRef.current){
        if (o) o.visible = o.position.dot(cam.position) > o.position.lengthSq();
      }
    };
    controls.addEventListener("change", cullCityLabels);

    // Use the globe.gl defaults — adding directional warm light was
    // washing the texture orange.

    // Expose globe for debugging
    window.__globe = globe;

    globeRef.current = globe;

    // Lift the default lighting a touch so the satellite day-side reads bright
    // (the old warm-sepia post-processing made the globe look dark) while a
    // gentle directional still gives the terminator some dimension.
    try {
      const scene = globe.scene();
      scene.traverse(o => {
        if (o.isAmbientLight)     o.intensity = 1.25;
        if (o.isDirectionalLight) o.intensity = 0.95;
      });
    } catch(_){}

    // Resize handler
    const ro = new ResizeObserver(() => {
      if (!globeRef.current) return;
      globeRef.current.width(el.clientWidth).height(el.clientHeight);
    });
    ro.observe(el);
    globeRef.current.width(el.clientWidth).height(el.clientHeight);

    // Historical borders are baked locally (window.HISTORICAL_BORDERS) — ready
    // immediately. Modern country borders (faint white backdrop) load async
    // from world-atlas; re-render the polygon layer when they arrive.
    setReady(true);
    loadBorders().then(features => {
      countriesRef.current = features;
      setCountriesReady(true);
    });

    return () => {
      ro.disconnect();
      try { controls.removeEventListener("change", cullCityLabels); } catch(_){}
      try {
        if (globeRef.current){
          // globe.gl doesn't expose destroy; clear the container.
          el.innerHTML = "";
          globeRef.current = null;
        }
      } catch(_){}
    };
    // eslint-disable-next-line
  }, []);

  // ---- Apply polygons whenever period / toggles change ----
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready) return;

    // Backdrop: modern-day country borders (faint white).
    const modern = countriesRef.current || [];

    // Each legend entity of this era as its own bright outline, in its own
    // legend colour (borders-data.js stores an array of { color, geometry }).
    const entries = (window.HISTORICAL_BORDERS && window.HISTORICAL_BORDERS[period?.year]) || [];
    const hist = entries.map(e => ({
      type: "Feature",
      properties: { __hist: true, __color: e.color || "magenta", __name: period?.title || "" },
      geometry: e.geometry
    }));

    globe.polygonsData([...modern, ...hist]);
  }, [ready, countriesReady, period, periodIdx]);

  // ---- Auto-spin toggle ----
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const c = globe.controls();
    if (c) c.autoRotate = !!autoSpin;
  }, [autoSpin]);

  // ---- Cities as points (optional) ----
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready) return;
    if (!showCities){
      cityObjsRef.current = [];
      globe.customLayerData([]);
      return;
    }
    const cities = (window.CITIES || [])
      .filter(c => c.since <= (period?.year || 0))
      .filter(c => !c.until || (period?.year || 0) < c.until)
      .map(c => ({
        lat: 75 - c.y / 20,
        lng: c.x / 9.4 + 10,
        name: c.name,
        kind: c.kind || "ru"
      }));
    // Canvas sprites in the WebGL scene → Cyrillic renders correctly and the
    // markers are hard-locked to the surface. We track the created sprites so
    // we can cull the far-side ones as the globe rotates (see cullCityLabels).
    cityObjsRef.current = [];
    globe
      .customLayerData(cities)
      .customThreeObject(d => {
        const o = makeCityLabelObject(d);
        cityObjsRef.current.push(o);
        return o;
      })
      .customThreeObjectUpdate((obj, d) => {
        const c = globe.getCoords(d.lat, d.lng, 0.012);
        obj.position.set(c.x, c.y, c.z);
        const cam = globe.camera();
        if (cam) obj.visible = obj.position.dot(cam.position) > obj.position.lengthSq();
      });
  }, [ready, showCities, period, periodIdx]);

  return (
    <div className="globe3d-host">
      <div className="globe3d-mount" ref={wrapRef} />
    </div>
  );
}

window.Globe3DMap = Globe3DMap;
