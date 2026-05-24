/* global React, ReactDOM, PERIODS, CITIES, YEAR_MIN, YEAR_MAX */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Background reference outline = modern Russia
const REF_OUTLINE = window.MODERN_RUSSIA;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function findPeriod(year) {
  // Returns index of the latest period whose .year <= given year
  let idx = 0;
  for (let i = 0; i < PERIODS.length; i++) {
    if (PERIODS[i].year <= year) idx = i;
    else break;
  }
  return idx;
}

// --- Header HUD ----------------------------------------------------------
function HudTop({ year, periodIdx }) {
  return (
    <div className="hud-top">
      <div className="brand">
        <div className="brand-mark">
          <div className="ring"></div>
          <div className="ring inner"></div>
          <div className="cross"></div>
          <div className="cross h"></div>
        </div>
        <div className="brand-text">
          <div className="title">КАРТА РОССИИ</div>
          <div className="sub">Атлас границ &nbsp;·&nbsp; 862 — 2020</div>
        </div>
      </div>
      <div className="hud-meta">
        <div className="hud-chip">ЭПОХА {String(periodIdx + 1).padStart(2, "0")}/{String(PERIODS.length).padStart(2, "0")}</div>
        <div className="hud-chip">ГОД {year}</div>
      </div>
    </div>
  );
}

// --- Left stack ----------------------------------------------------------
// //<div className="row"><b>ЗЕМЕЛЬ</b><span className="val">{period.territories.length}</span></div>//
function LeftStack({ period }) {
  return (
    <div className="left-stack">
      <div className="row"><b>ЭПОХА</b><span className="val">{period.subtitle}</span></div>
      <div className="row"><b>ГОД</b><span className="val">{period.year}</span></div>
    </div>
  );
}

// --- Year banner --------------------------------------------------------
function YearBanner({ year, label }) {
  return (
    <div className="year-banner">
      <div className="year">{year}</div>
      <div className="era">{label}</div>
    </div>
  );
}

// --- Info panel ---------------------------------------------------------
function InfoPanel({ period, periodIdx }) {
  return (
    <div className="info" key={periodIdx} style={{ animation: "fade-in 0.5s ease" }}>
      <div className="info-head">
        <div className="tag">// ИСТОРИЧЕСКАЯ СПРАВКА</div>
        <div className="idx">[{String(periodIdx + 1).padStart(2, "0")}/{String(PERIODS.length).padStart(2, "0")}]</div>
      </div>
      <h2>{period.title}</h2>
      <div className="sub">{period.subtitle} · {period.year}</div>
      <p className="body">{period.body}</p>
      <div className="info-foot">
        <div className="legend">
          {period.territories.map((t, i) => (
            <span key={i}>
              <span className={"swatch " + (t.color || "magenta")}></span>{t.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Map ----------------------------------------------------------------
function AtlasMap({ period, periodIdx, showGrid, showCities, showRef }) {
  const visibleCities = useMemo(
    () => CITIES.filter(c =>
      c.since <= period.year && (!c.until || period.year < c.until)
    ),
    [period.year]
  );

  // Latitude/longitude graticule
  const lons = [20, 40, 60, 80, 100, 120, 140, 160];
  const lats = [70, 60, 50, 40];
  // y = (75 - lat) * 20 ; x = (lon - 10) * 9.4
  const yForLat = (lat) => (75 - lat) * 20;
  const xForLon = (lon) => (lon - 10) * 9.4;

  return (
    <svg className="map-svg" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="terr-grad" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#ff8ad8" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#ff2d95" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ff2d95" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Graticule */}
      {showGrid && (
        <g className="graticule">
          {lons.map((lon, i) => (
            <line key={"lon" + i}
              x1={xForLon(lon)} y1="40"
              x2={xForLon(lon)} y2="760"
              className={"grid-line " + ((lon % 40 === 0) ? "major" : "")} />
          ))}
          {lats.map((lat, i) => (
            <line key={"lat" + i}
              x1="20" y1={yForLat(lat)}
              x2="1580" y2={yForLat(lat)}
              className={"grid-line " + ((lat % 20 === 0) ? "major" : "")} />
          ))}
        </g>
      )}

      {/* Neighbor country outlines (geographic context) */}
      {showRef && (
        <g className="neighbors">
          {window.NEIGHBORS.map((n) => {
            const paths = n.paths || (n.path ? [n.path] : []);
            return (
              <g key={n.name}>
                {paths.map((d, j) => (
                  <path key={j} d={d} className="neighbor-shape" />
                ))}
                <text x={n.label.x} y={n.label.y} className="neighbor-label" textAnchor="middle">
                  {n.name}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Reference: modern Russia outline */}
      {showRef && <path d={REF_OUTLINE} className="ref-outline" />}

      {/* Compass */}
      <g className="compass" transform="translate(80, 60)">
        <circle cx="0" cy="0" r="22" fill="none" stroke="rgba(255,82,177,0.5)" strokeWidth="1" />
        <circle cx="0" cy="0" r="3" fill="#ff52b1" />
        <line x1="0" y1="-20" x2="0" y2="-32" stroke="#ff52b1" strokeWidth="1.2" />
        <line x1="0" y1="20" x2="0" y2="32" stroke="rgba(255,82,177,0.4)" strokeWidth="1.2" />
        <line x1="-20" y1="0" x2="-32" y2="0" stroke="rgba(255,82,177,0.4)" strokeWidth="1.2" />
        <line x1="20" y1="0" x2="32" y2="0" stroke="rgba(255,82,177,0.4)" strokeWidth="1.2" />
        <text x="0" y="-40" textAnchor="middle">С</text>
      </g>

      {/* Scale bar */}
      <g transform="translate(80, 720)">
        <line x1="0" y1="0" x2="180" y2="0" stroke="rgba(255,138,216,0.6)" strokeWidth="1.5" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(255,138,216,0.8)" strokeWidth="1.5" />
        <line x1="90" y1="-3" x2="90" y2="3" stroke="rgba(255,138,216,0.6)" strokeWidth="1.2" />
        <line x1="180" y1="-4" x2="180" y2="4" stroke="rgba(255,138,216,0.8)" strokeWidth="1.5" />
        <text x="0" y="20" fill="rgba(255,138,216,0.7)"
          fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2">
          ~2000 км
        </text>
      </g>

      {/* Territories */}
      <g key={"period-" + periodIdx} className="territories">
        {period.territories.map((t, i) => {
          const paths = t.paths || (t.path ? [t.path] : []);
          return (
            <g key={i}
              style={{ animation: "terr-in 0.9s ease both", animationDelay: (i * 0.08) + "s" }}>
              {paths.map((d, j) => (
                <path
                  key={j}
                  d={d}
                  className={[
                    "terr",
                    t.color || "magenta",
                    t.dashed ? "dashed" : ""
                  ].filter(Boolean).join(" ")}
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* Cities */}
      {showCities && (
        <g className="cities">
          {visibleCities.map((c, i) => (
            <g key={c.name} className={"city city-" + (c.kind || "ru")}
              transform={`translate(${c.x}, ${c.y})`}
              style={{ animation: "city-in 0.6s ease both", animationDelay: (i * 0.04) + "s" }}>
              {c.kind === "cap" ? (
                <>
                  <circle className="ring" cx="0" cy="0" r="5" />
                  <circle className="dot" cx="0" cy="0" r="1.6" />
                  <text x="7" y="4">{c.name}</text>
                </>
              ) : (
                <>
                  <circle className="ring" cx="0" cy="0" r="9" />
                  <circle className="ring" cx="0" cy="0" r="4.5" opacity="0.85" />
                  <circle className="dot" cx="0" cy="0" r="2.4" />
                  <text x="10" y="-8">{c.name}</text>
                </>
              )}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// --- Timeline -----------------------------------------------------------
function Timeline({ year, setYear, playing, setPlaying, speed, setSpeed, periodIdx }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const yearFromX = (x) => {
    const r = trackRef.current.getBoundingClientRect();
    const pct = clamp((x - r.left) / r.width, 0, 1);
    return Math.round(YEAR_MIN + pct * (YEAR_MAX - YEAR_MIN));
  };

  const onPointerDown = (e) => {
    dragging.current = true;
    trackRef.current.setPointerCapture(e.pointerId);
    setYear(yearFromX(e.clientX));
    setPlaying(false);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setYear(yearFromX(e.clientX));
  };
  const onPointerUp = (e) => {
    dragging.current = false;
    try { trackRef.current.releasePointerCapture(e.pointerId); } catch (_) { }
  };

  // Major tick years (round centuries / events)
  const majorTickYears = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
  const minorTickYears = [];
  for (let y = 900; y <= 2000; y += 50) {
    if (!majorTickYears.includes(y)) minorTickYears.push(y);
  }

  const pctFromYear = (y) => ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

  return (
    <div className="timeline">
      <div className="tl-head">
        <div className="tl-controls">
          <button className="btn primary" onClick={() => setPlaying(p => !p)}>
            {playing
              ? (<><span className="pause-icon"></span> ПАУЗА</>)
              : (<><span className="play-icon"></span> ВОСПРОИЗВЕСТИ</>)}
          </button>
          <button className="btn" onClick={() => { setYear(YEAR_MIN); setPlaying(false); }}>« СБРОС</button>
          <button className="btn" onClick={() => {
            const prev = PERIODS[Math.max(0, periodIdx - 1)];
            setYear(prev.year); setPlaying(false);
          }}>‹ НАЗАД</button>
          <button className="btn" onClick={() => {
            const next = PERIODS[Math.min(PERIODS.length - 1, periodIdx + 1)];
            setYear(next.year); setPlaying(false);
          }}>ВПЕРЁД ›</button>
          <div className="speed-pill">
            {[0.5, 1, 2, 4].map(s => (
              <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="tl-year-readout">
          <span className="small">ТЕКУЩИЙ ГОД</span>{year}
        </div>
      </div>

      <div className="slider">
        <div className="slider-track" ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}>
        </div>
        <div className="slider-hit"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => setYear(yearFromX(e.clientX))} />

        {/* minor ticks */}
        {minorTickYears.map(y => (
          <div key={"mn" + y} className="tick" style={{ left: pctFromYear(y) + "%" }} />
        ))}
        {/* major ticks */}
        {majorTickYears.map(y => (
          <React.Fragment key={"mj" + y}>
            <div className="tick major" style={{ left: pctFromYear(y) + "%" }} />
            <div className="tick-label" style={{ left: pctFromYear(y) + "%" }}>{y}</div>
          </React.Fragment>
        ))}

        {/* events */}
        {PERIODS.map((p, i) => (
          <div
            key={p.year}
            className={"event " + (i === periodIdx ? "active" : "")}
            style={{ left: pctFromYear(p.year) + "%" }}
            onClick={(e) => { e.stopPropagation(); setYear(p.year); setPlaying(false); }}
            title={p.title}>
            <div className="lbl">{p.year} · {p.title}</div>
            <div className="stem"></div>
            <div className="node"></div>
          </div>
        ))}

        {/* handle */}
        <div className="handle" style={{ left: pctFromYear(year) + "%" }}>
          <div className="tip"></div>
          <div className="bar"></div>
          <div className="tip-shadow"></div>
        </div>
      </div>

      <div className="tl-foot">
        <span>◀ {YEAR_MIN} г.</span>
        <span>ТЯНИТЕ ИЛИ КЛИКНИТЕ ПО ШКАЛЕ · ОТМЕЧЕНЫ КЛЮЧЕВЫЕ СОБЫТИЯ</span>
        <span>{YEAR_MAX} г. ▶</span>
      </div>
    </div>
  );
}

// --- Background --------------------------------------------------------
function Background() {
  return (
    <div className="bg-shell">
      <div className="stars"></div>
      <div className="sun"></div>
      <div className="grid-floor"></div>
    </div>
  );
}

// --- Tweaks ------------------------------------------------------------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showGrid": true,
  "showCities": true,
  "showRef": true,
  "glow": "high",
  "palette": "magenta-cyan"
}/*EDITMODE-END*/;

function ChronosTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply palette by setting CSS vars on :root
  useEffect(() => {
    const root = document.documentElement;
    const palettes = {
      "magenta-cyan": { magenta: "#ff2d95", magentaHot: "#ff52b1", cyan: "#22e4ff", cyanSoft: "#7ff3ff", pink: "#ff8ad8" },
      "violet-mint": { magenta: "#b537f2", magentaHot: "#cc5cff", cyan: "#6cffb3", cyanSoft: "#b0ffd6", pink: "#d8a8ff" },
      "amber-cyan": { magenta: "#ff8a3d", magentaHot: "#ffaa66", cyan: "#22e4ff", cyanSoft: "#7ff3ff", pink: "#ffc299" }
    };
    const p = palettes[t.palette] || palettes["magenta-cyan"];
    root.style.setProperty("--magenta", p.magenta);
    root.style.setProperty("--magenta-hot", p.magentaHot);
    root.style.setProperty("--cyan", p.cyan);
    root.style.setProperty("--cyan-soft", p.cyanSoft);
    root.style.setProperty("--pink-soft", p.pink);
    root.style.setProperty("--grid", p.magenta.replace(")", ", 0.18)").replace("#", "rgba("));
  }, [t.palette]);

  // Glow intensity → body class
  useEffect(() => {
    document.body.dataset.glow = t.glow;
  }, [t.glow]);

  // Bridge tweak state to window so the app reads it
  useEffect(() => {
    window.__chronosTweaks = t;
    window.dispatchEvent(new CustomEvent("chronos-tweaks", { detail: t }));
  }, [t]);

  return (
    <TweaksPanel title="Настройки">
      <TweakSection title="Слои карты">
        <TweakToggle label="Сетка" value={t.showGrid} onChange={v => setTweak("showGrid", v)} />
        <TweakToggle label="Города" value={t.showCities} onChange={v => setTweak("showCities", v)} />
        <TweakToggle label="Контур и соседи" value={t.showRef} onChange={v => setTweak("showRef", v)} />
      </TweakSection>
      <TweakSection title="Визуальный стиль">
        <TweakRadio label="Свечение" value={t.glow} options={["low", "high"]} onChange={v => setTweak("glow", v)} />
        <TweakSelect label="Палитра" value={t.palette}
          options={[
            { value: "magenta-cyan", label: "Маджента / Голубой" },
            { value: "violet-mint", label: "Фиолет / Мята" },
            { value: "amber-cyan", label: "Янтарь / Голубой" }
          ]}
          onChange={v => setTweak("palette", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

// --- App ---------------------------------------------------------------
function App() {
  // 'landing' → 'map' (3D globe). Landing fades while the globe canvas
  // fades up underneath — the SVG sunrise rim and the cobe globe overlap
  // for the seamless dive-in.
  const [phase, setPhase] = useState("landing");
  const [keepLanding, setKeepLanding] = useState(true);
  const entered = phase !== "landing";
  const [shellIn, setShellIn] = useState(false);
  const [year, setYear] = useState(YEAR_MIN);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);

  // Mount the map shell immediately when entering, so the globe is already
  // alive while the landing is fading out on top of it.
  useEffect(() => {
    if (phase === "map") {
      const t = setTimeout(() => setShellIn(true), 40);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // After the landing fade finishes, unmount it for good.
  useEffect(() => {
    if (phase === "map") {
      const t = setTimeout(() => setKeepLanding(false), 1300);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Listen for tweak changes
  useEffect(() => {
    const h = (e) => setTweaks({ ...e.detail });
    window.addEventListener("chronos-tweaks", h);
    return () => window.removeEventListener("chronos-tweaks", h);
  }, []);

  const periodIdx = findPeriod(year);
  const period = PERIODS[periodIdx];

  // Playback loop — auto-advance year
  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(80, now - last);
      last = now;
      setYear(y => {
        // ~30 years per second at 1× speed
        const inc = (dt / 1000) * 30 * speed;
        const ny = y + inc;
        if (ny >= YEAR_MAX) {
          setPlaying(false);
          return YEAR_MAX;
        }
        return ny;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  // Keyboard
  useEffect(() => {
    if (!entered) return;
    const onKey = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying(p => !p);
      }
      if (e.key === "ArrowRight") {
        const step = e.shiftKey ? 10 : 1;
        setYear(y => clamp(Math.round(y) + step, YEAR_MIN, YEAR_MAX));
        setPlaying(false);
      }
      if (e.key === "ArrowLeft") {
        const step = e.shiftKey ? 10 : 1;
        setYear(y => clamp(Math.round(y) - step, YEAR_MIN, YEAR_MAX));
        setPlaying(false);
      }
      if (e.key === "Home") { setYear(YEAR_MIN); setPlaying(false); }
      if (e.key === "End") { setYear(YEAR_MAX); setPlaying(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered]);

  const yearInt = Math.round(year);

  return (
    <>
      {keepLanding && phase === "landing" && <Landing onEnter={() => setPhase("map")} />}
      {keepLanding && phase === "map" && <Landing onEnter={() => { }} initialExiting={true} />}
      <div className={"app-shell " + (shellIn ? "in" : "")}>
        <Background />
        <HudTop year={yearInt} periodIdx={periodIdx} />
        <YearBanner year={yearInt} label={period.title} />
        <LeftStack period={period} />
        <div className="stage">
          <div className="map-wrap">
            <Globe3DMap
              period={period}
              periodIdx={periodIdx}
              showCities={tweaks.showCities}
              showRef={tweaks.showRef}
              autoSpin={false}
            />
          </div>
        </div>
        <InfoPanel period={period} periodIdx={periodIdx} />
        <Timeline
          year={yearInt}
          setYear={(y) => setYear(clamp(y, YEAR_MIN, YEAR_MAX))}
          playing={playing}
          setPlaying={setPlaying}
          speed={speed}
          setSpeed={setSpeed}
          periodIdx={periodIdx}
        />
        <ChronosTweaks />
        <div className="scanlines"></div>
        <div className="vignette"></div>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
