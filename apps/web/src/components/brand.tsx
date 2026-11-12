/** Nexus Marin ve Yatçılık Hizmetleri logosu (resmi logo görselinden) */
export function LogoMark({ size = 40, full = false }: { size?: number; full?: boolean }) {
  return <img src={full ? '/brand/nexus-logo.png' : '/brand/nexus-emblem.png'} width={size} height={size} alt="Nexus Marin" style={{ borderRadius: '50%', display: 'block', flex: 'none' }} />;
}

export function Logo({ light = true, sub = 'Marin ve Yatçılık Hizmetleri' }: { light?: boolean; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <LogoMark />
      <div className="brand-text">
        <b style={{ color: light ? '#fff' : 'var(--navy)' }}>NEXUS</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/** Dashboard başlığı için yat ve deniz illüstrasyonu */
export function YachtArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 200" preserveAspectRatio="xMaxYMax slice" aria-hidden>
      <defs>
        <linearGradient id="sea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1d5f9e" stopOpacity=".0" />
          <stop offset="1" stopColor="#0d3a66" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="hull" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbe7f3" />
        </linearGradient>
        <linearGradient id="glass" x1="0" x2="1">
          <stop offset="0" stopColor="#0b2342" />
          <stop offset="1" stopColor="#1d4f84" />
        </linearGradient>
        <radialGradient id="sun" cx=".8" cy=".25" r=".5">
          <stop offset="0" stopColor="#7fb7ea" stopOpacity=".55" />
          <stop offset="1" stopColor="#7fb7ea" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="200" fill="url(#sun)" />
      <circle cx="520" cy="56" r="24" fill="#cfe4f8" opacity=".22" />
      <path d="M0 150 Q160 138 320 148 T640 142 V200 H0Z" fill="url(#sea)" />
      <g transform="translate(250 72)">
        <path d="M18 78 L330 78 L300 104 Q290 112 270 112 L52 112 Q30 112 18 78Z" fill="url(#hull)" />
        <path d="M36 96 L300 96" stroke="#1767AD" strokeWidth="3" />
        <path d="M70 78 L110 44 L262 44 L300 78Z" fill="#f3f7fb" />
        <path d="M118 50 L250 50 L276 72 L96 72Z" fill="url(#glass)" />
        <path d="M128 44 L150 22 L236 22 L252 44Z" fill="#e8eff7" />
        <path d="M156 28 L226 28 L236 40 L146 40Z" fill="url(#glass)" />
        <rect x="190" y="4" width="4" height="18" fill="#e8eff7" />
        <rect x="178" y="10" width="28" height="3" rx="1.5" fill="#e8eff7" />
        <path d="M0 120 Q90 112 180 120 T360 118" stroke="#9cc6ee" strokeWidth="2" fill="none" opacity=".5" />
      </g>
      <path d="M0 172 Q120 164 240 172 T480 170 T640 168" stroke="#9cc6ee" strokeWidth="1.5" fill="none" opacity=".35" />
      <path d="M40 186 Q170 178 300 186 T640 182" stroke="#9cc6ee" strokeWidth="1.2" fill="none" opacity=".25" />
    </svg>
  );
}

/** Teknenin fotoğrafı yoksa gösterilen kapak */
export function VesselPlaceholder({ name }: { name?: string }) {
  return (
    <svg viewBox="0 0 400 240" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid slice" aria-label={name}>
      <defs>
        <linearGradient id="vbg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#0b2342" />
          <stop offset="1" stopColor="#1767AD" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#vbg)" />
      <path d="M0 190 Q100 178 200 188 T400 182 V240 H0Z" fill="#07182E" opacity=".55" />
      <g transform="translate(70 100)" opacity=".95">
        <path d="M10 70 L250 70 L228 92 Q220 98 204 98 L40 98 Q22 98 10 70Z" fill="#fff" />
        <path d="M54 70 L84 42 L204 42 L232 70Z" fill="#e9f0f8" />
        <path d="M92 48 L196 48 L216 66 L76 66Z" fill="#0b2342" />
        <path d="M100 42 L118 24 L186 24 L198 42Z" fill="#dde8f3" />
      </g>
    </svg>
  );
}

/** Geniş kapak alanları için fotoğraf yoksa gösterilen arka plan */
export function HeroPlaceholder() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, #07182E 0%, #0B2342 45%, #164a80 100%)' }}>
      <YachtArt className="hero-art" />
    </div>
  );
}
