/**
 * Belge şablonları — admin tarafından iletilen örnek belgelerin içeriği birebir.
 *  - PROJECT_PROPOSAL : "teknık rapor sonuc alt kazıma için 1.pdf" (Proje Teklif Dosyası: Gövde Onarım ve İyileştirme)
 *  - POST_SCRAPING    : "kazıma sonrası teknık inceleme raporu.docx"
 *  - DELIVERY_PROTOCOL: "Nihai Birleşik Restorasyon, Teak Güverte, Bakım ve Teslim Protokolü"
 * Yeni belge açıldığında bu içerikle başlar; tüm metinler ekranda düzenlenebilir.
 */

export interface DocItem {
  title?: string;
  text: string;
}
export interface DocSection {
  code?: string;
  title: string;
  intro?: string;
  items: DocItem[];
  /** Madde işaretli kısa satırlar (ör. malzeme bilgileri) */
  bullets?: string[];
  /** Alan / miktar tablosu (ör. Uygulama Alan Tablosu) */
  tableTitle?: string;
  table?: Array<{ name: string; quantity: string; unit: string }>;
}

// ───────────────────────── Proje Teklif Dosyası ─────────────────────────
export interface ProposalData {
  company: string;
  docTitle: string;
  section1Title: string;
  salutation: string;
  intro: string;
  currentLabel: string;
  findings: DocItem[];
  risk: string;
  section2Title: string;
  section2Intro: string;
  scope: DocSection[];
  offerTitle: string;
  offerText: string;
  durationDays: number;
  offerClosing: string;
  conclusionTitle: string;
  conclusion: string;
  preparedBy1: string;
  preparedBy2: string;
  approvedBy: string;
}

export const proposalTemplate = (vessel = 'M/Y SEA RODS'): ProposalData => ({
  company: 'NEXUS MARİN VE YATCILIK LTD ŞTİ',
  docTitle: 'PROJE TEKLİF DOSYASI: GÖVDE ONARIM VE İYİLEŞTİRME',
  section1Title: 'BÖLÜM 1: TEKNİK GEREKÇE VE DURUM ANALİZİ (Müşteri Açıklaması)',
  salutation: 'Sayın Tekne Sahibi/Yetkilisi,',
  intro: `${vessel} üzerinde yapılan detaylı gövde sörveyi ve mekanik kazıma testleri sonucunda, teknenin su altı kesiminde (karina) daha önce yapılan onarımların teknik standartlara uygun olmadığı ve yapısal risk oluşturduğu tespit edilmiştir.`,
  currentLabel: 'Mevcut durumda;',
  findings: [
    { title: 'Su Yürümesi', text: 'Sancak ve iskele tarafta ahşap gövde ile dış laminasyon (elyaf) arasına su girdiği, bu suyun hapsolarak ahşabı içten çürütmeye başladığı görülmüştür.' },
    { title: 'Hatalı Uygulama', text: 'Eski zehirli boyalar temizlenmeden üzerine yapılan macun ve elyaf uygulamaları, katmanların birbirine yapışmasını engellemiş (delaminasyon) ve "sandviç yapı" içinde korozyon ortamı yaratmıştır.' },
    { title: 'Donanım Riski', text: 'Şaft braketleri ve su çıkışları hatalı izole edildiğinden, metal aksamda korozyon ve gövde bağlantı noktalarında su girişi mevcuttur.' },
  ],
  risk: 'Bu sorunların giderilmemesi durumunda; teknede "ozmoz" (yapısal bozulma), ahşap çürümesi ve ağır deniz şartlarında gövde mukavemetinin kaybı kaçınılmazdır. Aşağıda sunulan iş planı, sadece kozmetik bir düzeltme değil, teknenin gövde ömrünü uzatacak kalıcı bir yapısal restorasyonu kapsamaktadır.',
  section2Title: 'BÖLÜM 2: YAPILACAK İŞLEMLER LİSTESİ (İşçilik Kapsamı)',
  section2Intro: 'Bu proje kapsamında aşağıdaki teknik prosedürler "Marine Standartlarına" uygun olarak sırasıyla uygulanacaktır:',
  scope: [
    {
      code: 'A',
      title: 'Söküm ve Yüzey Hazırlığı',
      items: [
        { title: 'Mekanik Raspa (Gel-Plane)', text: 'İskele ve Sancak tarafında tespit edilen tüm hasarlı laminasyon, macun ve boya katmanlarının, orijinal ahşap veya sağlam elyaf zeminine ulaşana kadar kazınması.' },
        { title: 'Donanım Sökümü', text: 'Şaft braketleri (P-Bracket), su emiş/çıkış vanaları ve egzoz çıkış etrafındaki şüpheli parçaların sökülmesi.' },
        { title: 'Kimyasal Temizlik', text: 'Kazınan yüzeyin basınçlı tatlı su ile yıkanarak tuz ve kimyasal atıklardan arındırılması.' },
      ],
    },
    {
      code: 'B',
      title: 'Kurutma ve Nem Kontrolü',
      items: [
        { text: 'Tekne karinasının ısıl işlem veya doğal havalandırma yöntemleriyle kurumaya bırakılması.' },
        { text: 'Profesyonel nem ölçer cihazları ile ahşap nem oranının laminasyona uygun seviyeye (%10-15 aralığına) düşürülmesi ve raporlanması.' },
      ],
    },
    {
      code: 'C',
      title: 'Laminasyon ve Yapısal Onarım (Epoksi Sistemi)',
      items: [
        { title: 'Emprenye', text: 'Kuru ahşap yüzeyin, aderansı (yapışmayı) artırmak için düşük viskoziteli epoksi reçine ile doyurulması.' },
        { title: 'Elyaf Kaplama', text: 'Kritik bölgelerin (çeneler, stabilizör etrafı) Biaxial (çift yönlü) cam elyafı ve epoksi reçine ile yeniden lamine edilmesi.' },
        { title: 'Tesviye (Fairing)', text: 'Yüzeyin solventsiz epoksi dolgu macunları ile pürüzsüz hale getirilmesi ve zımparalanması.' },
      ],
    },
    {
      code: 'D',
      title: 'Koruma ve Boya Sistemi',
      items: [
        { title: 'Barrier Coat (Ozmoz Koruma)', text: 'Hazırlanan yüzeye en az 300 mikron kalınlığında (min. 4-5 kat) Solventsiz Epoksi Astar (Gelshield/High Protect vb.) uygulanması.' },
        { title: 'Zehirli Boya', text: 'Astar üzerine "Tie-Coat" (bağlayıcı) ve ardından 2 kat zehirli boya uygulaması.' },
      ],
    },
    {
      code: 'E',
      title: 'Montaj (Re-fitting)',
      items: [{ text: 'Şaft braketlerinin temizlenip, elyaf sarılmadan, uygun deniz mastiği (Sikaflex/3M) ile izole edilerek yerine monte edilmesi.' }],
    },
  ],
  offerTitle: 'Teklif Sonucu ve Onay',
  offerText: 'Bu çalışma, teknenizin yapısal güvenliği için zorunlu bir bakım niteliğindedir. İşlemlerin toplam süresi, kuruma hızına bağlı olarak [ {gun}] iş günü olarak öngörülmektedir.',
  durationDays: 15,
  offerClosing: 'Onayınızla birlikte malzeme tedariki ve söküm işlemlerine başlanacaktır.',
  conclusionTitle: 'SONUÇ',
  conclusion: `${vessel.replace('SEA RODS', 'Sea Rods')} teknesinde yapılan incelemeler, önceki bakım işlemlerinin teknik standartlara aykırı yapıldığını (ıslak yüzeye uygulama, yanlış malzeme, kirli yüzeye laminasyon) kanıtlamaktadır. Mevcut durum sadece kozmetik bir sorun değil, teknenin gövde ömrünü kısaltan ciddi bir yapısal kusurdur. Yukarıda belirtilen kurutma ve epoksi laminasyon süreçleri tam olarak uygulanmadan yapılacak her işlem, kısa süre sonra tekrar nüksedecektir.`,
  preparedBy1: '',
  preparedBy2: '',
  approvedBy: '',
});

// ───────────────────── Kazıma Sonrası Teknik İnceleme ─────────────────────
export interface ScrapingData {
  heading: string;
  starboardIntro: string;
  starboard: string[];
  portTitle: string;
  port: string[];
}

export const scrapingTemplate = (vessel = 'SEA RODS'): ScrapingData => ({
  heading: vessel.replace(/^M\/Y\s+/, ''),
  starboardIntro: 'Yapılan alt kazıma işlemi neticesinde teknenin Sancak tarafında;',
  starboard: [
    'Bulunan çenelerde laminasyon işleminin ahşaptan ayrıldığı ve ahşap ile elyaf arasında su ve hava boşluğu tespit edilmiştir.',
    'Sancak tarafta kasarada bulunan egzoz çıkışının etrafında, yapılan kazıma işleminden önce tespit edilen su damlamalarının kazınması sonucunda laminasyon ve ahşap arasında su tespit edilmiştir.',
    'Yapılan kazıma işlemi sonucunda sancak tarafın su hattında bulunan ilk çenelerde tamirat işlemleri görülmüş olup; yapılan tamiratların üzeri açıldığında zehirli boyanın üzerine epoksi macun yapıldığı ve yapılan macun işleminin halen kurumadığı, yaş olduğu tespit edilmiştir.',
    'Sancak kıç omuzlukta bulunan su damlamaları renovator yardımıyla açıldığında, 1,5 metrelik kısımda ahşap ile laminasyon arasında su ve ayrıca sargı tahtaları içerisinden su geldiği tespit edilmiştir.',
    'Sancak şaftı tutan pirinç braket üzerinde elyaf tespit edilmiştir. Yapılan kazıma işlemi sonucunda elyaf ile braketlerin arasında su görülmüştür.',
    'Braketlerin etrafı temizlendiğinde sealant kanallarının tamamen macun ile kapatıldığı görülmüştür.',
  ],
  portTitle: 'İSKELE TARAF',
  port: [
    'İskele tarafta bulunan stabilizörün çevresinde yapılan kazıma işlemi sonucunda stabilizörlerin çevresinde Gelshield 200 uygulaması görülmüş ve sonrasındaki gözlemlere dayanarak devam ettirilen kazıma işlemi sonucunda Gelshield 200 uygulamasının altında epoksi macun, onun altında su ve tekrardan zehirli boya tespit edilmiş olup, görülen gerek üzerine bahsi geçen bölge tamamen temizlenmiştir.',
    'İskele tarafta bulunan stabilizörün bitimindeki ilk çene kısmında yapılan kazıma işlemi sonrasında Jelkot tabakası gözlenmiş olup, sonrasında yapılan gözlemler sonucunda yüzeyde çatlamalar ve daha derine uzanan zehirli boya katmanları tespit edilmiştir. Görülen gerek üzerine bahsi geçen bölgede kazıma işlemine devam edilmiş ve sonrasında Jelkot tabakasının altında tekrardan zehirli boya ve kurumamış epoksi macun tespit edilmiştir. Bahsi geçen bölge elyafa kadar temizlenmiştir.',
    'İskele kıç omuzluk tarafında su hattında bulunan pirinç bir su çıkışının kapatılıp körlendiği görülmüştür. Yapılan kazıma işlemi sonucu su çıkışının kapatıldığı noktada kullanılan malzemede deformasyon ve çatlamalar tespit edilmiştir.',
    'İskele şaftı tutan pirinç braket üzerinde elyaf tespit edilmiştir. Yapılan kazıma işlemi sonucunda elyaf ile braketin arasında su tespit edilmiştir. Kazıma işlemine devam edildiğinde sealant kanallarının tamamen macun ile kapatıldığı tespit edilmiştir.',
  ],
});

// ───────────── Nihai Birleşik Restorasyon, Teak, Bakım ve Teslim Protokolü ─────────────
export interface PartyData {
  title: string;
  name: string;
  fields: Array<{ label: string; value: string }>;
}
export interface ProtocolData {
  docTitle: string;
  parties: PartyData[];
  subjectTitle: string;
  subject: string;
  worksTitle: string;
  worksIntro: string;
  sections: DocSection[];
  financeTitle: string;
  finance: DocItem[];
  guaranteeTitle: string;
  guarantee: DocItem[];
  closing: string;
  jurisdiction: string;
  employerSign: { name: string; date: string };
  contractorSign: { name: string; date: string };
}

export const protocolTemplate = (vessel = "M/Y SEA ROD'S"): ProtocolData => ({
  docTitle: `${vessel} NİHAİ GÖVDE RESTORASYONU, MARANGOZLUK, TEAK GÜVERTE YENİLEME VE BAKIM ONARIM TESLİM PROTOKOLÜ`,
  parties: [
    {
      title: '1. Yüklenici (Hizmet Sağlayıcı)',
      name: 'NEXUS MARİN VE YATÇILIK LTD. ŞTİ.',
      fields: [
        { label: 'Adres', value: 'Göcek Mah. Emet Sok. No: 6 D: 7 Fethiye / Muğla' },
        { label: 'Temsilci', value: 'Ramazan DEMİR' },
        { label: 'Tel', value: '+90 530 250 2048' },
        { label: 'E-posta', value: 'info@nexusmarin.com.tr' },
      ],
    },
    {
      title: '2. İşveren (Tekne Sahibi)',
      name: vessel,
      fields: [
        { label: 'Temsilci / Donatan', value: '' },
        { label: 'Tekne Adı', value: vessel },
        { label: 'Bağlı Olduğu Marina', value: '' },
      ],
    },
  ],
  subjectTitle: '1. SÖZLEŞMENİN KONUSU',
  subject: `İşbu birleşik nihai protokol; ${vessel} isimli teknenin su altı kesiminde gerçekleştirilen Gövde Onarım ve İyileştirme Projesi, tekne genelinde yürütülen Marangozluk ve Teak Güverte Yenileme İşleri, başlangıçta anlaşılan Periyodik Bakım-Onarım İşleri ile süreç içerisinde tekne kaptanının talepleri doğrultusunda bedelsiz yapılan Ek Güçlendirme ve Servis Botu İşlemleri dahil olmak üzere tüm işlerin uluslararası marine standartlarına uygun olarak başarıyla tamamlandığını, kontrol edilerek işverene kusursuz şekilde teslim edildiğini, ek maliyetleri ve tarafların mali/hukuki ibralaşmasını düzenler.`,
  worksTitle: '2. GERÇEKLEŞTİRİLEN İŞLER VE TEKNİK UYGULAMA DETAYLARI',
  worksIntro: 'Protokol kapsamında, uluslararası marine standartlarına uygun kalitede malzeme ve profesyonel ekip kullanılarak gerçekleştirilen teknik prosedürlerin dökümü aşağıdadır:',
  sections: [
    {
      code: 'A',
      title: 'Gövde Onarım ve Yapısal Restorasyon İşlemleri (Karina Yapısal Revizyonu)',
      intro: 'Teknenin gövde ömrünü uzatmak ve yapısal mukavemetini geri kazandırmak amacıyla aşağıdaki majör restorasyon süreçleri eksiksiz uygulanmıştır:',
      items: [
        { title: 'Söküm ve Mekanik Raspa (Gel-Plane)', text: 'İskele ve sancak tarafında su almış, delaminasyona uğramış tüm hasarlı eski laminasyon, macun ve zehirli boya katmanları, orijinal sağlam ahşap ve elyaf zeminine ulaşılana kadar tamamen kazınmıştır.' },
        { title: 'Kurutma ve Nem Kontrolü', text: 'Tekne karinası kurumaya bırakılmış, profesyonel nem ölçer cihazlarla yapılan kontroller neticesinde ahşap nem oranı laminasyona uygun ve güvenli olan %10-15 aralığına düşürülerek kayıt altına alınmıştır.' },
        { title: 'Standartlara Uygun Epoksi Sistemi ve Laminasyon', text: 'Kuru ahşap yüzeyin yapışma (aderans) kabiliyetini artırmak için düşük viskoziteli epoksi reçine ile emprenye (doyurma) işlemi yapılmıştır. Kritik bölgeler (çeneler, stabilizör etrafları) uluslararası standartlara uygun kalitede Biaxial (çift yönlü) cam elyafı ve yüksek mukavemetli epoksi reçine ile yeniden lamine edilerek yapısal bütünlük sağlanmıştır. Yüzey, marine standartlarına uygun solventsiz epoksi dolgu macunları ile tesviye edilerek pürüzsüz şekilde zımparalanmıştır.' },
        { title: 'Koruma ve Boya Sistemi (Barrier Coat)', text: 'Hazırlanan mukavemetli yüzeye ozmoz koruması sağlamak amacıyla en az 300 mikron kalınlığında (5 kat) Solventsiz Epoksi Astar uygulanmıştır. Astar üzerine Tie-Coat (bağlayıcı) ve ardından 2 kat yüksek kaliteli zehirli boya uygulaması yapılarak süreç tamamlanmıştır.' },
        { title: 'Yeniden Montaj (Re-fitting)', text: 'Sökülen şaft braketleri (P-Bracket) temizlenmiş; elyaf sarılmadan, profesyonel deniz mastiği (Sikaflex/3M) ile mükemmel izolasyon sağlanarak yerine monte edilmiştir.' },
      ],
    },
    {
      code: 'B',
      title: 'Marangozluk ve Teak Güverte Yenileme İşlemleri',
      intro: 'Teknenin güverte ve dış alanlarında onaylanan proje doğrultusunda aşağıdaki marangozluk, teak imalatı ve menteşe değişim işleri eksiksiz olarak tamamlanmıştır:',
      items: [],
      bullets: [
        'Güverte yenilemelerinde 12mm 1. sınıf freze Birmanya Teak malzeme kullanılmıştır.',
        'Dolgu ve yapıştırma işlemlerinde Sikaflex markalı ürünler; vernik işlerinde ise International marka vernik ürünleri marine standartlarında uygulanmıştır.',
      ],
      tableTitle: 'Uygulama Alan Tablosu',
      table: [
        { name: 'Platform Dış Alan Teak Güverte Değişimi', quantity: '6,12', unit: 'm²' },
        { name: 'Platform İç Alan Teak Güverte Değişimi', quantity: '5,44', unit: 'm²' },
        { name: 'Platform Sabit Yanlar Teak Güverte Değişimi', quantity: '1,54', unit: 'm²' },
        { name: 'Merdivenler (6 Adet) Teak Güverte Değişimi', quantity: '1,08', unit: 'm²' },
        { name: 'Teak Güverte Parça Değişimleri', quantity: '4', unit: 'Adet' },
        { name: 'Personel Kapı Akordeon Menteşe Değişimi', quantity: '9', unit: 'Adet' },
      ],
    },
    {
      code: 'C',
      title: 'Mekanik, Periyodik Bakım ve Kozmetik İşlemler',
      items: [
        { title: 'Şaft ve Pervaneler', text: 'Şaft yüzeyleri sulandırılmış taş asidi ve burgulu çanak fırça ile arındırılmış; pervaneler saçaklı çanak fırça ile detaylı olarak temizlenmiştir.' },
        { title: 'Pasta & Cila ve Parlatma', text: 'Gövde ve üst bina yüzeylerine 3M 09374 kalın pasta ve Fracela sünger ped ile polisaj yapılmış, ardından 3WAX marin tipi cila ile yüksek parlaklık verilmiştir. Matlaşmış bölgeler kademeli olarak 1000, 1500 ve 2000 numara su zımparası ile düzeltilmiştir. Krom ve paslanmaz çelik aksamlar 3M 0919 marin metal parlatıcı ile parlatılmıştır.' },
      ],
    },
    {
      code: 'D',
      title: 'Kaptan Talebi Doğrultusunda Yapılan Ek İşler (Bedelsiz)',
      intro: 'Aşağıda belirtilen işlemler, tekne kaptanının isteği doğrultusunda projeye dahil edilmiş; müşteri memnuniyeti kapsamında yüklenici tarafından herhangi bir ek işçilik veya malzeme ücreti alınmadan (bedelsiz olarak) tamamlanmıştır:',
      items: [
        { title: 'Fazladan Jelkot Onarımları', text: 'Teknenin üst bina ve gövdesinde sonradan tespit edilen tüm ekstra jelkot çatlak ve kırıkları Yachticon jelkot tamir kiti, kademeli zımpara ve pasta süreçleriyle tamamen onarılmıştır.' },
        { title: 'Deniz Merdiveni ve Pasarella Güçlendirilmesi', text: 'Deniz merdiveninin bağlantı noktaları taşıyıcı aksamı ile pasarellanın hidrolik/mekanik gövde bağlantı elemanları kontrol edilmiş, gerekli yapısal takviyeler yapılarak kullanım güvenliği maksimuma çıkarılmıştır.' },
        { title: 'Servis Botu Bakımı', text: 'Tekneye ait 1 adet servis botuna (tender) profesyonel pasta-polish (parlatma) işlemi yapılmış ve su altı kesimine uygun zehirli boya uygulaması gerçekleştirilmiştir.' },
      ],
    },
  ],
  financeTitle: '3. MALİ HÜKÜMLER, EK MARİNA ÜCRETİ VE ÖDEME PLANI',
  finance: [
    { title: 'Sözleşmeler Toplam Bedeli', text: 'Karina Gövde Restorasyonu ve Bakım-Onarım Bedeli: ………\nMarangozluk ve Teak Güverte Yenileme Bedeli: ………\nToplam Birleşik Proje Bedeli: 50.000 € (Elli Bin Euro) olarak sabittir. (Bu fiyatlara her iki sözleşmenin malzeme, işçilik ve standart marina giriş ücretleri dahildir.)' },
    { title: 'KDV Durumu', text: "Belirtilen toplam bedele %20 KDV ayrıca eklenecektir. Ödemelerin Türk Lirası (TL) yapılması halinde ödeme tarihindeki T.C. Merkez Bankası Euro satış kuru esas alınır." },
    { title: 'Ek Marina Konaklama Ücreti', text: "Madde 2-D'de belirtilen ve kaptanın isteği üzerine yapılan ek işlerin (ek jelkot, merdiven, pasarella ve servis botu işlemleri) iş takvimine eklenmesi sebebiyle, teknenin marinada kalış süresi uzamıştır. Bu doğrultuda oluşan 7 (yedi) günlük ekstra marina konaklama/giriş ücreti işverene (tekne sahibine) ait olup, ilgili marinaya doğrudan işveren tarafından ödenecektir." },
    { title: 'Ödeme Dağılımı ve Tahsilat Durumu', text: '1. Karina Sözleşmesi Tahsilatları: ……… TL peşinat, 500.000 TL kazıma sonu taksiti ……… TL Mayıs ayı (suya iniş öncesi) taksiti olmak üzere toplam ……… ara ödeme yükleniciye ödenmiştir.\n2. Final Bakiyesi: Her iki sözleşmenin (Gövde + Teak Güverte) toplam bedelinden ……… geriye kalan tüm bakiye, teknenin suya indirilmesi ve işbu nihai birleşik teslim protokolünün imzalanması ile birlikte Yükleniciye nakden/hesaba havale yoluyla ödenecektir. Kaptanın istediği ek işler için yüklenici tarafından ek bir ücret talep edilmeyecektir.' },
  ],
  guaranteeTitle: '4. GARANTİ, TESLİM VE İBRA',
  guarantee: [
    { title: 'İşçilik Garantisi', text: 'Nexus Marin, işbu protokolde dökümü yapılan tüm yapısal gövde restorasyonu, laminasyon, marangozluk, imalat ve bakım işçilikleri için teslim tarihinden itibaren 6 (altı) ay süreyle işçilik garantisi vermektedir. Malzeme kaynaklı üretici hataları garanti kapsamı dışındadır.' },
    { title: 'Eksiksiz Teslimat', text: `İşveren, ${vessel} teknesini ve servis botunu; karina restorasyonu, kullanılan elyaf/macun standartları, 12mm Birmanya teak işçiliği, marangozluk imalatları, mekanik montajlar, ek güçlendirmeler ve kozmetik uygulamalar açısından detaylıca kontrol etmiş; tüm işlerin projesine, teknik standartlara uygun olarak eksiksiz, kusursuz ve ayıpsız olarak teslim aldığını kabul, beyan ve taahhüt eder.` },
    { title: 'Karşılıklı İbra', text: 'İşbu protokolün imzalanması ve final bakiyesinin yüklenici hesabına geçmesiyle birlikte; taraflar sözleşmelerden doğan tüm edimlerini karşılıklı olarak yerine getirdiklerini kabul ederek birbirlerini gayrikabili rücu suretiyle ibra ederler. Kaptan istekleri doğrultusunda yapılan ek işler için ücret ödenmediği, buna karşılık 7 günlük ek marina ücretinin işverene ait olduğu hususlarında taraflar mutabıktır.' },
  ],
  closing: "İşbu nihai birleşik teslim ve ibra protokolü 2 sayfa, 4 ana maddeden oluşmakta olup 25 / 05 / 2026 tarihinde Fethiye'de 2 (iki) nüsha olarak tarafların karşılıklı rızası ile imzalanmış ve yürürlüğe girmiştir.",
  jurisdiction: 'Doğacak uyuşmazlıklarda Fethiye Mahkemeleri ve İcra Daireleri yetkilidir.',
  employerSign: { name: '', date: '25 / 05 / 2026' },
  contractorSign: { name: 'Ramazan DEMİR', date: '25 / 05 / 2026' },
});

/** Müşteri onayına gönderilebilen belge türleri */
export const APPROVAL_REPORT_TYPES = ['DELIVERY_PROTOCOL', 'PROJECT_PROPOSAL'] as const;
export const APPROVAL_STATUS_LABELS: Record<string, string> = { PENDING: 'Onay bekliyor', APPROVED: 'Onay alındı', REJECTED: 'Reddedildi' };
