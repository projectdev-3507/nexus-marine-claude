/**
 * NEXUS MARİN VE YATÇILIK LTD. ŞTİ.
 * HAFTALIK PERİYODİK TEKNE KONTROL VE TEKNİK DENETİM MATRİSİ
 * (Weekly Yacht Technical Inspection & Maintenance Checklist Matrix) — dijital sürüm.
 *
 * Kaynak: admin tarafından iletilen "Nexus_Marin_Cranchi_66_ANY_Haftalik_Denetim_Matrisi.pdf".
 * Bölüm 1–16: her kontrol noktası UYGUN / DİKKAT / ARIZA / N/A ile değerlendirilir.
 * Bölüm 17: ekipman saatleri ve tank seviyeleri (bu hafta / önceki hafta / fark).
 * Bölüm 18: tespit edilen arızalar tablosu. Bölüm 19: genel değerlendirme ve onay.
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
  OK: 'Sorunsuz / Faal',
  ATTENTION: 'Takip / Bakım İhtiyacı',
  FAULT: 'Hasarlı / Acil Onarım',
  NA: 'Donanım Mevcut Değil',
};

export const INSPECTION_RESULT_SYMBOLS: Record<InspectionResult, string> = { OK: 'OK', ATTENTION: '!', FAULT: 'X', NA: '-' };

export interface InspectionItemTemplate {
  code: string;
  label: string;
  /** Standart teknik kontrol tanımı */
  description?: string;
  /** Ölçüm değeri bekleniyorsa birimi (saat, L / %, % ...) */
  unit?: string;
}

export type InspectionSectionKind = 'CHECK' | 'READINGS' | 'FINDINGS' | 'APPROVAL';

export interface InspectionSectionTemplate {
  code: string;
  title: string;
  kind: InspectionSectionKind;
  items: InspectionItemTemplate[];
}

const s = (no: number, title: string, items: Array<[string, string]>): InspectionSectionTemplate => {
  const code = `S${String(no).padStart(2, '0')}`;
  return { code, title, kind: 'CHECK', items: items.map(([label, description], i) => ({ code: `${code}.${i + 1}`, label, description })) };
};

export const INSPECTION_TEMPLATE_VERSION = '2026.2';

export const INSPECTION_DOC = {
  company: 'NEXUS MARİN VE YATÇILIK LTD. ŞTİ.',
  title: 'HAFTALIK PERİYODİK TEKNE KONTROL VE TEKNİK DENETİM MATRİSİ',
  subtitle: 'Weekly Yacht Technical Inspection & Maintenance Checklist Matrix',
  legend: '[ UYGUN ]: Sorunsuz / Faal  |  [ DİKKAT ]: Takip / Bakım İhtiyacı  |  [ ARIZA ]: Hasarlı / Acil Onarım  |  [ N/A ]: Donanım Mevcut Değil',
  statement: (vessel: string, model?: string | null) =>
    `Teknik Beyan: ${vessel}${model ? ` (${model})` : ''} isimli teknenin haftalık periyodik teknik kontrolleri Nexus Marin ve Yatçılık Ltd. Şti. standartları kapsamında eksiksiz icra edilmiş olup tespit edilen durumlar işbu teknik matrise işlenmiştir.`,
};

export const INSPECTION_TEMPLATE: InspectionSectionTemplate[] = [
  s(1, 'GENEL GÜVERTE & DIŞ YÜZEY KONTROLÜ', [
    ['Gövde, borda ve su hattı', 'Jelcoat/boya hasarları, çatlak, sürtme izi, kirlilik ve zehirli boya.'],
    ['Güverte ve yürüme yolları', 'Tik güverte durumu, kaymaz zeminler, yüzey hasarı veya gevşek parçalar.'],
    ['Vardavela ve pasarella', 'Korkuluk ayakları, emniyet pimleri, hidrolik pasarella hareket testi.'],
    ["Lumbuz, kapı ve hatch'ler", 'Kauçuk fitil elastikiyeti, kilit mekanizmaları ve su sızdırmazlığı.'],
    ['Camlar ve cam fitilleri', 'Camda çatlak, fitil sızdırmazlığı, silecek motorları ve su fıskiyeleri.'],
    ['Flybridge & Sundeck', 'Flybridge konsolu, bimini/hardtop gergi kilitleri, minderler, tahliye delikleri.'],
    ['Güverte drenajları (Frengiler)', 'Tahliye deliklerinde yaprak/kir tıkanıklığı olmaması, serbest su tahliyesi.'],
  ]),
  s(2, 'BAĞLAMA, MOORING & GÜVENLİK HALATLARI', [
    ['Baş ve kıç palamar halatları', 'Halat liflerinde aşınma/kopukluk, sürtünme koruyucuları ve gerginlik dengesi.'],
    ['Spring (Açmaz) halatları', 'Doğru gerilim açısı, esneme payı ve koçboynuzu bağlantı emniyeti.'],
    ['Koçboynuzları ve babalar', 'Güverte montaj cıvatalarında gevşeklik, çatlak veya korozyon kontrolü.'],
    ['Usturmaçalar ve kılıfları', 'Hava basınçları, kılıf temizliği, bağlama inceleri ve yükseklik ayarı.'],
    ['Tonoz (Mooring) kilitleri', 'Tonoz mapası, fırdöndü, emniyet kilitleri ve sürtünme noktaları.'],
    ['Fırtına ve hava emniyeti', 'Rüzgâr/soluğan beklentisine göre ilave palamar ve fırtına tedbiri.'],
  ]),
  s(3, 'ÇAPA, IRGAT & ZİNCİR DONANIMI', [
    ['Çapa ve fırdöndü tertibatı', 'Çapa pimi emniyet teli, fırdöndü serbest dönüşü, şaft eğrilik kontrolü.'],
    ['Baş makarası (Bow Roller)', 'Makaraların yatak boşlukları, aşınma ve çapa sabitleme mandalı.'],
    ['Demir ırgatı (Windlass)', 'Elektrik motoru, kavrama debriyajı, fren balatası ve ses kontrolü.'],
    ['Zincirlik (Chain Locker)', 'Zincir istifi, burulma (kinking), ambar drenajı ve çamur birikintisi.'],
    ['Irgat kumanda butonları', 'Baş güverte ayak pedalları, flybridge ve kaptan köşkü kumandaları.'],
  ]),
  s(4, 'ANA MAKİNELER (VOLVO PENTA IPS / CRANCHI 66)', [
    ['Karter motor yağı seviyesi', 'Yağ çubuğu kontrolü (Min/Max), vizkozite, renk ve eksilme takibi.'],
    ['Soğutma sıvısı (Coolant)', 'Genleşme kabı seviyesi, kaçak kontrolü ve antifriz yoğunluğu.'],
    ['Deniz suyu filtreleri (Strainer)', 'Şeffaf kapak sızdırmazlığı, sepet temizliği ve O-ring durumu.'],
    ['Racor yakıt separatörleri', 'Şeffaf haznede su/tortu kontrolü, tahliye vanası ve filtre ömrü.'],
    ['Motor sintine havuzları', 'Makine altında yağ, yakıt veya su birikintisi olmaması (tamamen kuru).'],
    ['Start aküleri ve şarj dinamosu', 'Kutup başı oksitlenmesi, V-kayış gerginliği ve alternatör şarj voltajı.'],
    ['Makine dairesi fanları', 'Cebri havalandırma emiş/egzoz fanlarının kademeli çalışması.'],
    ['Egzoz sistemi ve körükler', 'Egzoz dirsekleri, kelepçeler, su enjeksiyon noktası ve kaçak testi.'],
    ['IPS Pod / Tahrik üniteleri', 'Gövde içi görsel kaçak kontrolü, yağ seviyeleri ve yönlendirme testi.'],
    ['Motor saatleri ve test çalıştırma', 'Saatlerin kaydı; rölantide yağ basıncı, hararet ve duman rengi.'],
  ]),
  s(5, 'JENERATÖR SİSTEMİ', [
    ['Jeneratör motor yağı seviyesi', 'Seviye, kirlilik durumu ve karter çevresi sızdırmazlık kontrolü.'],
    ['Soğutma sıvısı (Coolant)', 'Genleşme kabı seviyesi, radyatör kapağı ve hortum kelepçeleri.'],
    ['Deniz suyu devresi ve çark', 'Deniz suyu filtresi temizliği ve bordadan kesintisiz soğutma suyu atışı.'],
    ['Yakıt besleme ve filtreler', 'Ön filtre temizliği, yakıt borularında kaçak/terleme olmaması.'],
    ['Ses izolasyon kabini', 'Kabin içi temizlik, akustik sünger durumu ve sintine kontrolü.'],
    ['AC Güç çıkışı ve frekans', '230V gerilim ve 50Hz frekans stabilitesi; klima altında yük testi.'],
    ['Jeneratör çalışma saati', 'Mevcut çalışma saatinin haftalık rapora işlenmesi.'],
  ]),
  s(6, 'ELEKTRİK SİSTEMİ, AKÜLER & SAHİL BESLEME', [
    ['Sahil besleme kablosu ve fişi', 'Kablo kılıfı yıpranması, soket kontaklarında kararma/ısınma izi.'],
    ['Akü bankaları (Servis/Motor)', 'Akü voltaj değerleri (12V/24V), kutup başları ve bağlantı sıkılığı.'],
    ['Redresör ve İnverter ünitesi', 'Şarj akımı, mod göstergeleri, inverter 230V AC besleme testi.'],
    ['Ana elektrik dağıtım panoları', 'Otomat sigortalar, kaçak akım rölesi (RCD) test butonu kontrolü.'],
    ['Sintine pompası kumanda paneli', 'Pompaların manuel/otomatik anahtarları, alarm ledleri ve sesli ikaz.'],
    ['Navigasyon ve seyir fenerleri', 'Seyir fenerleri (İskele, Sancak, Pupa, Silyon, Demir), güverte aydınlatma.'],
  ]),
  s(7, 'SİNTİNE, SİNTİNE POMPALARI & DENİZ SUYU', [
    ['Tüm sintine havuzları', 'Makine, baş ve orta sintinelerin tamamen kuru ve temiz olması.'],
    ['Otomatik sintine pompaları', 'Şamandıraların serbest hareketi, manuel ve otomatik çekiş testi.'],
    ['Yüksek seviye sintine alarmları', 'Alarm sensörlerinin elle test edilmesi ve sesli uyarının doğrulanması.'],
    ['Kinistin vanaları (Seacocks)', 'Bronz vanaların rahat açılıp kapanması, korozyon/kaçak olmaması.'],
  ]),
  s(8, 'TANKLAR, HİDROFOR, YAKIT & ATIK SU', [
    ['Yakıt tankları ve menholler', 'Mevcut seviye göstergeleri, menhol kapakları ve kaçak kontrolü.'],
    ['Temiz su tankı ve hidrofor', 'Su seviyesi, basınç tutma, hidroforun sessiz ve sızıntısız çalışması.'],
    ['Siyah su tankı ve maseratör', 'Tank seviyesi, koku filtresi, tahliye pompası ve vana kontrolleri.'],
    ['Gri su drenaj karterleri', 'Duş/lavabo atık su karterlerinin süzgeç temizliği ve otomatik tahliyesi.'],
    ['Tank havalandırma firarları', 'Borda firar deliklerindeki böcek tülü ve hava açıklığı kontrolü.'],
  ]),
  s(9, 'İKLİMLENDİRME (CHILLER) & HAVALANDIRMA', [
    ['A/C Chiller ana ünitesi', 'Kompresör çalışma sesleri, gaz basınçları ve kontrol paneli alarmları.'],
    ['Klima deniz suyu sirkülasyonu', 'Deniz suyu pompası debisi, filtre temizliği ve borda tahliyesi.'],
    ['Fan coil üniteleri ve filtreler', 'Kabinlerdeki ünitelerin hava filtre temizliği ve yoğuşma suyu tavaları.'],
    ['Banyo ve sintine egzoz fanları', 'Cebri havalandırma fanlarının çalışması ve hava emiş debisi.'],
  ]),
  s(10, 'SU YAPICI (WATERMAKER)', [
    ['Çalışma ve üretim kalitesi', 'Üretilen tatlı suyun tuzluluk (TDS/PPM) değeri ve tanka yönlenmesi.'],
    ['Ön filtre grubu (5/20 mikron)', 'Filtre manometre fark basınçları ve kartuş temizlik seviyesi.'],
    ['Yüksek basınç pompası', 'Pompa yağ seviyesi, çalışma basıncı (bar) ve titreşim kontrolü.'],
  ]),
  s(11, 'HİDROLİK SİSTEMLER (PLATFORM, PASARELLA)', [
    ['Dümen hidrolik sistemi', 'Hidrolik yağ tankı seviyesi, dümen pistonları keçeleri ve kaçak kontrolü.'],
    ['Hidrolik yüzme platformu', 'Aşağı/yukarı hareket testi, mekanik kilitler ve hortum sızdırmazlığı.'],
    ['Pasarella hidrolik mekanizması', 'Teleskopik açılma, kaldırma pistonları ve bağlantı mafsalları.'],
    ['Trim Tab / Flap sistemi', 'Flap pistonları, hidrolik ünite seviyesi ve gösterge hassasiyeti.'],
  ]),
  s(12, 'SEYİR ELEKTRONİĞİ & HABERLEŞME', [
    ['GPS / Chartplotter (MFD)', 'Harita güncelliği, ekran hassasiyeti, uydu kilitlenmesi ve rota testi.'],
    ['Radar sistemi', 'Anten rotasyonu, açık deniz taraması ve ekran hedef eko netliği.'],
    ['Otopilot sistemi', 'Pusula senkronizasyonu, rotaya girme ve acil devre dışı bırakma.'],
    ['Derinlik ve hız sensörleri', 'Doğru derinlik bilgisi, dip yapısı ve deniz suyu sıcaklığı okuması.'],
    ['VHF Telsiz ve DSC sistemi', 'Açılma testi, kanal seçimi, squelch ve DSC GPS konum entegrasyonu.'],
    ['AIS (Tanımlama Sistemi)', 'Gemi tanımlama sinyal aktarımı (TX/RX) ve harita hedef çizimi.'],
  ]),
  s(13, 'YANGIN EMNİYETİ & CAN KURTARMA', [
    ['Portatif yangın söndürücüler', 'Manometre yeşil bölge, emniyet pimi, mühür ve son kontrol tarihi.'],
    ['Makine dairesi sabit söndürme', 'FM-200 / Aerosol tüp basıncı, uzaktan çekme teli ve selenoidler.'],
    ['Yangın ve duman dedektörleri', 'Kabinlerdeki ve makine dairesindeki optik dedektörlerin panel testi.'],
    ['Can yelekleri ve can simitleri', 'Sayı kontrolü, düdükler, suyla temaslı flaşör ışıkları ve yerleşimleri.'],
    ['Can salı (Life Raft)', 'Hidrostatik kilit mekanizması, montaj braketi ve servis tarihi.'],
    ['EPIRB ve SART cihazları', 'Test buton kontrolü, hidrostatik kilit ve batarya son kullanım tarihleri.'],
    ['İlk yardım ve piroteknik seti', 'Medikal malzeme eksiksizliği, fişek adetleri ve son kullanma tarihleri.'],
  ]),
  s(14, 'İÇ MEKÂNLAR, MUTFAK & YAŞAM ALANLARI', [
    ['Salon, kabinler ve mobilyalar', 'Genel havalandırma, rutubet/koku kontrolü ve mobilya kilit mandalları.'],
    ['Mutfak (Galley) beyaz eşyaları', 'Buzdolabı/dondurucu sıcaklığı, ocak, fırın ve aspiratör kontrolü.'],
    ['Banyolar ve marin tuvaletler', 'Vakumlu/maseratörlü tahliye testi, valf sızdırmazlığı ve koku durumu.'],
    ['Çamaşır ve bulaşık makineleri', 'Su giriş/tahliye hortumları, temiz su filtresi ve sızdırmazlık.'],
  ]),
  s(15, 'SERVİS BOTU (TENDER) & EKİPMANLAR', [
    ['Tender bot ve dıştan takma motor', 'Tüp hava basınçları, motor yağı/yakıtı, akü voltajı ve palamar ipleri.'],
    ['Tender vinci / Matafora (Davit)', 'Kaldırma halatları, kanca kilit mandalı ve kablolu kumanda testi.'],
    ['Su oyuncakları (Seabob, SUP)', 'Şarj durumları, gövde sızdırmazlıkları ve emniyet kordonları.'],
  ]),
  s(16, 'LİMAN, MARİNA & GÜVENLİK PROTOKOLÜ', [
    ['Haftalık meteoroloji & fırtına tedbiri', 'Marina yönetim hava bülteni, rüzgâr/sağanak önleyici bağlama tedbirleri.'],
    ['Genel tekne kilit ve sahil güvenliği', 'Giriş kapıları, lumboz kilitleri, kamera sistemi ve sahil panosu.'],
    ['Liman atık alım (Pump-out) kaydı', 'Mavi Kart / Marpol atık bildirim takvimi ve tank boşaltma ihtiyacı.'],
  ]),
  {
    code: 'S17',
    title: 'HAFTALIK EKİPMAN SAATLERİ VE TANK KAPASİTE MATRİSİ',
    kind: 'READINGS',
    items: [
      { code: 'S17.1', label: 'İskele Ana Makine (Port Main Engine)', unit: 'Saat (h)' },
      { code: 'S17.2', label: 'Sancak Ana Makine (Stbd Main Engine)', unit: 'Saat (h)' },
      { code: 'S17.3', label: 'Ana Jeneratör (Main Generator)', unit: 'Saat (h)' },
      { code: 'S17.4', label: 'Su Yapıcı (Watermaker)', unit: 'Saat (h)' },
      { code: 'S17.5', label: 'Yakıt Tank Seviyesi (Diesel Fuel)', unit: 'L / %' },
      { code: 'S17.6', label: 'Temiz Su Tank Seviyesi (Fresh Water)', unit: 'L / %' },
      { code: 'S17.7', label: 'Siyah / Gri Su Tank Seviyesi', unit: '%' },
    ],
  },
  { code: 'S18', title: 'TESPİT EDİLEN ARIZALAR, EKSİKLER VE TEKNİK SERVİS İHTİYAÇLARI', kind: 'FINDINGS', items: [] },
  { code: 'S19', title: 'GENEL OPERASYONEL DEĞERLENDİRME VE DENETİM ONAYI', kind: 'APPROVAL', items: [] },
];

/** Değerlendirilmesi zorunlu (UYGUN/DİKKAT/ARIZA/N/A) maddeler — Bölüm 1–16 */
export const isCheckSection = (code: string) => INSPECTION_TEMPLATE.find((x) => x.code === code)?.kind === 'CHECK';

export const INSPECTION_ITEM_COUNT = INSPECTION_TEMPLATE.filter((x) => x.kind === 'CHECK').reduce((n, sec) => n + sec.items.length, 0);

export function findTemplateItem(code: string) {
  for (const section of INSPECTION_TEMPLATE) {
    const item = section.items.find((i) => i.code === code);
    if (item) return { section, item };
  }
  return undefined;
}

/** Bölüm 18 — arıza tablosu satırı */
export const FINDING_PRIORITIES = ['LOW', 'MEDIUM', 'URGENT'] as const;
export type FindingPriority = (typeof FINDING_PRIORITIES)[number];
export const FINDING_PRIORITY_LABELS: Record<FindingPriority, string> = { LOW: 'Düşük', MEDIUM: 'Orta', URGENT: 'Acil' };
export interface InspectionFinding {
  description: string;
  priority?: FindingPriority | null;
  responsible?: string;
  serviceStatus?: string;
}

/** Bölüm 19 — tekne genel operasyonel statüsü */
export const OPERATIONAL_STATUSES = ['READY', 'FOLLOW_UP', 'NOT_READY'] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];
export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  READY: 'SEFERE HAZIR (UYGUN)',
  FOLLOW_UP: 'TAKİP GEREKTİRİR',
  NOT_READY: 'SEFERE UYGUN DEĞİL / SERVİS ŞART',
};
