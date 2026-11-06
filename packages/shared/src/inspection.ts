/**
 * M/Y ANY — Haftalık Periyodik Tekne Kontrol ve Teknik Denetim Matrisi (dijital sürüm).
 * 19 bölüm. Her madde UYGUN / DİKKAT / ARIZA / N/A ile değerlendirilir;
 * açıklama, ölçüm değeri ve fotoğraf eklenebilir.
 */
export const INSPECTION_RESULTS = ['OK', 'ATTENTION', 'FAULT', 'NA'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  OK: 'UYGUN',
  ATTENTION: 'DİKKAT',
  FAULT: 'ARIZA',
  NA: 'N/A',
};

export const INSPECTION_RESULT_HINTS: Record<InspectionResult, string> = {
  OK: 'Sorunsuz',
  ATTENTION: 'Takip veya bakım gerekiyor',
  FAULT: 'Onarım gerekiyor',
  NA: 'Donanım mevcut değil',
};

export interface InspectionItemTemplate {
  code: string;
  label: string;
  /** Ölçüm değeri bekleniyorsa birimi (V, saat, %, bar, °C, L ...) */
  unit?: string;
}

export interface InspectionSectionTemplate {
  code: string;
  title: string;
  items: InspectionItemTemplate[];
}

const s = (code: string, title: string, items: Array<string | [string, string]>): InspectionSectionTemplate => ({
  code,
  title,
  items: items.map((it, i) => {
    const [label, unit] = Array.isArray(it) ? it : [it, undefined];
    return { code: `${code}.${i + 1}`, label, ...(unit ? { unit } : {}) };
  }),
});

export const INSPECTION_TEMPLATE_VERSION = '2026.1';

export const INSPECTION_TEMPLATE: InspectionSectionTemplate[] = [
  s('S01', 'Genel güverte ve dış yüzey', [
    'Güverte yüzeyi ve teak durumu',
    'Jelkot ve gövde dış yüzey görsel kontrol',
    'Paslanmaz/krom aksam',
    'Camlar, lumbuzlar ve contalar',
    'Güverte drenajları (frizler)',
    'Brandalar, minderler ve bimini',
  ]),
  s('S02', 'Bağlama ve güvenlik halatları', [
    'Baş/kıç halatları aşınma kontrolü',
    'Spring halatları',
    'Usturmaçalar ve konumları',
    'Koçbaşı ve babalar',
    'Muring/ön bağlantı',
  ]),
  s('S03', 'Çapa, ırgat ve zincir', [
    'Irgat motoru ve kumandası',
    'Zincir ve kilit pimleri',
    'Çapa ve çapa yuvası',
    'Zincir kuyusu drenajı',
  ]),
  s('S04', 'Ana makineler', [
    'İskele motor yağ seviyesi',
    'Sancak motor yağ seviyesi',
    'Soğutma suyu (antifriz) seviyesi',
    'Deniz suyu filtreleri',
    'Kayış ve kasnaklar',
    'Yakıt hatları ve sızıntı kontrolü',
    'Egzoz ve dirsekler',
    'Şaft salmastrası / dripless kontrol',
    'Motor dairesi genel temizlik',
  ]),
  s('S05', 'Jeneratör', [
    'Yağ seviyesi',
    'Soğutma suyu seviyesi',
    'Deniz suyu filtresi',
    'Çalıştırma testi ve yük altında çalışma',
    'Ses kabini ve titreşim takozları',
  ]),
  s('S06', 'Elektrik ve aküler', [
    ['Servis akü grubu voltajı', 'V'],
    ['Marş akü voltajı', 'V'],
    ['Jeneratör akü voltajı', 'V'],
    'Şarj cihazı / redresör',
    'İnverter',
    'Sahil beslemesi ve kablosu',
    'AC/DC panolar, sigortalar ve bağlantılar',
  ]),
  s('S07', 'Sintine ve deniz suyu', [
    'Sintine pompaları (otomatik/manuel)',
    'Sintine şamandıra şalterleri',
    'Sintine su seviyesi ve temizliği',
    'Deniz suyu valfleri (seacock)',
    'Hortum kelepçeleri',
  ]),
  s('S08', 'Tanklar ve hidrofor', [
    ['Temiz su tankı seviyesi', '%'],
    ['Pis su (black water) tankı seviyesi', '%'],
    ['Gri su tankı seviyesi', '%'],
    'Hidrofor pompası ve basınç',
    'Boyler (sıcak su)',
  ]),
  s('S09', 'İklimlendirme ve havalandırma', [
    'Klima üniteleri çalışma testi',
    'Klima deniz suyu pompası ve filtresi',
    'Havalandırma fanları',
    'Nem ve koku kontrolü',
  ]),
  s('S10', 'Su yapıcı', [
    'Ön filtreler',
    ['Çalışma basıncı', 'bar'],
    ['Ürün suyu TDS değeri', 'ppm'],
    'Membran koruma / flush',
  ]),
  s('S11', 'Hidrolik sistemler', [
    'Hidrolik yağ seviyesi',
    'Pasarella / iskele',
    'Flaplar / trim tabları',
    'Baş-kıç pervane (thruster)',
    'Hortum ve bağlantı sızıntıları',
  ]),
  s('S12', 'Seyir elektroniği', [
    'Plotter ve GPS',
    'Radar',
    'VHF ve DSC',
    'AIS',
    'Otopilot',
    'Seyir fenerleri',
  ]),
  s('S13', 'Yangın emniyeti ve can kurtarma', [
    'Yangın söndürücüler (son kontrol tarihi)',
    'Motor dairesi otomatik söndürme sistemi',
    'Duman ve gaz dedektörleri',
    'Can yelekleri',
    'Can salı (servis tarihi)',
    'EPIRB / işaret fişekleri',
  ]),
  s('S14', 'İç mekanlar ve yaşam alanları', [
    'Salon ve kamaralar genel durum',
    'Tuvaletler ve pompalar',
    'Mutfak ekipmanları',
    'Buzdolabı / derin dondurucu',
    'Aydınlatma',
    'Su sızıntısı ve nem izi kontrolü',
  ]),
  s('S15', 'Servis botu', [
    'Bot gövdesi ve hava basıncı',
    'Dıştan takma motor çalışma testi',
    'Bot yakıtı',
    'Bot vinci / kaldırma sistemi',
  ]),
  s('S16', 'Liman ve marina güvenliği', [
    'Kapı ve kilitler',
    'Alarm ve kamera sistemi',
    'Marina elektrik/su bağlantı noktası',
    'Komşu tekne ve iskele mesafesi',
  ]),
  s('S17', 'Ekipman çalışma saatleri ve tank değerleri', [
    ['İskele ana makine çalışma saati', 'saat'],
    ['Sancak ana makine çalışma saati', 'saat'],
    ['Jeneratör çalışma saati', 'saat'],
    ['Yakıt tankı seviyesi', '%'],
    ['Su yapıcı çalışma saati', 'saat'],
  ]),
  s('S18', 'Arızalar ve servis ihtiyaçları', [
    'Önceki denetimden açık arızalar',
    'Yeni tespit edilen arızalar',
    'Yedek parça / malzeme ihtiyacı',
  ]),
  s('S19', 'Genel operasyonel değerlendirme ve onay', [
    'Tekne genel operasyonel durumu',
    'Kaptan bilgilendirildi',
    'Denetçi değerlendirmesi',
  ]),
];

export const INSPECTION_ITEM_COUNT = INSPECTION_TEMPLATE.reduce((n, sec) => n + sec.items.length, 0);

export function findTemplateItem(code: string) {
  for (const section of INSPECTION_TEMPLATE) {
    const item = section.items.find((i) => i.code === code);
    if (item) return { section, item };
  }
  return undefined;
}
