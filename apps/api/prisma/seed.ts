/* eslint-disable no-console */
import { PrismaClient, type User, type Customer, type Vessel, type Engine, type Material, type WorkOrder, type Priority, type WorkOrderStatus, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
type MaintenanceCategory = 'MECHANICAL' | 'ELECTRICAL' | 'HAUL_OUT' | 'COSMETIC';
import { INSPECTION_TEMPLATE, INSPECTION_TEMPLATE_VERSION, HULL_RESTORATION_PHASES, MAINTENANCE_CATEGORIES, protocolTemplate, proposalTemplate, scrapingTemplate } from '@nexus/shared';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Nexus2026!';

// Deterministik rastgele (her seed aynı veriyi üretir)
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const day = (offset: number, hour = 9) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const MARINAS = ['D-Marin Göcek', 'Yalıkavak Marina', 'Netsel Marmaris', 'Bodrum Milta Marina', 'Setur Kaş Marina', 'D-Marin Turgutreis', 'Ataköy Marina', 'Port Göcek'];
const MAKES: Array<[string, string, string, number]> = [
  ['Azimut', 'Grande 27', 'Motoryat', 27],
  ['Sunseeker', 'Manhattan 68', 'Motoryat', 21],
  ['Princess', 'Y85', 'Motoryat', 26],
  ['Ferretti', '780', 'Motoryat', 24],
  ['Riva', '76 Perseo', 'Motoryat', 23],
  ['Benetti', 'Delfino 95', 'Süperyat', 29],
  ['Sanlorenzo', 'SL86', 'Motoryat', 26],
  ['Pershing', '8X', 'Motoryat', 25],
  ['Lagoon', '620', 'Katamaran', 19],
  ['Beneteau', 'Oceanis 60', 'Yelkenli', 18],
  ['Custom', 'Gulet', 'Gulet', 32],
  ['Fairline', 'Squadron 68', 'Motoryat', 21],
];
const VESSEL_NAMES = ['ANY', 'SEA RODS', 'BLUE HORIZON', 'AEGEAN PEARL', 'LUNA', 'MAVİ DÜŞ', 'ATLAS', 'POSEIDON', 'NOVA', 'SERENITY', 'ARGO', 'KALAMAR', 'BELLA VITA', 'LODOS', 'YILDIZ', 'OCEAN SPIRIT', 'İMBAT', 'MERIDIAN', 'AQUILA', 'DELFİN', 'SAFİR', 'ALTAIR', 'MARINA DEL SOL', 'KORSAN'];
const FLAGS = ['Türkiye', 'Malta', 'Cayman Adaları', 'Marshall Adaları', 'İngiltere'];
const CUSTOMER_NAMES = ['Ahmet Yılmaz', 'Elif Kaya', 'Mehmet Demir', 'Ayşe Şahin', 'Can Öztürk', 'Zeynep Arslan', 'Murat Koç', 'Selin Aydın', 'Kerem Çelik', 'Deniz Yıldız', 'Hakan Erdoğan', 'Burak Aksoy', 'Ece Polat', 'Okan Kurt', 'Derya Özdemir', 'Serkan Güneş', 'Leyla Tekin', 'Emre Bulut'];

async function main() {
  console.log('Veritabanı temizleniyor...');
  const tables = ['Notification', 'PushToken', 'AuditLog', 'Attachment', 'Document', 'Payment', 'PaymentInstallment', 'QuoteItem', 'Quote', 'MaterialUsage', 'Material', 'ChangeRequest', 'ProjectTask', 'ProjectPhase', 'ReportVersion', 'Report', 'Fault', 'InspectionItem', 'Inspection', 'WorkOrderComment', 'WorkOrderHistory', 'MaintenancePlan', 'WorkOrder', 'Project', 'Engine', 'VesselMember', 'Vessel', 'CustomerNote', 'User', 'Customer', 'Setting', 'Counter'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = (email: string, name: string, roles: Role[], extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { email, name, roles, passwordHash: hash, ...extra } });

  // Personel
  const admin = await mkUser('admin@nexusmarine.com', 'Kaan Nexus', ['SUPER_ADMIN'], { title: 'Genel Müdür', phone: '+90 532 000 00 01' });
  const ops = await mkUser('operasyon@nexusmarine.com', 'Selin Deniz', ['OPERATIONS_MANAGER'], { title: 'Operasyon Müdürü', phone: '+90 532 000 00 02' });
  const ops2 = await mkUser('teknik.mudur@nexusmarine.com', 'Barış Kaptanoğlu', ['OPERATIONS_MANAGER', 'TECHNICIAN'], { title: 'Teknik Müdür', phone: '+90 532 000 00 03' });
  const techNames: Array<[string, string, string]> = [
    ['teknisyen@nexusmarine.com', 'Emre Usta', 'Makine Teknisyeni'],
    ['ali.vural@nexusmarine.com', 'Ali Vural', 'Elektrik Teknisyeni'],
    ['onur.kara@nexusmarine.com', 'Onur Kara', 'Kompozit / Gövde Uzmanı'],
    ['yusuf.tas@nexusmarine.com', 'Yusuf Taş', 'Marangoz – Teak Uzmanı'],
    ['cem.aktas@nexusmarine.com', 'Cem Aktaş', 'Boya ve Polish Uzmanı'],
    ['mert.sari@nexusmarine.com', 'Mert Sarı', 'Makine Teknisyeni'],
    ['tolga.ince@nexusmarine.com', 'Tolga İnce', 'Elektronik Teknisyeni'],
  ];
  const techs: User[] = [];
  for (const [email, name, title] of techNames) techs.push(await mkUser(email, name, ['TECHNICIAN'], { title, phone: `+90 533 ${Math.floor(100 + rnd() * 899)} ${Math.floor(10 + rnd() * 89)} ${Math.floor(10 + rnd() * 89)}` }));
  const allTechs = [...techs, ops2];

  // Müşteriler
  const customers: Customer[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    customers.push(
      await prisma.customer.create({
        data: {
          name,
          company: i % 3 === 0 ? `${name.split(' ')[1]} Holding A.Ş.` : null,
          email: `${name.toLowerCase().replace(/ /g, '.').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')}@example.com`,
          phone: `+90 5${30 + (i % 9)} ${100 + i * 7} ${10 + i} ${20 + i}`,
          status: i % 7 === 6 ? 'PENDING' : 'ACTIVE',
          address: pick(['Bodrum, Muğla', 'Göcek, Fethiye', 'Beşiktaş, İstanbul', 'Marmaris, Muğla', 'Kaş, Antalya']),
        },
      }),
    );
  }

  // Tekneler
  const vessels: Array<Vessel & { engines: Engine[] }> = [];
  for (const [i, nm] of VESSEL_NAMES.entries()) {
    const [make, model, type, len] = i === 0 ? (['Cranchi', '66 Flybridge', 'Motoryat', 20.5] as [string, string, string, number]) : i === 1 ? MAKES[3] : pick(MAKES);
    const owner = customers[i % customers.length];
    const hasTwin = type !== 'Yelkenli';
    const v = await prisma.vessel.create({
      data: {
        name: `M/Y ${nm}`,
        type,
        make,
        model,
        year: 2008 + Math.floor(rnd() * 16),
        lengthM: len + Math.round(rnd() * 20) / 10,
        flag: pick(FLAGS),
        marina: i < 2 ? 'D-Marin Göcek' : pick(MARINAS),
        berth: `${pick(['A', 'B', 'C', 'D', 'E'])}-${Math.floor(1 + rnd() * 60)}`,
        ownerId: owner.id,
        contactPhone: owner.phone,
        contactEmail: owner.email,
        isActive: i !== VESSEL_NAMES.length - 1,
        generatorInfo: { make: pick(['Kohler', 'Onan', 'Northern Lights', 'Fischer Panda']), model: pick(['20EFOZD', '17.5 MDKBM', 'M944']), powerKw: pick([17.5, 20, 25, 32]), hours: Math.floor(1500 + rnd() * 4000) },
        batteryInfo: { service: { type: 'AGM', count: 8, capacityAh: 200, voltage: 24 }, start: { type: 'AGM', count: 2, capacityAh: 120, voltage: 24 }, installedAt: '2023-04-15' },
        equipment: [
          { name: 'Su yapıcı', make: 'Idromar', model: 'MC50', serial: `IDR-${1000 + i}` },
          { name: 'Klima', make: 'Dometic', model: 'CW 16', serial: `DMT-${2000 + i}` },
          { name: 'Plotter', make: 'Raymarine', model: 'Axiom Pro 16' },
          { name: 'Servis botu', make: 'Williams', model: 'Turbojet 385' },
        ],
        engines: {
          create: hasTwin
            ? [
                { position: 'İskele Ana Makine', make: i === 0 ? 'Volvo Penta' : pick(['MAN', 'MTU', 'Caterpillar', 'Volvo Penta']), model: i === 0 ? 'IPS 1200 (D13)' : pick(['V12-1400', '12V 2000 M96', 'C32', 'D13-900']), serialNumber: `ENG-${i}-P`, hours: Math.floor(800 + rnd() * 3000) },
                { position: 'Sancak Ana Makine', make: i === 0 ? 'Volvo Penta' : pick(['MAN', 'MTU', 'Caterpillar', 'Volvo Penta']), model: i === 0 ? 'IPS 1200 (D13)' : pick(['V12-1400', '12V 2000 M96', 'C32', 'D13-900']), serialNumber: `ENG-${i}-S`, hours: Math.floor(800 + rnd() * 3000) },
                { position: 'Jeneratör', make: 'Kohler', model: '20EFOZD', serialNumber: `GEN-${i}`, hours: Math.floor(1500 + rnd() * 4000) },
              ]
            : [{ position: 'Ana Makine', make: 'Volvo Penta', model: 'D3-150', serialNumber: `ENG-${i}`, hours: Math.floor(500 + rnd() * 2000) }],
        },
      },
      include: { engines: true },
    });
    vessels.push(v);
  }

  // Kaptanlar ve müşteri hesapları
  const captainNames = ['Kpt. Hasan Reis', 'Kpt. Levent Dalgıç', 'Kpt. Orhan Poyraz', 'Kpt. Sinan Akdeniz', 'Kpt. Volkan Rüzgar', 'Kpt. Taner Mavi'];
  const captains: User[] = [];
  for (const [i, name] of captainNames.entries()) {
    const email = i === 0 ? 'kaptan@nexusmarine.com' : `kaptan${i + 1}@example.com`;
    const c = await mkUser(email, name, ['CAPTAIN'], { phone: `+90 542 ${300 + i} 10 ${20 + i}` });
    captains.push(c);
    const assigned = vessels.filter((_, vi) => vi % captainNames.length === i);
    for (const v of assigned) await prisma.vesselMember.create({ data: { userId: c.id, vesselId: v.id, relation: 'CAPTAIN' } });
  }
  const ownerUser = await mkUser('musteri@nexusmarine.com', customers[0].name, ['OWNER'], { customerId: customers[0].id, phone: customers[0].phone });
  const ownerUser2 = await mkUser('sahip2@example.com', customers[1].name, ['OWNER'], { customerId: customers[1].id, phone: customers[1].phone });
  for (const c of customers.slice(2, 12)) {
    await mkUser(c.email!, c.name, ['OWNER'], { customerId: c.id, phone: c.phone });
  }
  // Çoklu rol örneği: hem kaptan hem tekne sahibi
  await mkUser('kaptan.sahip@example.com', customers[12].name, ['OWNER', 'CAPTAIN'], { customerId: customers[12].id, vesselLinks: { create: [{ vesselId: vessels[5].id, relation: 'CAPTAIN' }] } });

  // Malzemeler
  const materialDefs: Array<[string, string, string, number, number, number]> = [
    ['Motor yağı 15W-40', 'Yağlar', 'L', 420, 100, 6.5],
    ['Yağ filtresi (MAN)', 'Filtreler', 'adet', 36, 10, 38],
    ['Yakıt filtresi Racor 2040', 'Filtreler', 'adet', 48, 12, 24],
    ['Deniz suyu pompası çarkı', 'Yedek Parça', 'adet', 22, 6, 65],
    ['Antifriz (soğutma sıvısı)', 'Yağlar', 'L', 160, 40, 5.2],
    ['Zehirli boya (antifouling) International Micron 350', 'Boya', 'L', 75, 20, 58],
    ['Epoksi astar Interprotect', 'Boya', 'L', 40, 10, 44],
    ['Epoksi reçine West System 105', 'Kompozit', 'kg', 60, 15, 32],
    ['Cam elyaf mat 450gr', 'Kompozit', 'm²', 180, 50, 4.8],
    ['Polyester macun', 'Kompozit', 'kg', 35, 10, 12],
    ['Pasta 3M Perfect-It', 'Polish', 'L', 18, 6, 42],
    ['Cila (wax) Meguiars', 'Polish', 'L', 22, 6, 36],
    ['Teak lata 8mm Burma', 'Teak', 'm²', 45, 15, 210],
    ['Teak derz macunu Sikaflex 290i', 'Teak', 'adet', 60, 20, 19],
    ['Teak yağı', 'Teak', 'L', 30, 8, 28],
    ['Jelkot beyaz', 'Kompozit', 'kg', 25, 8, 22],
    ['AGM akü 12V 200Ah', 'Elektrik', 'adet', 6, 4, 420],
    ['Sigorta seti (ANL)', 'Elektrik', 'set', 3, 5, 55],
    ['Anot (çinko) şaft', 'Yedek Parça', 'adet', 40, 12, 18],
    ['Zımpara P120', 'Sarf', 'adet', 600, 200, 0.6],
  ];
  const materials: Material[] = [];
  for (const [name, category, unit, stock, minStock, unitCost] of materialDefs) {
    materials.push(await prisma.material.create({ data: { name, category, unit, stock, minStock, unitCost, sku: `NM-${String(materials.length + 1).padStart(4, '0')}` } }));
  }

  // İş emirleri
  let woCounter = 0;
  const year = new Date().getFullYear();
  const wos: WorkOrder[] = [];
  const catKeys = Object.keys(MAINTENANCE_CATEGORIES) as MaintenanceCategory[];
  const statuses: WorkOrderStatus[] = ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'PUBLISHED', 'CLOSED', 'CLOSED', 'CLOSED', 'ON_HOLD', 'REVISION_REQUIRED'];
  const chain: WorkOrderStatus[] = ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'CLOSED'];
  for (let i = 0; i < 70; i++) {
    const vessel = i < 6 || [9, 10, 12, 13].includes(i) ? vessels[i % 2] : pick(vessels.slice(0, -1));
    const cat = pick(catKeys);
    const title = pick(MAINTENANCE_CATEGORIES[cat].items);
    const status = i < statuses.length ? statuses[i] : pick(statuses);
    const done = ['COMPLETED', 'PUBLISHED', 'CLOSED'].includes(status);
    const offset = done ? -Math.floor(5 + rnd() * 170) : status === 'REQUESTED' || status === 'EVALUATION' ? Math.floor(rnd() * 14) : Math.floor(-3 + rnd() * 12);
    const tech = ['REQUESTED', 'EVALUATION', 'PLANNED'].includes(status) ? null : i < 4 ? techs[0] : pick(allTechs);
    const plannedStart = day(offset, 8 + Math.floor(rnd() * 6));
    const plannedHours = Math.round((2 + rnd() * 14) * 2) / 2;
    const started = ['IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'CLOSED', 'REVISION_REQUIRED'].includes(status) ? plannedStart : null;
    const finished = done || status === 'TECHNICAL_REVIEW' ? new Date(plannedStart.getTime() + plannedHours * 36e5 * (0.8 + rnd() * 0.6)) : null;
    const wo = await prisma.workOrder.create({
      data: {
        number: `WO-${year}-${String(++woCounter).padStart(4, '0')}`,
        vesselId: vessel.id,
        title: `${title} — ${vessel.name.replace('M/Y ', '')}`,
        description: `${MAINTENANCE_CATEGORIES[cat].label} kapsamında ${title.toLowerCase()} işlemi.`,
        category: cat,
        priority: pick<Priority>(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL']),
        status,
        technicianId: tech?.id,
        requestedById: i % 5 === 0 ? captains[0].id : ops.id,
        plannedStart,
        plannedEnd: new Date(plannedStart.getTime() + plannedHours * 36e5),
        plannedHours,
        actualHours: finished ? Math.round(((+finished - +plannedStart) / 36e5) * 10) / 10 : null,
        startedAt: started,
        finishedAt: finished,
        createdAt: day(offset - 3),
        publishedAt: ['PUBLISHED', 'CLOSED'].includes(status) ? finished : null,
        customerSummary: ['PUBLISHED', 'CLOSED'].includes(status) ? `${title} işlemi tamamlanmış ve test edilmiştir. Herhangi bir olumsuzluk tespit edilmemiştir.` : null,
        checklist: [
          { label: 'Ön kontrol ve tespit', done: !!started },
          { label: title, done: done || status === 'TECHNICAL_REVIEW' },
          { label: 'Test ve son kontrol', done: done || status === 'TECHNICAL_REVIEW' },
          { label: 'Alan temizliği', done },
        ],
      },
    });
    // Geçmiş
    const idx = chain.indexOf(status);
    const path = idx >= 0 ? chain.slice(0, idx + 1) : ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', status];
    let prev: WorkOrderStatus | null = null;
    for (const [k, s] of (path as WorkOrderStatus[]).entries()) {
      await prisma.workOrderHistory.create({ data: { workOrderId: wo.id, userId: k >= 4 && k <= 5 ? tech?.id : ops.id, fromStatus: prev, toStatus: s, createdAt: new Date(+wo.createdAt + k * 6 * 36e5) } });
      prev = s;
    }
    if (started) {
      const m = cat === 'MECHANICAL' ? materials[pick([0, 1, 2, 4])] : cat === 'HAUL_OUT' ? materials[pick([5, 6, 18, 19])] : cat === 'COSMETIC' ? materials[pick([10, 11, 13, 14])] : materials[pick([16, 17])];
      const qty = m.unit === 'L' ? Math.ceil(rnd() * 20) : Math.ceil(rnd() * 3);
      await prisma.materialUsage.create({ data: { materialId: m.id, workOrderId: wo.id, quantity: qty, unitCost: m.unitCost, userId: tech?.id, usedAt: started } });
    }
    if (i % 4 === 0) {
      await prisma.workOrderComment.create({ data: { workOrderId: wo.id, userId: tech?.id ?? ops.id, body: 'Parça tedarikçiden teyit edildi, işleme başlanabilir.', internal: true } });
    }
    wos.push(wo);
  }

  // Bakım planları (tarih ve motor saati bazlı)
  for (let i = 0; i < 40; i++) {
    const vessel = i < 4 ? vessels[i % 2] : pick(vessels.slice(0, -1));
    const cat = pick(catKeys);
    const title = pick(MAINTENANCE_CATEGORIES[cat].items);
    const offset = Math.floor(-12 + rnd() * 50);
    const engine = cat === 'MECHANICAL' ? vessel.engines[0] : undefined;
    const byHours = engine && i % 3 === 0;
    await prisma.maintenancePlan.create({
      data: {
        title,
        category: cat,
        subType: title,
        vesselId: vessel.id,
        description: `${MAINTENANCE_CATEGORIES[cat].label} — periyodik ${title.toLowerCase()}.`,
        plannedDate: day(offset),
        technicianId: rnd() > 0.3 ? pick(allTechs).id : null,
        priority: pick<Priority>(['LOW', 'MEDIUM', 'HIGH']),
        estimatedHours: Math.round(2 + rnd() * 10),
        status: offset < 0 ? 'OVERDUE' : 'PLANNED',
        intervalDays: pick([90, 180, 365]),
        engineId: byHours ? engine!.id : null,
        intervalEngineHours: byHours ? 250 : null,
        dueEngineHours: byHours ? engine!.hours + Math.floor(-10 + rnd() * 60) : null,
        plannedMaterials: cat === 'MECHANICAL' ? [{ name: 'Motor yağı 15W-40', quantity: 40, unit: 'L' }, { name: 'Yağ filtresi (MAN)', quantity: 2, unit: 'adet' }] : undefined,
        haulOutDate: cat === 'HAUL_OUT' ? day(offset) : null,
        launchDate: cat === 'HAUL_OUT' ? day(offset + 10) : null,
      },
    });
  }
  // Tamamlanmış bakımlar (servis geçmişi)
  for (const wo of wos.filter((w) => ['CLOSED', 'PUBLISHED'].includes(w.status)).slice(0, 15)) {
    await prisma.maintenancePlan.create({ data: { title: wo.title.split(' — ')[0], category: wo.category!, vesselId: wo.vesselId, plannedDate: wo.plannedStart!, endDate: wo.finishedAt, status: 'COMPLETED', technicianId: wo.technicianId, workOrderId: wo.id, actualHours: wo.actualHours } });
  }

  // M/Y ANY — Haftalık denetimler (önceki onaylı + mevcut taslak)
  const any = vessels[0];
  const mkInspection = async (offset: number, status: 'APPROVED' | 'SUBMITTED' | 'DRAFT', number: string, faultCodes: string[], attentionCodes: string[]) => {
    const insp = await prisma.inspection.create({
      data: {
        number,
        vesselId: any.id,
        inspectorId: techs[0].id,
        captainName: captains[0].name,
        date: day(offset),
        status,
        templateVersion: INSPECTION_TEMPLATE_VERSION,
        submittedAt: status !== 'DRAFT' ? day(offset, 17) : null,
        approvedAt: status === 'APPROVED' ? day(offset + 1) : null,
        approvedById: status === 'APPROVED' ? ops.id : null,
        generalNotes: status !== 'DRAFT' ? 'Tekne genel olarak operasyonel durumdadır. Belirtilen arızalar için iş emri açılmıştır.' : null,
        location: any.marina,
        pier: any.berth,
        inspectorTitle: 'Teknik Enspektör',
        operationalStatus: status === 'DRAFT' ? null : faultCodes.length ? 'FOLLOW_UP' : 'READY',
        pumpOutDone: status !== 'DRAFT',
        findings: [
          ...faultCodes.map((c) => ({ description: `${INSPECTION_TEMPLATE.flatMap((s) => s.items).find((x) => x.code === c)?.label ?? c} — onarım gerekiyor`, priority: c === 'S07.1' ? 'URGENT' : 'MEDIUM', responsible: techs[0].name, serviceStatus: status === 'APPROVED' ? 'İş emri açıldı' : 'Bekliyor' })),
          ...Array.from({ length: Math.max(0, 6 - faultCodes.length) }, () => ({ description: '', priority: null, responsible: '', serviceStatus: '' })),
        ],
      },
    });
    // Bölüm 17 — haftalık saatler ve tank değerleri (önceki hafta ile)
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
    for (const sec of INSPECTION_TEMPLATE) {
      for (const it of sec.items) {
        const check = sec.kind === 'CHECK';
        const result = !check || (status === 'DRAFT' && sec.code > 'S06') ? null : faultCodes.includes(it.code) ? 'FAULT' : attentionCodes.includes(it.code) ? 'ATTENTION' : it.code === 'S15.3' ? 'NA' : 'OK';
        const [measurement, previousMeasurement] = readings[it.code] ?? [null, null];
        const item = await prisma.inspectionItem.create({
          data: {
            inspectionId: insp.id,
            sectionCode: sec.code,
            itemCode: it.code,
            label: it.label,
            description: it.description,
            unit: it.unit,
            result: result as any,
            measurement: status === 'DRAFT' ? null : measurement,
            previousMeasurement,
            note: result === 'FAULT' ? 'Onarım gerekiyor, iş emri açılmalı.' : result === 'ATTENTION' ? 'Bir sonraki bakımda takip edilecek.' : null,
          },
        });
        if (result === 'FAULT' && status !== 'DRAFT') {
          await prisma.fault.create({ data: { vesselId: any.id, title: it.label, description: `Denetim ${number} · ${sec.title} · ${it.code}`, severity: it.code === 'S07.1' ? 'CRITICAL' : 'HIGH', source: 'INSPECTION', inspectionItemId: item.id, reportedById: techs[0].id, status: status === 'APPROVED' ? 'IN_PROGRESS' : 'OPEN', createdAt: day(offset) } });
        }
      }
    }
    return insp;
  };
  const prevInsp = await mkInspection(-8, 'APPROVED', `INS-${year}-0001`, ['S06.4'], ['S04.5', 'S08.5', 'S13.5']);
  await mkInspection(-1, 'SUBMITTED', `INS-${year}-0002`, ['S07.1', 'S12.4'], ['S04.5', 'S01.3']);
  await mkInspection(0, 'DRAFT', `INS-${year}-0003`, [], ['S04.5']);
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0001`,
      type: 'INSPECTION',
      title: `Haftalık Periyodik Teknik Denetim — ${any.name}`,
      vesselId: any.id,
      inspectionId: prevInsp.id,
      status: 'PUBLISHED',
      customerVisible: true,
      createdById: ops.id,
      versions: { create: { version: 1, status: 'PUBLISHED', data: { inspectionId: prevInsp.id }, createdById: ops.id, approvedById: ops.id, approvedAt: day(-7) } },
    },
  });
  // Arıza → iş emri bağlantısı
  const openFault = await prisma.fault.findFirst({ where: { vesselId: any.id, status: 'IN_PROGRESS' } });
  if (openFault) await prisma.fault.update({ where: { id: openFault.id }, data: { workOrderId: wos[4].id } });
  // Müşteri kaynaklı arıza bildirimi
  await prisma.fault.create({ data: { vesselId: vessels[2].id, title: 'Baş pervane (thruster) çalışmıyor', description: 'Kaptan bildirimi: manevra sırasında baş pervane tepki vermedi.', severity: 'CRITICAL', source: 'CUSTOMER', reportedById: captains[2].id } });

  // M/Y SEA RODS — Gövde restorasyonu projesi
  const seaRods = vessels[1];
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
  const phaseStatus = ['DONE', 'DONE', 'DONE', 'DONE', 'IN_PROGRESS', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'] as const;
  const phaseResp = [techs[2], techs[2], techs[2], techs[2], techs[2], techs[4], techs[4], techs[4], techs[0], ops2];
  for (const [i, name] of HULL_RESTORATION_PHASES.entries()) {
    const ph = await prisma.projectPhase.create({
      data: {
        projectId: project.id,
        name,
        order: i + 1,
        responsibleId: phaseResp[i].id,
        startDate: day(-35 + i * 6),
        endDate: day(-35 + i * 6 + 5),
        status: phaseStatus[i],
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
      { projectId: project.id, requestedBy: captains[1].name, title: 'Şaft ve pervane polisajı + dinamik balans', description: 'Kaptan talebi — karada iken yapılması istendi.', extraDays: 2, extraCost: 2400, status: 'APPROVED', decidedAt: day(-10) },
      { projectId: project.id, requestedBy: captains[1].name, title: 'Kıç platform jelkot tamiri', extraDays: 1, extraCost: 950, status: 'PENDING' },
      { projectId: project.id, requestedBy: customers[1].name, title: 'Su hattı şeridinin lacivert yenilenmesi', extraDays: 1, extraCost: 1800, status: 'PENDING' },
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
  for (const [mi, q] of [[7, 22], [8, 64], [9, 8]] as const) {
    await prisma.materialUsage.create({ data: { materialId: materials[mi].id, projectId: project.id, quantity: q, unitCost: materials[mi].unitCost, userId: techs[2].id, usedAt: day(-8) } });
  }
  for (const w of wos.slice(20, 23)) await prisma.workOrder.update({ where: { id: w.id }, data: { projectId: project.id, vesselId: seaRods.id } });

  // M/Y SEA RODS — Kazıma sonrası teknik inceleme raporu (yayınlanmış)
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0002`,
      type: 'POST_SCRAPING',
      title: 'Kazıma Sonrası Teknik İnceleme Raporu — M/Y SEA RODS',
      vesselId: seaRods.id,
      projectId: project.id,
      status: 'PUBLISHED',
      customerVisible: true,
      createdById: ops2.id,
      currentVersion: 2,
      versions: {
        create: [
          {
            version: 1,
            status: 'SUPERSEDED',
            createdById: ops2.id,
            approvedById: ops.id,
            approvedAt: day(-38),
            createdAt: day(-39),
            data: { inspectionDate: day(-40).toISOString(), location: 'D-Marin Göcek – Karada', inspector: 'Onur Kara', portFindings: 'İlk inceleme.', starboardFindings: 'İlk inceleme.', damages: [], moistureReadings: [], assessment: 'Ön değerlendirme', recommendation: '' },
          },
          {
            version: 2,
            status: 'PUBLISHED',
            createdById: ops2.id,
            approvedById: ops.id,
            approvedAt: day(-37),
            createdAt: day(-38),
            changeNote: 'Kazıma bulguları (iskele / sancak) işlendi',
            clauses: [{ key: 'TECHNICAL_COMPLIANCE', text: 'Bu raporda belirtilen tespitler Nexus Marine teknik ekibi tarafından yerinde yapılan inceleme ve ölçümlere dayanmaktadır.', approvedById: ops.id, approvedByName: ops.name, approvedAt: day(-37) }],
            // Admin'in ilettiği "kazıma sonrası teknik inceleme raporu" birebir
            data: { reportDate: day(-38).toISOString(), inspectionDate: day(-40).toISOString(), location: 'D-Marin Göcek – Karada', inspector: 'Onur Kara', preparedBy: 'Onur Kara', ...scrapingTemplate(seaRods.name) },
          },
        ],
      },
    },
  });
  // M/Y SEA RODS — Proje Teklif Dosyası: Gövde Onarım ve İyileştirme (müşteri onayı alındı)
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0003`,
      type: 'PROJECT_PROPOSAL',
      title: 'Proje Teklif Dosyası: Gövde Onarım ve İyileştirme — M/Y SEA RODS',
      vesselId: seaRods.id,
      projectId: project.id,
      status: 'PUBLISHED',
      customerVisible: true,
      createdById: ops2.id,
      approvalStatus: 'APPROVED',
      approvalRequestedAt: day(-37),
      approvalDecidedAt: day(-36),
      approvalDecidedById: ownerUser2.id,
      approvalDecidedBy: ownerUser2.name,
      versions: {
        create: { version: 1, status: 'PUBLISHED', createdById: ops2.id, approvedById: ops.id, approvedAt: day(-37), createdAt: day(-37), data: { reportDate: day(-37).toISOString(), ...proposalTemplate(seaRods.name), preparedBy1: 'Onur Kara', preparedBy2: ops2.name, approvedBy: ops.name } as any },
      },
    },
  });
  // M/Y SEA RODS — Nihai Birleşik Teslim Protokolü (müşteri onayı bekleniyor)
  await prisma.report.create({
    data: {
      number: `RPT-${year}-0004`,
      type: 'DELIVERY_PROTOCOL',
      title: "Nihai Birleşik Restorasyon, Teak Güverte, Bakım ve Teslim Protokolü — M/Y SEA ROD'S",
      vesselId: seaRods.id,
      projectId: project.id,
      status: 'PUBLISHED',
      customerVisible: true,
      createdById: ops.id,
      approvalStatus: 'PENDING',
      approvalRequestedAt: day(-1),
      versions: {
        create: { version: 1, status: 'PUBLISHED', createdById: ops.id, approvedById: ops.id, approvedAt: day(-1), createdAt: day(-2), data: { reportDate: day(-2).toISOString(), ...protocolTemplate("M/Y SEA ROD'S") } as any },
      },
    },
  });
  await prisma.counter.createMany({ data: [{ key: `WO-${year}`, value: woCounter }, { key: `INS-${year}`, value: 3 }, { key: `RPT-${year}`, value: 4 }, { key: `TKF-${year}`, value: 4 }] });

  // Teklifler
  const mkQuote = async (n: number, customerIdx: number, vesselIdx: number, title: string, status: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED', items: Array<[string, number, string, number]>) =>
    prisma.quote.create({
      data: {
        number: `TKF-${year}-${String(n).padStart(4, '0')}`,
        customerId: customers[customerIdx].id,
        vesselId: vessels[vesselIdx].id,
        title,
        status,
        currency: 'EUR',
        vatRate: 20,
        validUntil: day(30),
        sentAt: status !== 'DRAFT' ? day(-5) : null,
        approvedAt: status === 'APPROVED' ? day(-2) : null,
        rejectedAt: status === 'REJECTED' ? day(-1) : null,
        items: { create: items.map(([description, quantity, unit, unitPrice], order) => ({ description, quantity, unit, unitPrice, order })) },
      },
    });
  await mkQuote(1, 0, 0, 'Kış bakımı paketi — M/Y ANY', 'SENT', [['Ana makine yağ ve filtre değişimi (2 motor)', 2, 'adet', 850], ['Jeneratör bakımı', 1, 'adet', 520], ['Deniz suyu pompası çark değişimi', 3, 'adet', 180], ['Antifouling + kara bakımı', 1, 'paket', 6400]]);
  await mkQuote(2, 1, 1, 'Gövde restorasyonu', 'APPROVED', [['Jelkot soyma ve kazıma', 62, 'm²', 85], ['Kurutma ve nem takibi', 1, 'paket', 4800], ['Laminasyon ve epoksi bariyer', 62, 'm²', 420], ['Zehirli boya', 62, 'm²', 75]]);
  await mkQuote(3, 0, 0, 'Kıç güverte teak yenileme', 'DRAFT', [['Teak söküm', 18, 'm²', 60], ['Yeni teak montajı (8mm Burma)', 18, 'm²', 690], ['Derz ve zımpara', 18, 'm²', 75]]);
  await mkQuote(4, 3, 3, 'Pasta-polish ve krom parlatma', 'REJECTED', [['Pasta ve polish', 1, 'paket', 3200], ['Krom parlatma', 1, 'paket', 900]]);

  // Belgeler
  await prisma.document.createMany({
    data: [
      { title: 'Yıllık Bakım Sözleşmesi 2026', category: 'CONTRACT', vesselId: any.id, customerId: customers[0].id, customerVisible: true, expiryDate: day(240) },
      { title: 'Can salı servis sertifikası', category: 'CERTIFICATE', vesselId: any.id, customerId: customers[0].id, customerVisible: true, expiryDate: day(45) },
      { title: 'Sigorta poliçesi', category: 'INSURANCE', vesselId: seaRods.id, customerId: customers[1].id, customerVisible: true, expiryDate: day(120) },
      { title: 'Dahili maliyet analizi', category: 'OTHER', vesselId: seaRods.id, customerId: customers[1].id, customerVisible: false },
    ],
  });

  await prisma.customerNote.createMany({
    data: [
      { customerId: customers[0].id, authorId: ops.id, body: 'Kış bakımını Kasım sonunda yapmak istiyor. Teklif gönderildi.' },
      { customerId: customers[1].id, authorId: ops2.id, body: 'Restorasyon sürecinde haftalık fotoğraflı bilgilendirme bekliyor.' },
    ],
  });

  // Bildirimler
  const n = (userId: string, type: string, title: string, body: string, link: string, read = false) => ({ userId, type, title, body, link, readAt: read ? new Date() : null, dedupeKey: `seed-${userId}-${title}` });
  await prisma.notification.createMany({
    data: [
      n(ops.id, 'CRITICAL_FAULT', 'KRİTİK Arıza: M/Y ANY', 'Sintine pompaları (otomatik/manuel)', '/faults'),
      n(ops.id, 'REVIEW_REQUIRED', 'Denetim onay bekliyor: M/Y ANY', `INS-${year}-0002 · 2 arıza`, '/inspections'),
      n(ops.id, 'CUSTOMER_REQUEST', 'Ek iş talebi: M/Y SEA RODS Gövde Restorasyonu', 'Kıç platform jelkot tamiri', `/projects/${project.id}`),
      n(ops.id, 'CRITICAL_FAULT', 'KRİTİK Arıza: M/Y BLUE HORIZON', 'Baş pervane (thruster) çalışmıyor', '/faults'),
      n(admin.id, 'QUOTE_RESPONSE', `Teklif onaylandı: TKF-${year}-0002`, 'Gövde restorasyonu', '/quotes'),
      n(techs[0].id, 'TASK_ASSIGNED', 'Size yeni görev atandı', 'Haftalık denetim — M/Y ANY', '/inspections'),
      n(ownerUser.id, 'QUOTE_SENT', 'Yeni teklifiniz var', 'Kış bakımı paketi — M/Y ANY', '/quotes'),
      n(ownerUser.id, 'NEW_REPORT', 'Yeni teknik rapor yayınlandı', 'Haftalık Periyodik Teknik Denetim — M/Y ANY', '/reports', true),
      n(ownerUser2.id, 'NEW_REPORT', 'Yeni teknik rapor yayınlandı', 'Kazıma Sonrası Teknik İnceleme Raporu — M/Y SEA RODS', '/reports'),
      n(ownerUser2.id, 'APPROVAL_REQUEST', 'Onayınız bekleniyor', "Nihai Birleşik Restorasyon, Teak Güverte, Bakım ve Teslim Protokolü — M/Y SEA ROD'S", '/reports'),
      n(captains[0].id, 'SERVICE_COMPLETED', 'Servis tamamlandı', 'Yağ ve filtre değişimi tamamlandı', '/work-orders'),
    ],
  });

  console.log(`✔ Seed tamamlandı: ${vessels.length} tekne, ${wos.length} iş emri, ${customers.length} müşteri.`);
  console.log(`  Demo şifre (tüm hesaplar): ${DEMO_PASSWORD}`);
  console.log('  admin@nexusmarine.com · operasyon@nexusmarine.com · teknisyen@nexusmarine.com · kaptan@nexusmarine.com · musteri@nexusmarine.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
