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
// Translucency was producing a halftone-stipple pattern (alpha test) so
// we keep alpha >= 0.85 — territories read like a political-atlas plate.
const HIST_COLORS = {
  magenta: { fill: "rgba(232,93,46,0.88)",   stroke: "rgba(255,236,210,1)"   },  // imperial red
  cyan:    { fill: "rgba(86,196,232,0.85)",  stroke: "rgba(220,245,255,1)"   },  // ice blue (Crimea / Alaska)
  amber:   { fill: "rgba(247,184,72,0.88)",  stroke: "rgba(255,236,200,1)"   },
  mint:    { fill: "rgba(126,196,140,0.88)", stroke: "rgba(220,255,228,1)"   },
  violet:  { fill: "rgba(170,128,200,0.88)", stroke: "rgba(232,220,250,1)"   },
};

// ---- SVG-path → GeoJSON ring -------------------------------------
// Existing data uses x = (lon-10)*9.4, y = (75-lat)*20. After converting,
// we densify edges along great circles so triangulation curves with the
// globe instead of cutting chord lines straight through the texture.
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

  // Densify: insert intermediate points so every segment is <= 2 degrees.
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
        const t = k / n;
        dense.push([a[0] + dx * t, a[1] + dy * t]);
      }
    }
  }
  // Close the ring
  if (dense[0][0] !== dense[dense.length-1][0] || dense[0][1] !== dense[dense.length-1][1]){
    dense.push([dense[0][0], dense[0][1]]);
  }
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

// =====================================================================
function Globe3DMap({ period, periodIdx, showCities, showRef, autoSpin = false }){
  const wrapRef  = useRef(null);
  const globeRef = useRef(null);
  const countriesRef = useRef([]);
  const [ready, setReady] = useState(false);

  // ---- One-time init ----
  useEffect(() => {
    if (!wrapRef.current || !window.Globe) return;
    const el = wrapRef.current;

    const globe = window.Globe()(el)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#ff9b3a")
      .atmosphereAltitude(0.14)
      .polygonsTransitionDuration(700)
      .polygonAltitude(d => d.properties.__hist ? 0.008 : 0.003)
      .polygonCapColor(d => {
        if (d.properties.__hist){
          return HIST_COLORS[d.properties.__color]?.fill || HIST_COLORS.magenta.fill;
        }
        const name = d.properties.name;
        return NEIGHBOR_PALETTE[name]?.fill || DEFAULT_FILL;
      })
      .polygonSideColor(d => {
        if (d.properties.__hist) return "rgba(232,93,46,0.55)";
        return "rgba(0,0,0,0.0)";
      })
      .polygonStrokeColor(d => {
        if (d.properties.__hist){
          return HIST_COLORS[d.properties.__color]?.stroke || HIST_COLORS.magenta.stroke;
        }
        const name = d.properties.name;
        return NEIGHBOR_PALETTE[name]?.stroke || DEFAULT_STROKE;
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

    // Use the globe.gl defaults — adding directional warm light was
    // washing the texture orange.

    // Expose globe for debugging
    window.__globe = globe;

    globeRef.current = globe;

    // Build the warm terrain texture asynchronously. We DON'T replace the
    // globe.gl material — that fights with internal re-renders. Instead we
    // grab the existing globeMaterial(), swap its .map with our own
    // CanvasTexture, and force colorSpace explicitly (the blob-URL/data-URL
    // paths lose the sRGB metadata and produce a flat orange globe).
    buildWarmTerrainTextureCanvas().then(canvas => {
      if (!globeRef.current) return;
      try {
        const tex = new window.THREE.CanvasTexture(canvas);
        tex.colorSpace = window.THREE.SRGBColorSpace;
        tex.minFilter = window.THREE.LinearFilter;
        tex.magFilter = window.THREE.LinearFilter;
        tex.anisotropy = 4;
        tex.needsUpdate = true;

        const mat = globeRef.current.globeMaterial();
        if (mat){
          const oldMap = mat.map;
          mat.map = tex;
          if (!mat.color)    mat.color    = new window.THREE.Color(0xffffff);
          if (!mat.emissive) mat.emissive = new window.THREE.Color(0x000000);
          if (!mat.specular) mat.specular = new window.THREE.Color(0x1a1410);
          mat.color.set(0xffffff);
          mat.emissive.set(0x000000);
          mat.specular.set(0x1a1410);
          mat.shininess = 4;
          mat.needsUpdate = true;
          if (oldMap && oldMap.dispose) oldMap.dispose();
        }

        // Tone down lighting so the daytime hemisphere doesn't blow out
        const scene = globeRef.current.scene();
        scene.traverse(o => {
          if (o.isAmbientLight)     o.intensity = 0.9;
          if (o.isDirectionalLight) o.intensity = 1.1;
        });

        window.__warmTexApplied = { ok: true };
      } catch(err){
        window.__warmTexApplied = { ok: false, err: err.message };
      }
    });

    // Resize handler
    const ro = new ResizeObserver(() => {
      if (!globeRef.current) return;
      globeRef.current.width(el.clientWidth).height(el.clientHeight);
    });
    ro.observe(el);
    globeRef.current.width(el.clientWidth).height(el.clientHeight);

    // Load real-world country borders, then mark ready
    loadBorders().then(features => {
      countriesRef.current = features;
      setReady(true);
    });

    return () => {
      ro.disconnect();
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

    const histFeatures = [];
    (period?.territories || []).forEach((t, i) => {
      const feats = territoryToFeatures(t, i);
      if (feats && feats.length) histFeatures.push(...feats);
    });

    // Optionally include modern Russia ghost outline (showRef toggle).
    // The Russia polygon is already in countriesRef; we just highlight
    // it more strongly when showRef is on by tweaking polygonStrokeColor.
    // Here we just rebuild the data with both layers.
    const data = [...countriesRef.current, ...histFeatures];
    globe.polygonsData(data);
  }, [ready, period, periodIdx, showRef]);

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
      globe.htmlElementsData([]);
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
    globe.htmlElementsData(cities)
      .htmlElement(d => {
        const el = document.createElement("div");
        el.className = "globe-city globe-city-" + d.kind;
        el.innerHTML = `<span class="globe-city-dot"></span><span class="globe-city-name">${d.name}</span>`;
        return el;
      });
  }, [ready, showCities, period, periodIdx]);

  return (
    <div className="globe3d-host">
      <div className="globe3d-mount" ref={wrapRef} />
    </div>
  );
}

window.Globe3DMap = Globe3DMap;
