/* eslint-disable no-console */
import { PrismaClient, type Customer, type User, type Priority, type WorkOrderStatus, type Role, type MaintenanceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INSPECTION_TEMPLATE, INSPECTION_TEMPLATE_VERSION, HULL_RESTORATION_PHASES, protocolTemplate, proposalTemplate, scrapingTemplate } from '@nexus/shared';
import { extendSeries } from '../src/services/maintSeries';

/**
 * Sade demo verisi: 4 tekne, 4 müşteri, bakım paketleri (periyodik seriler dahil),
 * ~12 anlamlı iş emri ve 6 arıza kaydı. Her çalıştırmada veritabanını sıfırlar —
 * GERÇEK VERİ OLAN SUNUCUDA ÇALIŞTIRMAYIN.
 */
const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Nexus2026!';

const DAY = 864e5;
const day = (offset: number, hour = 9, min = 0) => {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const startToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// ---------------------------------------------------------------------------
// Bakım paketleri — "Yeni bakım" formunda paket olarak seçilebilir
// ---------------------------------------------------------------------------
type Pkg = { title: string; category: string; subType?: string; description: string; hours: number; steps: string[] };
const PKG: Record<string, Pkg> = {
  marinaTour: {
    title: 'Haftalık Marina Bakım Turu',
    category: 'MARINA_TURU',
    description: 'Tekne marinada beklerken her hafta yapılan rutin tur: elektrik, sintine, bağlama ve havalandırma kontrolü.',
    hours: 1.5,
    steps: ['Sahil beslemesi kablosu ve fiş kontrolü', 'Akü bankası voltaj ve şarj kontrolü', 'Sintine havuzları ve otomatik pompa testi', 'Palamar halatları ve usturmaça kontrolü', 'Kabin havalandırma ve nem kontrolü', 'Güverte tatlı su yıkaması'],
  },
  basicCare: {
    title: 'Temel Koruma Paketi',
    category: 'MECHANICAL',
    description: 'Aylık temel kontrol: motorlar çalıştırılır, sıvı seviyeleri ve deniz suyu devresi kontrol edilir, tekne genel durumu raporlanır.',
    hours: 3,
    steps: ['Ana makine yağ ve soğutma sıvısı seviyeleri', 'Deniz suyu filtreleri (strainer) temizliği', 'Racor yakıt separatörü su/tortu kontrolü', 'Motorların 15 dk test çalıştırması', 'Kinistin vanaları ve hortum kelepçeleri', 'Fotoğraflı durum raporu'],
  },
  engine250: {
    title: 'Motor Sağlık Paketi (250 saat)',
    category: 'MOTOR_SAGLIK',
    description: 'Her 250 motor saatinde: yağ ve filtre değişimi, yakıt filtreleri, çark ve anot kontrolü.',
    hours: 6,
    steps: ['Motor yağı ve yağ filtresi değişimi', 'Racor yakıt filtresi değişimi', 'Deniz suyu pompası çark kontrolü', 'Isı eşanjörü anot kontrolü', 'V-kayış gerginliği ve aşınma kontrolü', 'Test çalıştırma ve kaçak kontrolü'],
  },
  generator: {
    title: 'Jeneratör Bakım Paketi',
    category: 'JENERATOR',
    description: '6 ayda bir jeneratör bakımı: yağ, filtreler, çark ve yük testi.',
    hours: 3,
    steps: ['Jeneratör yağ ve filtre değişimi', 'Yakıt ön filtresi değişimi', 'Deniz suyu çarkı değişimi', 'Ses kabini ve sintine temizliği', 'Klima yükü altında 230V / 50Hz testi'],
  },
  electric: {
    title: 'Elektrik Güvenlik Paketi',
    category: 'ELECTRICAL',
    description: 'Yıllık elektrik güvenliği: aküler, panolar, kaçak akım ve seyir fenerleri.',
    hours: 4,
    steps: ['Akü yük testi (servis ve start)', 'Ana pano sigorta ve bağlantı sıkılığı', 'Kaçak akım rölesi (RCD) testi', 'Galvanik izolatör ve sahil beslemesi', 'İnverter / redresör testi', 'Seyir fenerleri kontrolü'],
  },
  shine: {
    title: 'Parlak Gövde Paketi',
    category: 'COSMETIC',
    description: 'Gövde ve üst yapıya 3 aşamalı pasta-polish, koruyucu cila ve paslanmaz parlatma.',
    hours: 16,
    steps: ['Gövde yıkama ve su hattı leke temizliği', 'Pasta (kaba – ince)', 'Polish', 'Koruyucu cila (wax)', 'Krom ve paslanmaz parlatma'],
  },
  teak: {
    title: 'Teak Yenileme Paketi',
    category: 'TEAK',
    description: 'Teak güverte temizliği, derz onarımı, zımpara ve koruyucu uygulaması.',
    hours: 20,
    steps: ['İki bileşenli teak temizliği', 'Derz kontrolü ve gerekli yerlerde yenileme', 'Hafif zımpara (P120)', 'Teak koruyucu / yağ uygulaması'],
  },
  winter: {
    title: 'Kış Hazırlık Paketi',
    category: 'KIS_HAZIRLIK',
    description: 'Teknenin kış dönemine hazırlanması: yağ değişimi, antifriz, tatlı su sistemi ve nem önlemleri.',
    hours: 8,
    steps: ['Ana makine ve jeneratör yağ değişimi', 'Antifriz yoğunluk kontrolü ve tamamlama', 'Tatlı su sistemi ve boyler boşaltma', 'Akülere bakım şarjı', 'Nem alıcı ve havalandırma yerleşimi', 'Branda ve güverte örtüleri'],
  },
  haulOut: {
    title: 'Yıllık Kara Bakımı Paketi',
    category: 'HAUL_OUT',
    description: 'Yıllık karaya alma: kazıma, nem ölçümü, anotlar, şaft-pervane ve 2 kat zehirli boya.',
    hours: 40,
    steps: ['Karaya alma ve basınçlı yıkama', 'Mekanik kazıma ve nem ölçümü', 'Anot değişimi', 'Şaft ve pervane polisajı', 'Zehirli boya (2 kat)', 'Suya indirme ve kaçak kontrolü'],
  },
};

async function main() {
  console.log('Veritabanı temizleniyor...');
  const tables = ['Notification', 'PushToken', 'AuditLog', 'Attachment', 'Document', 'Payment', 'PaymentInstallment', 'QuoteItem', 'Quote', 'MaterialUsage', 'Material', 'ChangeRequest', 'ProjectTask', 'ProjectPhase', 'ReportVersion', 'Report', 'FaultComment', 'Fault', 'InspectionItem', 'Inspection', 'WorkOrderComment', 'WorkOrderHistory', 'MaintenanceComment', 'MaintenancePlan', 'WorkOrder', 'Project', 'Engine', 'VesselMember', 'Vessel', 'CustomerNote', 'User', 'Customer', 'Setting', 'Counter'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  // Bakım başlıkları = bakım paketleri (sekmeler). Yerleşik 4 anahtar korunur, adları paketlere çevrilir
  await prisma.maintCategory.deleteMany({ where: { builtIn: false } });
  const CATS: Array<[string, Pkg, string, string]> = [
    ['MECHANICAL', PKG.basicCare, 'Temel Koruma', '#0B2342'],
    ['MARINA_TURU', PKG.marinaTour, 'Marina Turu', '#1767AD'],
    ['MOTOR_SAGLIK', PKG.engine250, 'Motor Sağlık', '#0E9488'],
    ['JENERATOR', PKG.generator, 'Jeneratör', '#B26A00'],
    ['ELECTRICAL', PKG.electric, 'Elektrik Güvenlik', '#5B9BD8'],
    ['COSMETIC', PKG.shine, 'Parlak Gövde', '#7FB6E8'],
    ['TEAK', PKG.teak, 'Teak Yenileme', '#8A5A2B'],
    ['KIS_HAZIRLIK', PKG.winter, 'Kış Hazırlık', '#6D5BD0'],
    ['HAUL_OUT', PKG.haulOut, 'Kara Bakımı', '#2F6FB5'],
  ];
  for (const [i, [key, p, short, color]] of CATS.entries()) {
    const data = { label: p.title, short, items: p.steps, color, sortOrder: i + 1, isActive: true };
    await prisma.maintCategory.upsert({ where: { key }, update: data, create: { key, ...data } });
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = (email: string, name: string, roles: Role[], extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { email, name, roles, passwordHash: hash, ...extra } });

  // ---------------- Personel ----------------
  const admin = await mkUser('admin@nexusmarine.com', 'Ramazan Demir', ['SUPER_ADMIN'], { title: 'Genel Müdür', phone: '+90 532 000 00 01' });
  const ops = await mkUser('operasyon@nexusmarine.com', 'Selin Deniz', ['OPERATIONS_MANAGER'], { title: 'Operasyon Müdürü', phone: '+90 532 000 00 02' });
  const ops2 = await mkUser('teknik.mudur@nexusmarine.com', 'Barış Kaptanoğlu', ['OPERATIONS_MANAGER', 'TECHNICIAN'], { title: 'Teknik Müdür', phone: '+90 532 000 00 03' });
  const emre = await mkUser('teknisyen@nexusmarine.com', 'Emre Usta', ['TECHNICIAN'], { title: 'Makine Teknisyeni', phone: '+90 533 210 44 10' });
  const ali = await mkUser('ali.vural@nexusmarine.com', 'Ali Vural', ['TECHNICIAN'], { title: 'Elektrik & Elektronik Teknisyeni', phone: '+90 533 318 27 64' });
  const onur = await mkUser('onur.kara@nexusmarine.com', 'Onur Kara', ['TECHNICIAN'], { title: 'Kompozit / Gövde Uzmanı', phone: '+90 533 452 19 83' });
  const cem = await mkUser('cem.aktas@nexusmarine.com', 'Cem Aktaş', ['TECHNICIAN'], { title: 'Boya, Polish ve Teak Uzmanı', phone: '+90 533 587 36 21' });

  // ---------------- Müşteriler ----------------
  const custDefs: Array<[string, string | null, string, string, string]> = [
    ['Ahmet Yılmaz', 'Yılmaz Holding A.Ş.', 'ahmet.yilmaz@example.com', '+90 532 410 22 31', 'Göcek, Fethiye'],
    ['Elif Kaya', null, 'elif.kaya@example.com', '+90 533 517 48 02', 'Beşiktaş, İstanbul'],
    ['Mehmet Demir', 'Demir Denizcilik Ltd.', 'mehmet.demir@example.com', '+90 535 624 90 15', 'Bodrum, Muğla'],
    ['Ayşe Şahin', null, 'ayse.sahin@example.com', '+90 536 731 05 77', 'Marmaris, Muğla'],
  ];
  const customers: Customer[] = [];
  for (const [name, company, email, phone, address] of custDefs) customers.push(await prisma.customer.create({ data: { name, company, email, phone, address, status: 'ACTIVE' } }));

  // ---------------- Tekneler ----------------
  const mkVessel = (d: { name: string; type: string; make: string; model: string; year: number; lengthM: number; flag: string; marina: string; berth: string; owner: number; gen: Record<string, unknown> | null; engines: Array<[string, string, string, number]>; equipment: Array<Record<string, string>>; notes?: string }) =>
    prisma.vessel.create({
      data: {
        name: d.name, type: d.type, make: d.make, model: d.model, year: d.year, lengthM: d.lengthM, flag: d.flag, marina: d.marina, berth: d.berth, notes: d.notes,
        ownerId: customers[d.owner].id, contactPhone: customers[d.owner].phone, contactEmail: customers[d.owner].email,
        generatorInfo: (d.gen ?? undefined) as any,
        batteryInfo: { service: { type: 'AGM', count: d.type === 'Yelkenli' ? 4 : 8, capacityAh: 200, voltage: d.type === 'Yelkenli' ? 12 : 24 }, start: { type: 'AGM', count: 2, capacityAh: 120, voltage: d.type === 'Yelkenli' ? 12 : 24 }, installedAt: '2024-04-15' },
        equipment: d.equipment,
        engines: { create: d.engines.map(([position, make, model, hours], i) => ({ position, make, model, hours, serialNumber: `${make.slice(0, 3).toUpperCase()}-${d.year}-${i + 1}${String(hours).slice(-3)}` })) },
      },
      include: { engines: true },
    });
  const any = await mkVessel({
    name: 'M/Y ANY', type: 'Motoryat', make: 'Cranchi', model: '66 Flybridge', year: 2013, lengthM: 21.3, flag: 'Türkiye', marina: 'D-Marin Göcek', berth: 'B-39', owner: 0,
    gen: { make: 'Kohler', model: '20EFOZD', powerKw: 20, hours: 3412 },
    engines: [['İskele Ana Makine', 'Volvo Penta', 'IPS 1200 (D13)', 1846], ['Sancak Ana Makine', 'Volvo Penta', 'IPS 1200 (D13)', 1851], ['Jeneratör', 'Kohler', '20EFOZD', 3412]],
    equipment: [{ name: 'Su yapıcı', make: 'Idromar', model: 'MC50' }, { name: 'Klima', make: 'Dometic', model: 'CW 16' }, { name: 'Plotter', make: 'Raymarine', model: 'Axiom Pro 16' }, { name: 'Servis botu', make: 'Williams', model: 'Turbojet 385' }],
  });
  const seaRods = await mkVessel({
    name: 'M/Y SEA RODS', type: 'Motoryat', make: 'Ferretti', model: '780', year: 2011, lengthM: 24.1, flag: 'Malta', marina: 'D-Marin Göcek', berth: 'Kara park K-12', owner: 1,
    gen: { make: 'Onan', model: '17.5 MDKBM', powerKw: 17.5, hours: 5120 },
    engines: [['İskele Ana Makine', 'MAN', 'V12-1400', 2930], ['Sancak Ana Makine', 'MAN', 'V12-1400', 2941], ['Jeneratör', 'Onan', '17.5 MDKBM', 5120]],
    equipment: [{ name: 'Su yapıcı', make: 'Sea Recovery', model: 'Aqua Whisper' }, { name: 'Klima', make: 'Marine Air', model: 'Chiller 48K' }, { name: 'Radar', make: 'Furuno', model: 'DRS4D-NXT' }],
    notes: 'Gövde restorasyonu nedeniyle karada.',
  });
  const blue = await mkVessel({
    name: 'M/Y BLUE HORIZON', type: 'Motoryat', make: 'Princess', model: 'Y85', year: 2019, lengthM: 26.4, flag: 'İngiltere', marina: 'Yalıkavak Marina', berth: 'C-14', owner: 2,
    gen: { make: 'Kohler', model: '25EFKOZD', powerKw: 25, hours: 2240 },
    engines: [['İskele Ana Makine', 'MTU', '12V 2000 M96', 1520], ['Sancak Ana Makine', 'MTU', '12V 2000 M96', 1517], ['Jeneratör', 'Kohler', '25EFKOZD', 2240]],
    equipment: [{ name: 'Baş pervane', make: 'Side-Power', model: 'SE 170' }, { name: 'Stabilizer', make: 'Seakeeper', model: '9' }, { name: 'Plotter', make: 'Garmin', model: 'GPSMAP 8616' }],
  });
  const lodos = await mkVessel({
    name: 'S/Y LODOS', type: 'Yelkenli', make: 'Beneteau', model: 'Oceanis 60', year: 2018, lengthM: 18.2, flag: 'Türkiye', marina: 'Netsel Marmaris', berth: 'D-07', owner: 3,
    gen: { make: 'Onan', model: 'QD 9', powerKw: 9, hours: 1310 },
    engines: [['Ana Makine', 'Yanmar', '4JH110', 1640]],
    equipment: [{ name: 'Irgat', make: 'Lewmar', model: 'V4' }, { name: 'Otopilot', make: 'B&G', model: 'NAC-3' }, { name: 'Yelken', make: 'North Sails', model: '3Di (2023)' }],
  });

  // ---------------- Kaptanlar ve müşteri hesapları ----------------
  const hasan = await mkUser('kaptan@nexusmarine.com', 'Kpt. Hasan Reis', ['CAPTAIN'], { phone: '+90 542 300 10 20', vesselLinks: { create: [{ vesselId: any.id, relation: 'CAPTAIN' }] } });
  const levent = await mkUser('kaptan2@example.com', 'Kpt. Levent Dalgıç', ['CAPTAIN'], { phone: '+90 542 301 10 21', vesselLinks: { create: [{ vesselId: seaRods.id, relation: 'CAPTAIN' }] } });
  const orhan = await mkUser('kaptan3@example.com', 'Kpt. Orhan Poyraz', ['CAPTAIN'], { phone: '+90 542 302 10 22', vesselLinks: { create: [{ vesselId: blue.id, relation: 'CAPTAIN' }] } });
  const ahmet = await mkUser('musteri@nexusmarine.com', customers[0].name, ['OWNER'], { customerId: customers[0].id, phone: customers[0].phone });
  const elif = await mkUser('sahip2@example.com', customers[1].name, ['OWNER'], { customerId: customers[1].id, phone: customers[1].phone });
  const mehmet = await mkUser(customers[2].email!, customers[2].name, ['OWNER'], { customerId: customers[2].id, phone: customers[2].phone });
  const ayse = await mkUser(customers[3].email!, customers[3].name, ['OWNER'], { customerId: customers[3].id, phone: customers[3].phone });

  // ---------------- Malzemeler ----------------
  const materialDefs: Array<[string, string, string, number, number, number]> = [
    ['Motor yağı 15W-40', 'Yağlar', 'L', 320, 100, 6.5],
    ['Yağ filtresi (Volvo Penta D13)', 'Filtreler', 'adet', 18, 6, 42],
    ['Yakıt filtresi Racor 2040', 'Filtreler', 'adet', 24, 8, 24],
    ['Deniz suyu pompası çarkı', 'Yedek Parça', 'adet', 9, 4, 65],
    ['Antifriz (soğutma sıvısı)', 'Yağlar', 'L', 120, 40, 5.2],
    ['Zehirli boya International Micron 350', 'Boya', 'L', 60, 20, 58],
    ['Epoksi astar Interprotect', 'Boya', 'L', 40, 10, 44],
    ['Epoksi reçine West System 105', 'Kompozit', 'kg', 55, 15, 32],
    ['Cam elyaf mat 450gr', 'Kompozit', 'm²', 140, 50, 4.8],
    ['Polyester macun', 'Kompozit', 'kg', 30, 10, 12],
    ['Pasta 3M Perfect-It', 'Polish', 'L', 14, 6, 42],
    ['Teak derz macunu Sikaflex 290i', 'Teak', 'adet', 36, 20, 19],
    ['AGM akü 12V 200Ah', 'Elektrik', 'adet', 3, 4, 420],
    ['Şaft keçesi seti (Tides Marine)', 'Yedek Parça', 'set', 2, 2, 380],
    ['Anot (çinko) şaft', 'Yedek Parça', 'adet', 30, 12, 18],
  ];
  const mat: Record<string, { id: string; unitCost: number }> = {};
  for (const [i, [name, category, unit, stock, minStock, unitCost]] of materialDefs.entries()) {
    mat[name] = await prisma.material.create({ data: { name, category, unit, stock, minStock, unitCost, sku: `NM-${String(i + 1).padStart(4, '0')}` } });
  }
  const useMat = (name: string, quantity: number, workOrderId: string, userId: string, usedAt: Date) =>
    prisma.materialUsage.create({ data: { materialId: mat[name].id, workOrderId, quantity, unitCost: mat[name].unitCost, userId, usedAt } });

  // ---------------- Bakım planları (paketler) ----------------
  const stepsOf = (p: Pkg, doneCount: number, by?: User, at?: Date) => p.steps.map((label, i) => (i < doneCount ? { label, done: true, doneAt: (at ?? new Date()).toISOString(), doneBy: by?.name ?? null } : { label, done: false }));
  const mkPlan = (p: Pkg, vesselId: string, d: { date: Date; status: MaintenanceStatus; tech?: User | null; helpers?: User[]; priority?: Priority; done?: number; note?: string; engineId?: string; intervalEngineHours?: number; dueEngineHours?: number; intervalDays?: number; haulOut?: Date; launch?: Date; source?: string; requestedBy?: User; materials?: Array<{ name: string; quantity: number; unit: string }>; endDate?: Date }) => {
    const completed = d.status === 'COMPLETED';
    const doneCount = completed ? p.steps.length : d.done ?? 0;
    return prisma.maintenancePlan.create({
      data: {
        title: p.title, category: p.category, subType: p.subType, description: p.description, vesselId,
        plannedDate: d.date, startDate: d.date, endDate: d.endDate ?? (completed ? new Date(d.date.getTime() + p.hours * 36e5) : null),
        technicianId: d.tech?.id ?? null, helperIds: (d.helpers ?? []).map((h) => h.id), priority: d.priority ?? 'MEDIUM',
        estimatedHours: p.hours, actualHours: completed ? Math.round(p.hours * 1.1 * 10) / 10 : null, status: d.status,
        checklist: stepsOf(p, doneCount, d.tech ?? undefined, d.date),
        completedAt: completed ? new Date(d.date.getTime() + p.hours * 36e5) : null,
        completedById: completed ? d.tech?.id : null, completedBy: completed ? d.tech?.name : null,
        completionNote: completed ? d.note ?? 'Tüm adımlar tamamlandı, herhangi bir olumsuzluk tespit edilmedi.' : null,
        engineId: d.engineId, intervalEngineHours: d.intervalEngineHours, dueEngineHours: d.dueEngineHours, intervalDays: d.intervalDays,
        haulOutDate: d.haulOut, launchDate: d.launch, plannedMaterials: d.materials,
        source: d.source ?? 'STAFF', requestedById: d.requestedBy?.id,
      },
    });
  };
  /** Periyodik seri: geçmiş tekrarlar tamamlanmış olarak eklenir, ileriye dönük planları extendSeries üretir */
  const mkSeries = async (p: Pkg, vesselId: string, rule: { repeatWeekdays?: number[]; repeatMonthDay?: number }, past: Date[], tech: User, notes: string[]) => {
    let seriesId: string | null = null;
    for (const [i, date] of past.entries()) {
      const m = await mkPlan(p, vesselId, { date, status: 'COMPLETED', tech, note: notes[i % notes.length] });
      seriesId ??= m.id;
      await prisma.maintenancePlan.update({ where: { id: m.id }, data: { seriesId, repeatWeekdays: rule.repeatWeekdays ?? [], repeatMonthDay: rule.repeatMonthDay ?? null, repeatUntil: day(90) } });
    }
    await extendSeries(seriesId!);
    return seriesId!;
  };
  const today0 = startToday();
  // Bu haftanın pazartesi 10:00'u ve önceki pazartesiler
  const thisMonday = new Date(today0.getTime() - ((today0.getDay() + 6) % 7) * DAY); thisMonday.setHours(10, 0, 0, 0);
  const pastMondays = [3, 2, 1].map((k) => new Date(thisMonday.getTime() - k * 7 * DAY));
  if (thisMonday < today0) pastMondays.push(thisMonday);
  const pastMonthly = (dom: number, n: number) => {
    const out: Date[] = [];
    for (let k = n; k >= 0; k--) { const d = new Date(today0.getFullYear(), today0.getMonth() - k, dom, 9, 30); if (d < today0) out.push(d); }
    return out.slice(-n);
  };

  await mkSeries(PKG.marinaTour, any.id, { repeatWeekdays: [1] }, pastMondays, emre, ['Sahil beslemesi ve aküler normal. Sintine kuru.', 'Kıç spring halatında hafif aşınma, değiştirildi.', 'Tüm kontroller normal, kabinler havalandırıldı.']);
  await mkSeries(PKG.basicCare, blue.id, { repeatMonthDay: 20 }, pastMonthly(20, 2), emre, ['Motorlar test edildi, sıvı seviyeleri tamam.', 'İskele strainer kapağı O-ringi yenilendi.']);
  await mkSeries(PKG.basicCare, lodos.id, { repeatMonthDay: 5 }, pastMonthly(5, 2), ops2, ['Makine ve sintine kontrolleri normal.', 'Racor haznesinde az miktar su, tahliye edildi.']);

  const anyPort = any.engines.find((e) => e.position.startsWith('İskele'))!;
  await mkPlan(PKG.engine250, any.id, { date: day(9), status: 'PLANNED', tech: emre, priority: 'HIGH', engineId: anyPort.id, intervalEngineHours: 250, dueEngineHours: 2000, materials: [{ name: 'Motor yağı 15W-40', quantity: 60, unit: 'L' }, { name: 'Yağ filtresi (Volvo Penta D13)', quantity: 2, unit: 'adet' }, { name: 'Yakıt filtresi Racor 2040', quantity: 2, unit: 'adet' }] });
  const anyElectric = await mkPlan(PKG.electric, any.id, { date: day(0, 9), status: 'IN_PROGRESS', tech: ali, done: 3, endDate: day(0, 13) });
  await mkPlan(PKG.shine, any.id, { date: day(-20), status: 'COMPLETED', tech: cem, helpers: [onur], note: 'Gövde ve üst yapı pasta-polish yapıldı, paslanmazlar parlatıldı. Fotoğraflar eklendi.' });
  await mkPlan(PKG.winter, any.id, { date: day(18), status: 'PLANNED', tech: emre, priority: 'HIGH', materials: [{ name: 'Motor yağı 15W-40', quantity: 70, unit: 'L' }, { name: 'Antifriz (soğutma sıvısı)', quantity: 20, unit: 'L' }] });
  await mkPlan(PKG.generator, blue.id, { date: day(-3), status: 'OVERDUE', tech: emre, priority: 'HIGH', intervalDays: 180 });
  await mkPlan(PKG.teak, blue.id, { date: day(25), status: 'PLANNED', tech: cem, endDate: day(27, 17) });
  await mkPlan(PKG.electric, lodos.id, { date: day(-12), status: 'COMPLETED', tech: ali, note: 'Servis aküleri yük testinden geçti. Pupa feneri ampulü LED ile değiştirildi.' });
  await mkPlan(PKG.haulOut, lodos.id, { date: day(30), status: 'PLANNED', tech: onur, helpers: [cem], priority: 'HIGH', haulOut: day(30), launch: day(36), endDate: day(36, 17) });
  await mkPlan(PKG.shine, lodos.id, { date: day(12), status: 'PLANNED', source: 'CUSTOMER', requestedBy: ayse, priority: 'LOW' });
  await prisma.maintenanceComment.createMany({
    data: [
      { planId: anyElectric.id, userId: ali.id, userName: ali.name, body: 'Aküler ve pano kontrolü bitti, öğleden sonra seyir fenerlerine geçiyorum.', createdAt: day(0, 11) },
      { planId: anyElectric.id, userId: ops.id, userName: ops.name, body: 'Servis akülerinden biri sınırdaysa teklif hazırlayalım.', internal: true, createdAt: day(0, 11, 20) },
    ],
  });

  // ---------------- İş emirleri ----------------
  let woCounter = 0;
  const year = new Date().getFullYear();
  const chain: WorkOrderStatus[] = ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'CLOSED'];
  type WoDef = { vessel: { id: string; name: string }; title: string; description: string; category: string; priority: Priority; status: WorkOrderStatus; tech?: User; requestedBy: User; start: number; hours: number; steps: string[]; summary?: string; projectId?: string; comments?: Array<[User, string, boolean, number]> };
  const mkWO = async (d: WoDef) => {
    const done = ['COMPLETED', 'PUBLISHED', 'CLOSED'].includes(d.status);
    const idx = chain.indexOf(d.status);
    const started = idx >= chain.indexOf('IN_PROGRESS') || ['ON_HOLD', 'REVISION_REQUIRED'].includes(d.status);
    const plannedStart = day(d.start, 9);
    const finished = idx >= chain.indexOf('TECHNICAL_REVIEW') ? new Date(plannedStart.getTime() + d.hours * 1.1 * 36e5) : null;
    // İleri tarihli işler de geçmişte (son 1-2 gün) talep edilmiş olur
    const createdAt = d.start - 3 < 0 ? day(d.start - 3, 10) : day(-1 - (woCounter % 2), 10 + woCounter % 5);
    const stepDone = (i: number) => done || d.status === 'TECHNICAL_REVIEW' || (started && i < Math.ceil(d.steps.length / 2));
    const wo = await prisma.workOrder.create({
      data: {
        number: `WO-${year}-${String(++woCounter).padStart(4, '0')}`,
        vesselId: d.vessel.id, title: d.title, description: d.description, category: d.category, priority: d.priority, status: d.status,
        technicianId: d.tech?.id, requestedById: d.requestedBy.id, projectId: d.projectId,
        plannedStart: idx >= chain.indexOf('PLANNED') || idx < 0 ? plannedStart : null,
        plannedEnd: idx >= chain.indexOf('PLANNED') || idx < 0 ? new Date(plannedStart.getTime() + d.hours * 36e5) : null,
        plannedHours: d.hours,
        actualHours: finished ? Math.round(d.hours * 1.1 * 10) / 10 : null,
        startedAt: started ? plannedStart : null, finishedAt: finished,
        publishedAt: ['PUBLISHED', 'CLOSED'].includes(d.status) ? finished : null,
        customerSummary: d.summary ?? null,
        createdAt,
        checklist: d.steps.map((label, i) => ({ label, done: stepDone(i) })),
      },
    });
    const path: WorkOrderStatus[] = idx >= 0 ? chain.slice(0, idx + 1) : ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', d.status];
    let prev: WorkOrderStatus | null = null;
    let lastAt = createdAt;
    for (const [k, s] of path.entries()) {
      const at = new Date(Math.min(createdAt.getTime() + k * 8 * 36e5, Date.now() - (path.length - k) * 60e3));
      await prisma.workOrderHistory.create({ data: { workOrderId: wo.id, userId: ['IN_PROGRESS', 'TECHNICAL_REVIEW'].includes(s) ? d.tech?.id : ops.id, fromStatus: prev, toStatus: s, createdAt: at, note: s === 'ON_HOLD' ? 'Parça bekleniyor' : null } });
      if (at > lastAt) lastAt = at;
      prev = s;
    }
    for (const [u, body, internal, hoursAgo] of d.comments ?? []) {
      const at = new Date(Date.now() - hoursAgo * 36e5);
      await prisma.workOrderComment.create({ data: { workOrderId: wo.id, userId: u.id, body, internal, createdAt: at } });
      if (at > lastAt) lastAt = at;
    }
    // Son işlem zamanı (seed anı değil, gerçek akış)
    if (finished && finished > lastAt && finished.getTime() < Date.now()) lastAt = finished;
    return prisma.workOrder.update({ where: { id: wo.id }, data: { updatedAt: lastAt } });
  };

  // Proje (SEA RODS gövde restorasyonu) — iş emirlerinden önce
  const project = await prisma.project.create({
    data: {
      name: 'M/Y SEA RODS Gövde Restorasyonu',
      vesselId: seaRods.id,
      managerId: ops2.id,
      description: 'Kazıma sonrası tespit edilen ozmoz ve nem bulguları nedeniyle alt gövde komple restorasyonu. Kurutma, emprenye, laminasyon, epoksi bariyer ve zehirli boya uygulaması.',
      startDate: day(-35),
      endDate: day(25),
      status: 'ACTIVE',
      budget: 68500,
      currency: 'EUR',
    },
  });

  const woPasarella = await mkWO({
    vessel: any, title: 'Pasarella hidrolik mekanizması onarımı', description: 'Haftalık denetimde pasarellanın teleskopik açılırken takıldığı tespit edildi. Hidrolik piston keçeleri ve hortum bağlantıları kontrol edilecek.',
    category: 'MECHANICAL', priority: 'HIGH', status: 'PUBLISHED', tech: emre, requestedBy: ops, start: -6, hours: 4,
    steps: ['Hidrolik yağ seviyesi ve kaçak kontrolü', 'Piston keçelerinin değişimi', 'Hortum bağlantılarının yenilenmesi', 'Açma-kapama testi (10 tekrar)'],
    summary: 'Pasarella hidrolik pistonunun keçeleri değiştirildi, sızdıran hortum bağlantısı yenilendi. 10 kez açma-kapama testi sorunsuz tamamlandı.',
    comments: [[emre, 'Keçe seti stoktan alındı, yarın sabah başlıyorum.', true, 150]],
  });
  const woGen = await mkWO({
    vessel: any, title: 'Jeneratör yük altında durma arızası', description: 'Müşteri bildirimi: klima çalıştırıldıktan yaklaşık 10 dakika sonra jeneratör kendiliğinden duruyor.',
    category: 'JENERATOR', priority: 'HIGH', status: 'ASSIGNED', tech: emre, requestedBy: ahmet, start: 1, hours: 3,
    steps: ['Arıza kodlarının okunması', 'Deniz suyu devresi ve çark kontrolü', 'Yakıt besleme ve filtre kontrolü', 'Yük testi (klima açık, 1 saat)'],
    comments: [
      [ahmet, 'Hafta sonu misafirimiz var, cumaya kadar yetişebilir mi?', false, 20],
      [ops, 'Merhaba Ahmet Bey, Emre Usta yarın sabah teknede olacak. Büyük ihtimalle çark kaynaklı; cumaya yetiştireceğiz.', false, 18],
      [emre, 'Geçen sene de aynı semptom vardı, çarkı yanımda götürüyorum.', true, 17],
    ],
  });
  const woWindlass = await mkWO({
    vessel: lodos, title: 'Irgat zincir dişlisi (gypsy) değişimi', description: 'Demir alırken zincir dişliden kaçıyor. Aşınmış gypsy değiştirilecek, zincir kalibresi kontrol edilecek.',
    category: 'MECHANICAL', priority: 'MEDIUM', status: 'PUBLISHED', tech: ops2, requestedBy: ayse, start: -4, hours: 3,
    steps: ['Zincir kalibre ölçümü', 'Gypsy sökümü ve yenisinin montajı', 'Kavrama ve fren ayarı', 'Demir alma-bırakma testi'],
    summary: 'Aşınmış zincir dişlisi (gypsy) yenisiyle değiştirildi, kavrama ve fren ayarı yapıldı. Demir alma-bırakma testinde zincir kaçırma görülmedi.',
  });
  const woShaft = await mkWO({
    vessel: seaRods, title: 'Sancak şaft keçesi değişimi', description: 'Karada yapılan kontrolde sancak şaft keçesinden su sızıntısı izleri görüldü. Keçe seti yenilenecek.',
    category: 'HAUL_OUT', priority: 'HIGH', status: 'IN_PROGRESS', tech: onur, requestedBy: ops2, start: -1, hours: 6, projectId: project.id,
    steps: ['Şaft kaplininin sökülmesi', 'Eski keçenin çıkarılması', 'Yeni keçe setinin montajı', 'Şaft hizalama kontrolü', 'Suya inişte sızdırmazlık testi'],
    comments: [[onur, 'Kaplin söküldü, eski keçe tamamen sertleşmiş. Yeni set takılıyor.', false, 3]],
  });
  const woLam = await mkWO({
    vessel: seaRods, title: 'Alt gövde laminasyonu', description: 'Restorasyon projesi kapsamında iskele, sancak ve omurga bölgesinde cam elyaf laminasyon.',
    category: 'HAUL_OUT', priority: 'HIGH', status: 'IN_PROGRESS', tech: onur, requestedBy: ops2, start: -5, hours: 48, projectId: project.id,
    steps: ['İskele taraf laminasyon', 'Sancak taraf laminasyon', 'Omurga bölgesi laminasyon', 'Kür ve sertlik kontrolü'],
  });
  await mkWO({
    vessel: seaRods, title: 'Epoksi bariyer uygulaması', description: 'Laminasyon sonrası 5 kat Interprotect epoksi bariyer.',
    category: 'HAUL_OUT', priority: 'MEDIUM', status: 'PLANNED', tech: cem, requestedBy: ops2, start: 6, hours: 24, projectId: project.id,
    steps: ['Yüzey zımpara ve toz alma', '1–3. kat epoksi', '4–5. kat epoksi', 'Kat kalınlığı ölçümü'],
  });
  await mkWO({
    vessel: blue, title: 'Flybridge bimini brandasının yenilenmesi', description: 'Kaptan talebi: bimini brandası güneşten yıpranmış, dikiş yerlerinden su alıyor.',
    category: 'COSMETIC', priority: 'LOW', status: 'EVALUATION', requestedBy: orhan, start: 7, hours: 6,
    steps: ['Ölçü alma', 'Kumaş ve renk onayı', 'Dikim', 'Montaj'],
    comments: [[orhan, 'Mümkünse aynı lacivert renk olsun.', false, 30]],
  });
  await mkWO({
    vessel: any, title: 'Kıç güverte teak derz yenileme', description: 'Müşteri talebi: kıç güvertede derzler yer yer kalkmış.',
    category: 'TEAK', priority: 'MEDIUM', status: 'REQUESTED', requestedBy: ahmet, start: 10, hours: 12,
    steps: ['Hasarlı derzlerin tespiti', 'Eski derzin sökülmesi', 'Sikaflex 290i uygulaması', 'Zımpara ve temizlik'],
  });
  const woChiller = await mkWO({
    vessel: blue, title: 'Klima chiller gaz ve basınç kontrolü', description: 'Salon kliması yeterince soğutmuyor. Chiller gaz basınçları ve deniz suyu sirkülasyonu kontrol edilecek.',
    category: 'ELECTRICAL', priority: 'MEDIUM', status: 'TECHNICAL_REVIEW', tech: ali, requestedBy: orhan, start: -2, hours: 4,
    steps: ['Gaz basıncı ölçümü', 'Deniz suyu pompası debi kontrolü', 'Kondenser temizliği', 'Kabin sıcaklık testi'],
    comments: [[ali, 'Kondenser tıkalıydı, asit ile temizlendi. Basınçlar normale döndü.', true, 26]],
  });
  await mkWO({
    vessel: lodos, title: 'Yelken ve arma sezon sonu kontrolü', description: 'Sezon sonu: ana yelken, cenova, çarmıhlar ve donanım kontrolü.',
    category: 'MECHANICAL', priority: 'LOW', status: 'CLOSED', tech: ops2, requestedBy: ayse, start: -40, hours: 5,
    steps: ['Çarmıh ve istralya gerginlik kontrolü', 'Yelken dikiş ve UV şerit kontrolü', 'Vinç bakımı', 'Rapor'],
    summary: 'Arma ve yelkenler kontrol edildi. Cenova UV şeridinde 40 cm dikiş açılması tespit edildi ve yelkenciye gönderildi; diğer tüm donanım iyi durumda.',
  });
  await mkWO({
    vessel: any, title: 'Plotter yazılım ve harita güncellemesi', description: 'Raymarine Axiom Pro 16 yazılım ve Navionics harita güncellemesi.',
    category: 'ELECTRICAL', priority: 'LOW', status: 'CLOSED', tech: ali, requestedBy: hasan, start: -25, hours: 2,
    steps: ['Yazılım güncellemesi', 'Harita kartı güncellemesi', 'Radar ve AIS entegrasyon testi'],
    summary: 'Plotter yazılımı ve haritalar güncellendi; radar ve AIS entegrasyonu test edildi.',
  });
  const woBilge = await mkWO({
    vessel: blue, title: 'Sintine pompası şamandıra şalteri değişimi', description: 'Baş sintine pompası otomatikte devreye girmiyor; şamandıra şalteri arızalı.',
    category: 'ELECTRICAL', priority: 'HIGH', status: 'ON_HOLD', tech: emre, requestedBy: ops, start: -3, hours: 2,
    steps: ['Arızalı şalterin tespiti', 'Yeni şalter montajı', 'Otomatik çekiş testi'],
    comments: [[emre, 'Rule 35A şalter stokta yok, tedarikçi pazartesi teslim ediyor.', true, 40]],
  });

  // Malzeme kullanımları
  await useMat('Deniz suyu pompası çarkı', 1, woPasarella.id, emre.id, day(-6, 11));
  await useMat('Motor yağı 15W-40', 4, woWindlass.id, ops2.id, day(-4, 11));
  await useMat('Şaft keçesi seti (Tides Marine)', 1, woShaft.id, onur.id, day(0, 9));
  await useMat('Cam elyaf mat 450gr', 48, woLam.id, onur.id, day(-4, 10));
  await useMat('Epoksi reçine West System 105', 18, woLam.id, onur.id, day(-4, 10));

  // ---------------- Denetimler (M/Y ANY, haftalık) ----------------
  const mkInspection = async (offset: number, status: 'APPROVED' | 'SUBMITTED' | 'DRAFT', number: string, faultCodes: string[], attentionCodes: string[]) => {
    const insp = await prisma.inspection.create({
      data: {
        number, vesselId: any.id, inspectorId: emre.id, captainName: hasan.name, date: day(offset), status, templateVersion: INSPECTION_TEMPLATE_VERSION,
        submittedAt: status !== 'DRAFT' ? day(offset, 17) : null,
        approvedAt: status === 'APPROVED' ? day(offset + 1) : null,
        approvedById: status === 'APPROVED' ? ops.id : null,
        generalNotes: status !== 'DRAFT' ? 'Tekne genel olarak operasyonel durumdadır. Tespit edilen arızalar için kayıt açılmıştır.' : null,
        location: any.marina, pier: any.berth, inspectorTitle: 'Teknik Enspektör',
        operationalStatus: status === 'DRAFT' ? null : faultCodes.length ? 'FOLLOW_UP' : 'READY',
        pumpOutDone: status !== 'DRAFT',
        findings: [
          ...faultCodes.map((c) => ({ description: `${INSPECTION_TEMPLATE.flatMap((s) => s.items).find((x) => x.code === c)?.label ?? c} — onarım gerekiyor`, priority: 'MEDIUM', responsible: emre.name, serviceStatus: status === 'APPROVED' ? 'Giderildi' : 'Bekliyor' })),
          ...Array.from({ length: Math.max(0, 6 - faultCodes.length) }, () => ({ description: '', priority: null, responsible: '', serviceStatus: '' })),
        ],
      },
    });
    const weeks = Math.abs(offset) / 7;
    const readings: Record<string, [string, string]> = {
      'S17.1': [String(any.engines[0].hours - Math.round(weeks * 9)), String(any.engines[0].hours - Math.round(weeks * 9) - 9)],
      'S17.2': [String(any.engines[1].hours - Math.round(weeks * 9)), String(any.engines[1].hours - Math.round(weeks * 9) - 9)],
      'S17.3': [String(any.engines[2].hours - Math.round(weeks * 14)), String(any.engines[2].hours - Math.round(weeks * 14) - 14)],
      'S17.4': ['612', '604'],
      'S17.5': ['3.400 L / %68', '3.900 L / %78'],
      'S17.6': ['820 L / %82', '600 L / %60'],
      'S17.7': ['%15', '%60'],
    };
    const faults: Record<string, string> = {};
    for (const sec of INSPECTION_TEMPLATE) {
      for (const it of sec.items) {
        const check = sec.kind === 'CHECK';
        const result = !check || (status === 'DRAFT' && sec.code > 'S06') ? null : faultCodes.includes(it.code) ? 'FAULT' : attentionCodes.includes(it.code) ? 'ATTENTION' : it.code === 'S15.3' ? 'NA' : 'OK';
        const [measurement, previousMeasurement] = readings[it.code] ?? [null, null];
        const item = await prisma.inspectionItem.create({
          data: {
            inspectionId: insp.id, sectionCode: sec.code, itemCode: it.code, label: it.label, description: it.description, unit: it.unit,
            result: result as any, measurement: status === 'DRAFT' ? null : measurement, previousMeasurement,
            note: result === 'FAULT' ? 'Onarım gerekiyor.' : result === 'ATTENTION' ? 'Bir sonraki bakımda takip edilecek.' : null,
          },
        });
        if (result === 'FAULT' && status !== 'DRAFT') {
          const f = await prisma.fault.create({ data: { vesselId: any.id, title: it.label, description: `Denetim ${number} · ${sec.title}`, severity: 'HIGH', source: 'INSPECTION', inspectionItemId: item.id, reportedById: emre.id, status: 'OPEN', createdAt: day(offset, 15) } });
          faults[it.code] = f.id;
        }
      }
    }
    return { insp, faults };
  };
  const ins1 = await mkInspection(-8, 'APPROVED', `INS-${year}-0001`, ['S11.3'], ['S04.5']);
  await mkInspection(-1, 'SUBMITTED', `INS-${year}-0002`, ['S12.4'], ['S01.3']);
  await mkInspection(0, 'DRAFT', `INS-${year}-0003`, [], []);
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0001`, type: 'INSPECTION', title: `Haftalık Periyodik Teknik Denetim — ${any.name}`, vesselId: any.id, inspectionId: ins1.insp.id,
      status: 'PUBLISHED', customerVisible: true, createdById: ops.id,
      versions: { create: { version: 1, status: 'PUBLISHED', data: { inspectionId: ins1.insp.id }, createdById: ops.id, approvedById: ops.id, approvedAt: day(-7) } },
    },
  });

  // ---------------- Arızalar (toplam 6) ----------------
  // 1) Denetim → pasarella: iş emri yayınlandı, giderildi
  await prisma.fault.update({ where: { id: ins1.faults['S11.3'] }, data: { status: 'RESOLVED', workOrderId: woPasarella.id, resolvedAt: day(-5, 16), description: 'Denetim sırasında pasarella teleskopik açılırken takılıyor.' } });
  // 2) Denetim → derinlik sensörü: açık (INS-0002 ile oluştu)
  // 3) Müşteri → jeneratör: iş emri açıldı, teknisyen atandı
  await prisma.fault.create({ data: { vesselId: any.id, title: 'Jeneratör klima açılınca duruyor', description: 'Klima çalıştırıldıktan yaklaşık 10 dakika sonra jeneratör kendiliğinden duruyor, panelde hararet uyarısı görünüyor.', severity: 'HIGH', status: 'IN_PROGRESS', source: 'CUSTOMER', reportedById: ahmet.id, workOrderId: woGen.id, createdAt: day(-2, 19, 40) } });
  // 4) Kaptan → baş pervane: yeni, henüz iş emri yok
  const thruster = await prisma.fault.create({ data: { vesselId: blue.id, title: 'Baş pervane (thruster) tepki vermiyor', description: 'Marinaya girişte manevra sırasında baş pervane hiç çalışmadı. Kumanda panelinde hata ışığı yanıyor.', severity: 'CRITICAL', status: 'OPEN', source: 'CUSTOMER', reportedById: orhan.id, createdAt: day(0, 8, 15) } });
  await prisma.faultComment.create({ data: { faultId: thruster.id, userId: orhan.id, userName: orhan.name, body: 'Cumartesi çıkışımız var, acil bakabilir misiniz?', createdAt: day(0, 8, 20) } });
  // 5) Müşteri → irgat: giderildi
  await prisma.fault.create({ data: { vesselId: lodos.id, title: 'Irgat zinciri dişliden kaçırıyor', description: 'Demir alırken zincir birkaç kez dişliden boşaldı.', severity: 'MEDIUM', status: 'RESOLVED', source: 'CUSTOMER', reportedById: ayse.id, workOrderId: woWindlass.id, createdAt: day(-8, 18), resolvedAt: day(-4, 15) } });
  // 6) Teknisyen → şaft keçesi: işlemde
  await prisma.fault.create({ data: { vesselId: seaRods.id, title: 'Sancak şaft keçesinde sızıntı izi', description: 'Karada yapılan kontrolde sancak şaft keçesi çevresinde tuz ve su izi görüldü.', severity: 'HIGH', status: 'IN_PROGRESS', source: 'MANUAL', reportedById: onur.id, workOrderId: woShaft.id, createdAt: day(-3, 14) } });

  // ---------------- Proje detayları (SEA RODS) ----------------
  const phaseStatus = ['DONE', 'DONE', 'DONE', 'DONE', 'IN_PROGRESS', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'] as const;
  const phaseResp = [onur, onur, onur, onur, onur, cem, cem, cem, emre, ops2];
  for (const [i, name] of HULL_RESTORATION_PHASES.entries()) {
    const ph = await prisma.projectPhase.create({
      data: {
        projectId: project.id, name, order: i + 1, responsibleId: phaseResp[i].id,
        startDate: day(-35 + i * 6), endDate: day(-35 + i * 6 + 5), status: phaseStatus[i],
        materials: i === 4 ? 'Cam elyaf mat 450gr, epoksi reçine' : i === 6 ? 'Interprotect epoksi astar' : i === 7 ? 'Micron 350 zehirli boya' : null,
      },
    });
    const tasks = i === 4 ? ['İskele taraf laminasyon', 'Sancak taraf laminasyon', 'Omurga bölgesi laminasyon', 'Kür kontrolü'] : [`${name} — iskele`, `${name} — sancak`];
    for (const [k, t] of tasks.entries()) {
      await prisma.projectTask.create({ data: { phaseId: ph.id, title: t, done: phaseStatus[i] === 'DONE' || (phaseStatus[i] === 'IN_PROGRESS' && k < 2), weight: i === 4 ? 1.5 : 1 } });
    }
  }
  await prisma.changeRequest.createMany({
    data: [
      { projectId: project.id, requestedBy: levent.name, title: 'Şaft ve pervane polisajı + dinamik balans', description: 'Kaptan talebi — karada iken yapılması istendi.', extraDays: 2, extraCost: 2400, status: 'APPROVED', decidedAt: day(-10) },
      { projectId: project.id, requestedBy: elif.name, title: 'Su hattı şeridinin lacivert yenilenmesi', extraDays: 1, extraCost: 1800, status: 'PENDING' },
    ],
  });
  await prisma.payment.createMany({
    data: [
      { customerId: customers[1].id, projectId: project.id, amount: 20000, currency: 'EUR', date: day(-36), method: 'Havale', note: 'Avans' },
      { customerId: customers[1].id, projectId: project.id, amount: 15000, currency: 'EUR', date: day(-12), method: 'Havale', note: '2. hakediş' },
    ],
  });
  await prisma.paymentInstallment.createMany({
    data: [
      { projectId: project.id, dueDate: day(-36), amount: 20000, paid: true, note: 'Avans %30' },
      { projectId: project.id, dueDate: day(-12), amount: 15000, paid: true, note: 'Laminasyon başlangıcı' },
      { projectId: project.id, dueDate: day(5), amount: 18000, note: 'Boya öncesi' },
      { projectId: project.id, dueDate: day(28), amount: 15500, note: 'Teslim' },
    ],
  });

  // SEA RODS — kazıma sonrası rapor, teklif dosyası, teslim protokolü
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0002`, type: 'POST_SCRAPING', title: 'Kazıma Sonrası Teknik İnceleme Raporu — M/Y SEA RODS', vesselId: seaRods.id, projectId: project.id,
      status: 'PUBLISHED', customerVisible: true, createdById: ops2.id, currentVersion: 1,
      versions: {
        create: {
          version: 1, status: 'PUBLISHED', createdById: ops2.id, approvedById: ops.id, approvedAt: day(-37), createdAt: day(-38),
          clauses: [{ key: 'TECHNICAL_COMPLIANCE', text: 'Bu raporda belirtilen tespitler Nexus Marine teknik ekibi tarafından yerinde yapılan inceleme ve ölçümlere dayanmaktadır.', approvedById: ops.id, approvedByName: ops.name, approvedAt: day(-37) }],
          data: { reportDate: day(-38).toISOString(), inspectionDate: day(-40).toISOString(), location: 'D-Marin Göcek – Karada', inspector: onur.name, preparedBy: onur.name, ...scrapingTemplate(seaRods.name) },
        },
      },
    },
  });
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0003`, type: 'PROJECT_PROPOSAL', title: 'Proje Teklif Dosyası: Gövde Onarım ve İyileştirme — M/Y SEA RODS', vesselId: seaRods.id, projectId: project.id,
      status: 'PUBLISHED', customerVisible: true, createdById: ops2.id,
      approvalStatus: 'APPROVED', approvalRequestedAt: day(-37), approvalDecidedAt: day(-36), approvalDecidedById: elif.id, approvalDecidedBy: elif.name,
      versions: { create: { version: 1, status: 'PUBLISHED', createdById: ops2.id, approvedById: ops.id, approvedAt: day(-37), createdAt: day(-37), data: { reportDate: day(-37).toISOString(), ...proposalTemplate(seaRods.name), preparedBy1: onur.name, preparedBy2: ops2.name, approvedBy: ops.name } as any } },
    },
  });
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0004`, type: 'DELIVERY_PROTOCOL', title: 'Restorasyon ve Teslim Protokolü — M/Y SEA RODS', vesselId: seaRods.id, projectId: project.id,
      status: 'PUBLISHED', customerVisible: true, createdById: ops.id,
      // Müşteri onayladı, ödeme bekleniyor (Finans ve Tahsilat → Bekleyen ödeme)
      approvalStatus: 'APPROVED', approvalRequestedAt: day(-2), approvalDecidedAt: day(-1), approvalDecidedById: elif.id, approvalDecidedBy: elif.name,
      contractAmount: 5000, contractCurrency: 'EUR',
      versions: { create: { version: 1, status: 'PUBLISHED', createdById: ops.id, approvedById: ops.id, approvedAt: day(-1), createdAt: day(-2), data: { reportDate: day(-2).toISOString(), ...protocolTemplate('M/Y SEA RODS') } as any } },
    },
  });

  // ---------------- Teklifler ----------------
  const mkQuote = async (n: number, customerIdx: number, vesselId: string, title: string, status: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED', items: Array<[string, number, string, number]>) =>
    prisma.quote.create({
      data: {
        number: `TKF-${year}-${String(n).padStart(4, '0')}`, customerId: customers[customerIdx].id, vesselId, title, status, currency: 'EUR', vatRate: 20, validUntil: day(30),
        sentAt: status !== 'DRAFT' ? day(-5) : null, approvedAt: status === 'APPROVED' ? day(-2) : null, rejectedAt: status === 'REJECTED' ? day(-1) : null,
        items: { create: items.map(([description, quantity, unit, unitPrice], order) => ({ description, quantity, unit, unitPrice, order })) },
      },
    });
  await mkQuote(1, 0, any.id, 'Kış Hazırlık Paketi — M/Y ANY', 'SENT', [['Ana makine yağ ve filtre değişimi (2 motor)', 2, 'adet', 850], ['Jeneratör bakımı', 1, 'adet', 520], ['Antifriz ve tatlı su sistemi', 1, 'paket', 640], ['Branda ve nem önlemleri', 1, 'paket', 480]]);
  await mkQuote(2, 1, seaRods.id, 'Gövde restorasyonu', 'APPROVED', [['Jelkot soyma ve kazıma', 62, 'm²', 85], ['Kurutma ve nem takibi', 1, 'paket', 4800], ['Laminasyon ve epoksi bariyer', 62, 'm²', 420], ['Zehirli boya', 62, 'm²', 75]]);
  await mkQuote(3, 2, blue.id, 'Teak Yenileme Paketi — M/Y BLUE HORIZON', 'DRAFT', [['Teak temizliği ve derz onarımı', 34, 'm²', 95], ['Zımpara ve koruyucu uygulaması', 34, 'm²', 60]]);
  await prisma.counter.createMany({ data: [{ key: `WO-${year}`, value: woCounter }, { key: `INS-${year}`, value: 3 }, { key: `RPT-${year}`, value: 4 }, { key: `TKF-${year}`, value: 3 }] });

  // ---------------- Belgeler ve notlar ----------------
  await prisma.document.createMany({
    data: [
      { title: 'Yıllık Bakım Sözleşmesi 2026', category: 'CONTRACT', vesselId: any.id, customerId: customers[0].id, customerVisible: true, expiryDate: day(240) },
      { title: 'Can salı servis sertifikası', category: 'CERTIFICATE', vesselId: any.id, customerId: customers[0].id, customerVisible: true, expiryDate: day(45) },
      { title: 'Sigorta poliçesi', category: 'INSURANCE', vesselId: seaRods.id, customerId: customers[1].id, customerVisible: true, expiryDate: day(120) },
      { title: 'Sigorta poliçesi', category: 'INSURANCE', vesselId: blue.id, customerId: customers[2].id, customerVisible: true, expiryDate: day(200) },
    ],
  });
  await prisma.customerNote.createMany({
    data: [
      { customerId: customers[0].id, authorId: ops.id, body: 'Kış hazırlığını Aralık başında istiyor. Teklif gönderildi.' },
      { customerId: customers[1].id, authorId: ops2.id, body: 'Restorasyon sürecinde haftalık fotoğraflı bilgilendirme bekliyor.' },
      { customerId: customers[2].id, authorId: ops.id, body: 'Teknenin sezon boyunca charter takvimi yoğun; işler hafta içine planlanmalı.' },
    ],
  });

  // ---------------- Bildirimler ----------------
  const n = (userId: string, type: string, title: string, body: string, link: string, read = false) => ({ userId, type, title, body, link, readAt: read ? new Date() : null, dedupeKey: `seed-${userId}-${title}` });
  await prisma.notification.createMany({
    data: [
      n(ops.id, 'CRITICAL_FAULT', 'KRİTİK Arıza: M/Y BLUE HORIZON', 'Baş pervane (thruster) tepki vermiyor', `/faults/${thruster.id}`),
      n(ops.id, 'REVIEW_REQUIRED', 'Denetim onay bekliyor: M/Y ANY', `INS-${year}-0002 · 1 arıza`, '/inspections'),
      n(ops.id, 'REVIEW_REQUIRED', 'Teknik kontrol bekliyor', 'Klima chiller gaz ve basınç kontrolü', `/work-orders/${woChiller.id}`),
      n(ops.id, 'CUSTOMER_REQUEST', 'Ek iş talebi: M/Y SEA RODS Gövde Restorasyonu', 'Su hattı şeridinin lacivert yenilenmesi', `/projects/${project.id}`),
      n(admin.id, 'QUOTE_RESPONSE', `Teklif onaylandı: TKF-${year}-0002`, 'Gövde restorasyonu', '/finance'),
      n(emre.id, 'TASK_ASSIGNED', 'Size yeni iş atandı', 'Jeneratör yük altında durma arızası — M/Y ANY', `/work-orders/${woGen.id}`),
      n(emre.id, 'TASK_ASSIGNED', 'İş beklemede', 'Sintine pompası şamandıra şalteri değişimi', `/work-orders/${woBilge.id}`, true),
      n(ahmet.id, 'QUOTE_SENT', 'Yeni teklifiniz var', 'Kış Hazırlık Paketi — M/Y ANY', '/quotes'),
      n(ahmet.id, 'NEW_REPORT', 'Yeni teknik rapor yayınlandı', 'Haftalık Periyodik Teknik Denetim — M/Y ANY', '/documents', true),
      n(ayse.id, 'SERVICE_COMPLETED', 'Arızanız giderildi', 'Irgat zincir dişlisi değiştirildi.', '/maintenance', true),
    ],
  });

  const counts = await Promise.all([prisma.vessel.count(), prisma.workOrder.count(), prisma.fault.count(), prisma.maintenancePlan.count()]);
  console.log(`✔ Seed tamamlandı: ${counts[0]} tekne, ${counts[1]} iş emri, ${counts[2]} arıza, ${counts[3]} bakım planı.`);
  console.log(`  Demo şifre (tüm hesaplar): ${DEMO_PASSWORD}`);
  console.log('  admin@nexusmarine.com · operasyon@nexusmarine.com · teknisyen@nexusmarine.com · kaptan@nexusmarine.com · musteri@nexusmarine.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
