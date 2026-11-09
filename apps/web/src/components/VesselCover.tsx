import { useId, useState } from 'react';

/**
 * Teknenin kapak görseli.
 * Öncelik: 1) tekneye yüklenmiş fotoğraf  2) public/vessel-models/<marka-model>.jpg  3) modele göre çizim.
 * Örn. Ferretti 780 için gerçek fotoğraf eklemek: apps/web/public/vessel-models/ferretti-780.jpg
 */

type Style = 'flybridge' | 'sport' | 'superyacht' | 'sail';
type Look = { style: Style; hull: string; stripe: string; deck?: string; long?: boolean };

const MODELS: Record<string, Look> = {
  'ferretti-780': { style: 'flybridge', hull: '#ffffff', stripe: '#1b2b3c' },
  'princess-y85': { style: 'flybridge', hull: '#f4f6f8', stripe: '#3b4a5c', long: true },
  'sunseeker-manhattan-68': { style: 'flybridge', hull: '#ffffff', stripe: '#8a96a3' },
  'fairline-squadron-68': { style: 'flybridge', hull: '#ffffff', stripe: '#0d2340' },
  'azimut-grande-27': { style: 'flybridge', hull: '#3a4652', stripe: '#c9d2db', long: true },
  'riva-76-perseo': { style: 'sport', hull: '#2c4766', stripe: '#ffffff', deck: '#a86b3c' },
  'pershing-8x': { style: 'sport', hull: '#aab4be', stripe: '#2b3540' },
  'benetti-delfino-95': { style: 'superyacht', hull: '#ffffff', stripe: '#0d2340' },
  'beneteau-oceanis-60': { style: 'sail', hull: '#ffffff', stripe: '#1767ad' },
};

export const modelSlug = (make?: string | null, model?: string | null) =>
  [make, model]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function lookFor(v: { make?: string | null; model?: string | null; type?: string | null }): Look {
  const known = MODELS[modelSlug(v.make, v.model)];
  if (known) return known;
  const t = (v.type ?? '').toLocaleLowerCase('tr-TR');
  if (t.includes('yelken')) return MODELS['beneteau-oceanis-60'];
  if (t.includes('süper') || t.includes('super')) return MODELS['benetti-delfino-95'];
  return MODELS['ferretti-780'];
}

export function VesselCover({ vessel, photoUrl }: { vessel: { name?: string; make?: string | null; model?: string | null; type?: string | null; lengthM?: number | null }; photoUrl?: string | null }) {
  const slug = modelSlug(vessel.make, vessel.model);
  const [modelPhoto, setModelPhoto] = useState<'loading' | 'ok' | 'none'>('loading');
  return (
    <>
      <VesselArt vessel={vessel} />
      {photoUrl ? (
        <img className="bgimg" src={photoUrl} alt={vessel.name} />
      ) : (
        slug && modelPhoto !== 'none' && (
          <img
            key={slug}
            className="bgimg"
            src={`/vessel-models/${slug}.jpg`}
            alt={vessel.name}
            style={{ opacity: modelPhoto === 'ok' ? 1 : 0, transition: 'opacity .3s' }}
            onLoad={() => setModelPhoto('ok')}
            onError={() => setModelPhoto('none')}
          />
        )
      )}
    </>
  );
}

/** Modelin gövde tipine göre deniz manzaralı tekne çizimi */
export function VesselArt({ vessel }: { vessel: { name?: string; make?: string | null; model?: string | null; type?: string | null; lengthM?: number | null } }) {
  const uid = useId().replace(/:/g, '');
  const look = lookFor(vessel);
  const len = vessel.lengthM ?? 24;
  const scale = Math.max(0.82, Math.min(1.08, 0.8 + (len - 18) * 0.025)) * (look.long ? 1.03 : 1);
  const id = (s: string) => `${s}-${uid}`;
  const boat = <Boat look={look} id={id} />;
  // Su hattı y=330; tekne çerçevesinde su hattı y=270
  const tx = 1180 - 600 * scale;
  const ty = 330 - 270 * scale;

  return (
    <svg className="vessel-art" viewBox="0 0 1200 420" preserveAspectRatio="xMaxYMax slice" role="img" aria-label={`${vessel.name ?? ''} ${[vessel.make, vessel.model].filter(Boolean).join(' ')}`}>
      <defs>
        <linearGradient id={id('sky')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#07182e" />
          <stop offset=".55" stopColor="#123f6d" />
          <stop offset="1" stopColor="#3f7fbc" />
        </linearGradient>
        <radialGradient id={id('sun')} cx=".78" cy=".72" r=".45">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity=".75" />
          <stop offset=".4" stopColor="#f5b77a" stopOpacity=".26" />
          <stop offset="1" stopColor="#f5b77a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('sea')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1b4f82" />
          <stop offset="1" stopColor="#06162a" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#0a1a2e" />
          <stop offset=".6" stopColor="#1d3d63" />
          <stop offset="1" stopColor="#3a6a9a" />
        </linearGradient>
        <linearGradient id={id('shine')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".0" />
          <stop offset="1" stopColor="#0b2342" stopOpacity=".18" />
        </linearGradient>
        <linearGradient id={id('refl')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={id('rmask')}>
          <rect x="0" y="330" width="1200" height="90" fill={`url(#${id('refl')})`} />
        </mask>
      </defs>

      <rect width="1200" height="420" fill={`url(#${id('sky')})`} />
      <rect width="1200" height="420" fill={`url(#${id('sun')})`} />
      {/* Uzak kıyı */}
      <path d="M0 312 Q120 296 240 304 T470 298 Q560 288 640 300 T860 296 Q980 286 1080 298 T1200 300 V318 H0Z" fill="#0c2a4a" opacity=".85" />
      {/* Deniz */}
      <rect x="0" y="316" width="1200" height="104" fill={`url(#${id('sea')})`} />
      <rect x="760" y="318" width="420" height="3" fill="#ffd9a0" opacity=".25" />

      {/* Yansıma */}
      <g mask={`url(#${id('rmask')})`} opacity=".55">
        <g transform={`translate(${tx} ${330 + 270 * scale}) scale(${scale} ${-scale})`}>{boat}</g>
      </g>
      {/* Tekne */}
      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>{boat}</g>

      {/* İz ve dalgalar */}
      <path d={`M${tx - 10} 334 Q${tx - 120} 338 ${tx - 300} 334`} stroke="#d8ecff" strokeWidth="2.5" fill="none" opacity=".45" strokeLinecap="round" />
      <path d={`M${tx + 10} 340 Q${tx - 80} 346 ${tx - 220} 344`} stroke="#d8ecff" strokeWidth="1.5" fill="none" opacity=".3" strokeLinecap="round" />
      <path d="M0 372 Q150 364 300 372 T600 370 T900 372 T1200 368" stroke="#9cc6ee" strokeWidth="1.5" fill="none" opacity=".18" />
      <path d="M0 398 Q200 390 400 398 T800 396 T1200 394" stroke="#9cc6ee" strokeWidth="1.2" fill="none" opacity=".14" />
    </svg>
  );
}

/** Tekne profili: 600 genişlik, su hattı y=270, pruva sağda */
function Boat({ look, id }: { look: Look; id: (s: string) => string }) {
  const glass = `url(#${id('glass')})`;
  const shine = `url(#${id('shine')})`;
  const superW = '#f1f5f9';

  if (look.style === 'sail') {
    return (
      <g>
        {/* Direk ve yelkenler */}
        <rect x="268" y="18" width="5" height="212" fill="#dfe6ee" />
        <path d="M266 26 L266 214 L120 214 Z" fill="#f7f9fb" />
        <path d="M266 26 L266 214 L120 214 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
        <path d="M276 30 L520 228 L280 222 Z" fill="#eef3f8" />
        <path d="M276 30 L520 228 L280 222 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
        <path d="M118 214 L268 214" stroke="#1767ad" strokeWidth="5" strokeLinecap="round" />
        <path d="M272 22 L540 232" stroke="#cfd8e2" strokeWidth="1.2" />
        <path d="M268 22 L40 236" stroke="#cfd8e2" strokeWidth="1" />
        {/* Kamara üstü */}
        <path d="M190 236 L210 222 L380 222 L408 236 Z" fill={superW} />
        <path d="M222 232 L232 226 L360 226 L376 232 Z" fill={glass} />
        {/* Gövde */}
        <path d="M30 236 L520 236 Q560 234 584 226 L574 244 Q550 266 500 270 L70 270 Q40 268 34 254 Z" fill={look.hull} />
        <path d="M30 236 L520 236 Q560 234 584 226 L574 244 Q550 266 500 270 L70 270 Q40 268 34 254 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
        <path d="M40 258 L560 250" stroke={look.stripe} strokeWidth="4" />
        <rect x="150" y="242" width="40" height="5" rx="2.5" fill={glass} />
        <rect x="390" y="242" width="24" height="5" rx="2.5" fill={glass} />
      </g>
    );
  }

  if (look.style === 'sport') {
    return (
      <g>
        {/* Gövde — alçak ve uzun */}
        <path d="M6 214 L500 214 Q560 212 600 200 L590 220 Q570 256 520 268 L60 270 Q20 270 10 250 Z" fill={look.hull} />
        <path d="M6 214 L500 214 Q560 212 600 200 L590 220 Q570 256 520 268 L60 270 Q20 270 10 250 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
        {look.deck && <path d="M6 214 L500 214 Q560 212 600 200 L598 204 Q560 216 500 218 L8 218 Z" fill={look.deck} />}
        <path d="M30 246 L540 240" stroke={look.stripe} strokeWidth="2.5" opacity=".9" />
        {/* Gövde camları */}
        <path d="M250 228 L400 228 Q410 228 404 234 L254 234 Q246 234 250 228 Z" fill={glass} />
        {/* Üst yapı — akıcı hardtop */}
        <path d="M110 214 L150 196 L250 182 L420 178 Q470 182 520 214 Z" fill={superW} />
        <path d="M170 206 L196 192 L420 186 Q455 192 486 210 Z" fill={glass} />
        <path d="M150 196 L250 182 L420 178 L432 184 L254 188 L160 200 Z" fill="#ffffff" opacity=".7" />
        {/* Kıç platform */}
        <rect x="0" y="244" width="22" height="5" fill={look.hull} />
        <rect x="260" y="168" width="4" height="12" fill="#dfe6ee" />
      </g>
    );
  }

  if (look.style === 'superyacht') {
    return (
      <g>
        {/* Gövde */}
        <path d="M0 196 L520 196 Q568 194 602 180 L594 202 Q574 250 520 266 L50 270 Q14 270 4 246 Z" fill={look.hull} />
        <path d="M0 196 L520 196 Q568 194 602 180 L594 202 Q574 250 520 266 L50 270 Q14 270 4 246 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
        <path d="M20 252 L560 240" stroke={look.stripe} strokeWidth="5" />
        {[60, 120, 180, 240, 300, 360].map((x) => <rect key={x} x={x} y="218" width="40" height="7" rx="3" fill={glass} />)}
        {/* Ana güverte */}
        <path d="M30 196 L44 164 L470 160 Q510 170 540 196 Z" fill={superW} />
        <path d="M60 190 L70 170 L460 166 Q490 174 512 190 Z" fill={glass} />
        {/* Üst güverte */}
        <path d="M90 160 L104 130 L400 128 Q436 136 460 160 Z" fill={superW} />
        <path d="M114 154 L122 136 L396 134 Q420 140 436 154 Z" fill={glass} />
        {/* Köprü / güneş güvertesi */}
        <path d="M160 128 L176 102 L340 102 Q366 110 380 128 Z" fill={superW} />
        <path d="M190 122 L198 108 L336 108 Q352 114 360 122 Z" fill={glass} />
        <path d="M150 102 L360 102" stroke="#e3eaf2" strokeWidth="4" strokeLinecap="round" />
        {/* Radar direği */}
        <path d="M250 102 L262 62 L276 62 L282 102 Z" fill="#e8eef5" />
        <rect x="236" y="58" width="60" height="5" rx="2.5" fill="#e8eef5" />
        <circle cx="266" cy="52" r="7" fill="#e8eef5" />
      </g>
    );
  }

  // flybridge
  return (
    <g>
      {/* Gövde */}
      <path d="M8 204 L520 204 Q566 202 602 190 L594 210 Q574 254 524 268 L58 270 Q20 270 12 248 Z" fill={look.hull} />
      <path d="M8 204 L520 204 Q566 202 602 190 L594 210 Q574 254 524 268 L58 270 Q20 270 12 248 Z" fill={shine} stroke="#ffffff" strokeOpacity=".45" strokeWidth="1.5" />
      <path d="M24 250 L560 240" stroke={look.stripe} strokeWidth="4" />
      {/* Gövde camları */}
      <path d="M150 222 L230 222 L228 230 L152 230 Z" fill={glass} />
      <path d="M250 220 L390 218 Q400 218 396 226 L252 228 Z" fill={glass} />
      {/* Ana güverte salonu */}
      <path d="M52 204 L70 166 L420 160 Q470 168 510 204 Z" fill={superW} />
      <path d="M96 198 L110 172 L410 168 Q446 176 474 198 Z" fill={glass} />
      <path d="M70 166 L420 160 L430 166 L74 172 Z" fill="#ffffff" opacity=".6" />
      {/* Flybridge */}
      <path d="M120 160 L136 136 L340 134 Q364 142 380 160 Z" fill={superW} />
      <path d="M300 154 L312 140 L342 140 Q356 146 362 154 Z" fill={glass} />
      {/* Hardtop ve direk */}
      <path d="M110 112 L300 110" stroke="#eef3f8" strokeWidth="6" strokeLinecap="round" />
      <path d="M140 136 L132 112 M250 136 L258 110" stroke="#dfe6ee" strokeWidth="4" />
      <path d="M200 110 L210 88 L224 88 L230 110 Z" fill="#e8eef5" />
      <rect x="196" y="84" width="44" height="4" rx="2" fill="#e8eef5" />
      {/* Kıç platform */}
      <rect x="0" y="246" width="22" height="5" fill={look.hull} />
    </g>
  );
}
