'use client';

import { useDashboard } from './context';
import { Cat } from './CatLogo';

export function TweaksPanel() {
  const { logo, layout, glow, tweaksOpen, setLogo, setLayout, setGlow, setTweaksOpen } = useDashboard();
  const glowNorm = glow / 100;

  return (
    <>
      <div className={`tweaks-panel${tweaksOpen ? ' open' : ''}`}>
        <div className="tweaks-title">
          <span>Tweaks</span>
          <button
            className="btn-ghost"
            style={{ padding: '4px 8px', fontSize: 16 }}
            onClick={() => setTweaksOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="tweaks-section">
          <div className="tweaks-section-label">Cat logo</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-around', padding: '6px 0 10px' }}>
            {(['tail', 'ears', 'mono'] as const).map((variant) => (
              <div
                key={variant}
                style={{
                  textAlign: 'center', cursor: 'pointer', flex: 1,
                  padding: '8px 0', borderRadius: 8,
                  border: `1px solid ${logo === variant ? 'oklch(0.72 0.22 295)' : 'rgba(255,255,255,0.08)'}`,
                  background: logo === variant ? 'oklch(0.55 0.18 295 / 0.18)' : 'transparent',
                  opacity: logo === variant ? 1 : 0.6,
                  transition: 'all 0.15s',
                }}
                onClick={() => setLogo(variant)}
              >
                <Cat variant={variant} size={26} glow={glowNorm} />
                <div style={{ fontSize: 9, marginTop: 4, color: '#a4a4b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {variant.charAt(0).toUpperCase() + variant.slice(1)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tweaks-section">
          <div className="tweaks-section-label">Layout</div>
          <div className="tweak-radio">
            {(['default', 'editor'] as const).map((v) => (
              <button key={v} className={layout === v ? 'active' : ''} onClick={() => setLayout(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="tweaks-section">
          <div className="tweaks-section-label">Neon</div>
          <div className="tweak-slider-wrap">
            <label>
              <span>Glow</span>
              <span className="mono" style={{ color: 'var(--violet)' }}>{glow}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={glow}
              onChange={(e) => setGlow(parseInt(e.target.value))}
              style={{ '--p': `${(glow / 200) * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>
      </div>

      {tweaksOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setTweaksOpen(false)}
        />
      )}
    </>
  );
}
