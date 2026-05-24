/* global React */
const { useState, useEffect, useRef } = React;

// --------------------------------------------------------------
// Hero — dark sunrise-over-Earth landing.
// Aesthetic: black background with a glowing orange "terminator"
// arc (the lit edge of Earth as seen from space), large serif
// headline, glass nav, two CTAs.
//
// On "Смотреть карту" click, the planet scales up and rotates as
// if the camera is diving toward Earth; the hero then fades and
// the map view takes over.
// --------------------------------------------------------------
function Hero({ onEnter, initialExiting }) {
  const [exiting, setExiting] = useState(!!initialExiting);

  const begin = () => {
    if (exiting) return;
    setExiting(true);
    // Hand off to the cobe-globe transition almost immediately so the SVG
    // planet and the 3D globe overlap during the dive-in.
    setTimeout(() => onEnter && onEnter(), 350);
  };

  return (
    <div className={"hero " + (exiting ? "hero-exiting" : "")}>
      <HeroStars />
      <HeroPlanet />

      <header className="hero-nav">
        <div className="hero-brand">
          <span className="hero-brand-glyph">◐</span>
          <span className="hero-brand-text">Карта&nbsp;России</span>
        </div>
      </header>

      <div className="hero-center">
        <h1 className="hero-title">
          Сквозь Тысячу&nbsp;Лет<br />
          <span className="hero-title-em">Российской&nbsp;Истории</span>
        </h1>

        <p className="hero-sub">
          Интерактивный атлас изменения границ — от Киевской Руси
          до современной Российской Федерации. Двадцать одна эпоха,
          сотни событий, один масштаб.
        </p>

        <div className="hero-actions">
          <button className="hero-cta-primary" onClick={begin}>
            <span>Смотреть карту</span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 7 H11 M8 4 L11 7 L8 10" stroke="currentColor" strokeWidth="1.6"
                    fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
// Distant Earth — a giant dark circle off-screen with a thin,
// glowing terminator arc on the visible edge. Built with SVG so
// the rim is razor-sharp at any viewport size.
// --------------------------------------------------------------
function HeroPlanet() {
  // Planet center is far below-right of the viewport so the rim
  // arcs from upper-left → lower-right across the canvas.
  return (
    <svg className="hero-planet" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
         aria-hidden="true">
      <defs>
        <radialGradient id="earth-disk" cx="2400" cy="-1300" r="2400" gradientUnits="userSpaceOnUse">
          <stop offset="0"     stopColor="#1a0a02" />
          <stop offset="0.55"  stopColor="#0a0401" />
          <stop offset="0.85"  stopColor="#050100" />
          <stop offset="0.93"  stopColor="#1d0600" />
          <stop offset="0.96"  stopColor="#7a2400" />
          <stop offset="0.982" stopColor="#d65b00" />
          <stop offset="0.99"  stopColor="#ff7a14" />
          <stop offset="0.996" stopColor="#ffd28a" />
          <stop offset="1"     stopColor="#ffeebd" />
        </radialGradient>
        <radialGradient id="earth-halo" cx="2400" cy="-1300" r="2700" gradientUnits="userSpaceOnUse">
          <stop offset="0.84" stopColor="#ff5a14" stopOpacity="0" />
          <stop offset="0.92" stopColor="#ff7a18" stopOpacity="0.55" />
          <stop offset="0.96" stopColor="#ff8a26" stopOpacity="0.35" />
          <stop offset="1"    stopColor="#ff4a00" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hero-vignette" cx="50%" cy="50%" r="80%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
      </defs>

      {/* Atmospheric halo extending beyond the planet rim */}
      <circle cx="2400" cy="-1300" r="2700" fill="url(#earth-halo)" />
      {/* The planet itself */}
      <circle cx="2400" cy="-1300" r="2400" fill="url(#earth-disk)" />
      {/* Corner vignette to deepen the surrounding space */}
      <rect x="0" y="0" width="1440" height="900" fill="url(#hero-vignette)" />
    </svg>
  );
}

// Faint star field
function HeroStars() {
  return (
    <div className="hero-stars" aria-hidden="true">
      {Array.from({ length: 80 }).map((_, i) => {
        const x = (i * 113.7) % 100;
        const y = (i * 71.9) % 100;
        const r = (i % 7 === 0) ? 1.5 : (i % 3 === 0) ? 1.1 : 0.7;
        const o = 0.25 + ((i * 37) % 70) / 100;
        const delay = ((i * 53) % 60) / 10;
        return (
          <span
            key={i}
            className="hero-star"
            style={{
              left:  x.toFixed(2) + "%",
              top:   y.toFixed(2) + "%",
              width:  r.toFixed(2) + "px",
              height: r.toFixed(2) + "px",
              opacity: o.toFixed(2),
              animationDelay: delay.toFixed(2) + "s"
            }}
          />
        );
      })}
    </div>
  );
}

window.Landing = Hero;   // keep the old export name so app.jsx wiring still works
window.Hero    = Hero;
