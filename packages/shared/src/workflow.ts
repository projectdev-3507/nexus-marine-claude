/**
 * İş emri yaşam döngüsü:
 * Talep Oluşturuldu → Değerlendirme → Planlandı → Teknisyen Atandı → İşlem Devam Ediyor
 * → Teknik Kontrol → Tamamlandı → Müşteriye Yayınlandı → Kapatıldı
 * Ek durumlar: Beklemede, Revizyon Gerekli, İptal Edildi
 */
export const WORK_ORDER_STATUSES = [
  'REQUESTED',
  'EVALUATION',
  'PLANNED',
  'ASSIGNED',
  'IN_PROGRESS',
  'TECHNICAL_REVIEW',
  'COMPLETED',
  'PUBLISHED',
  'CLOSED',
  'ON_HOLD',
  'REVISION_REQUIRED',
  'CANCELLED',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  REQUESTED: 'Talep Oluşturuldu',
  EVALUATION: 'Değerlendirme',
  PLANNED: 'Planlandı',
  ASSIGNED: 'Teknisyen Atandı',
  IN_PROGRESS: 'İşlem Devam Ediyor',
  TECHNICAL_REVIEW: 'Teknik Kontrol',
  COMPLETED: 'Tamamlandı',
  PUBLISHED: 'Müşteriye Yayınlandı',
  CLOSED: 'Kapatıldı',
  ON_HOLD: 'Beklemede',
  REVISION_REQUIRED: 'Revizyon Gerekli',
  CANCELLED: 'İptal Edildi',
};

/** Hangi durumdan hangi duruma geçilebilir. */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED: ['EVALUATION', 'PLANNED', 'ON_HOLD', 'CANCELLED'],
  EVALUATION: ['PLANNED', 'ON_HOLD', 'CANCELLED'],
  PLANNED: ['ASSIGNED', 'ON_HOLD', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'PLANNED', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['TECHNICAL_REVIEW', 'ON_HOLD'],
  TECHNICAL_REVIEW: ['COMPLETED', 'REVISION_REQUIRED'],
  REVISION_REQUIRED: ['IN_PROGRESS', 'ON_HOLD'],
  COMPLETED: ['PUBLISHED', 'CLOSED'],
  PUBLISHED: ['CLOSED'],
  CLOSED: [],
  ON_HOLD: ['EVALUATION', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  CANCELLED: [],
};

/** Teknisyenin kendi işinde yapabileceği geçişler. Diğer geçişler yönetici yetkisi ister. */
export const TECHNICIAN_TRANSITIONS: Array<[WorkOrderStatus, WorkOrderStatus]> = [
  ['ASSIGNED', 'IN_PROGRESS'],
  ['REVISION_REQUIRED', 'IN_PROGRESS'],
  ['IN_PROGRESS', 'TECHNICAL_REVIEW'],
  ['IN_PROGRESS', 'ON_HOLD'],
];

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Aktif (açık) iş emirleri. */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'REQUESTED',
  'EVALUATION',
  'PLANNED',
  'ASSIGNED',
  'IN_PROGRESS',
  'TECHNICAL_REVIEW',
  'ON_HOLD',
  'REVISION_REQUIRED',
];

/** Müşteri (sahip/kaptan) tarafında detayları görünür olan durumlar. */
export const CUSTOMER_VISIBLE_RESULT_STATUSES: WorkOrderStatus[] = ['PUBLISHED', 'CLOSED'];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

export const MAINTENANCE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  PLANNED: 'Planlandı',
  IN_PROGRESS: 'Devam Ediyor',
  COMPLETED: 'Tamamlandı',
  OVERDUE: 'Gecikmiş',
  CANCELLED: 'İptal',
};

export const MAINTENANCE_CATEGORIES = {
  MECHANICAL: {
    label: 'Makine Bakımları',
    items: [
      'Motor yağı kontrolü',
      'Yağ ve filtre değişimi',
      'Deniz suyu filtreleri',
      'Yakıt filtreleri',
      'Soğutma sistemi',
      'Motor çalışma saati',
      'Şaft ve pervane kontrolü',
      'Jeneratör bakım işlemleri',
    ],
  },
  ELECTRICAL: {
    label: 'Elektrik ve Akü Kontrolleri',
    items: [
      'Akü voltajı',
      'Şarj sistemi',
      'Alternatör',
      'Sahil beslemesi',
      'Elektrik panoları',
      'Sigorta ve bağlantılar',
      'İnverter ve redresör',
    ],
  },
  HAUL_OUT: {
    label: 'Kara Bakımları',
    items: [
      'Karaya alma',
      'Alt gövde temizliği',
      'Mekanik kazıma',
      'Nem kontrolü',
      'Gövde onarımı',
      'Epoksi uygulamaları',
      'Zehirli boya',
      'Suya indirme',
    ],
  },
  COSMETIC: {
    label: 'Kozmetik Bakımlar',
    items: [
      'Pasta ve polish',
      'Cila',
      'Jelkot tamiri',
      'Krom parlatma',
      'Teak güverte bakım ve değişimi',
      'Marangozluk işleri',
      'Yüzey restorasyonu',
    ],
  },
} as const;
export type MaintenanceCategory = keyof typeof MAINTENANCE_CATEGORIES;
export const MAINTENANCE_CATEGORY_KEYS = Object.keys(MAINTENANCE_CATEGORIES) as MaintenanceCategory[];

export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Taslak',
  SENT: 'Müşteriye Gönderildi',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  EXPIRED: 'Süresi Doldu',
};

export const REPORT_TYPES = {
  INSPECTION: 'Haftalık Periyodik Teknik Denetim',
  POST_SCRAPING: 'Kazıma Sonrası Teknik İnceleme Raporu',
  HULL_RESTORATION: 'Gövde Restorasyonu ve Bakım Raporu',
  TEAK_CARPENTRY: 'Teak Güverte ve Marangozluk Raporu',
  DELIVERY_PROTOCOL: 'Birleşik Bakım ve Teslim Protokolü',
  PROJECT_PROPOSAL: 'Proje Teklif Dosyası',
  WEEKLY_SERVICE: 'Haftalık Bakım ve Servis Raporu',
  CUSTOM: 'Özel Rapor',
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

export const REPORT_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: 'Taslak',
  IN_REVIEW: 'Kontrolde',
  APPROVED: 'Onaylandı',
  PUBLISHED: 'Yayınlandı',
  SUPERSEDED: 'Eski Sürüm',
};

/** Gövde restorasyonu standart aşamaları. */
export const HULL_RESTORATION_PHASES = [
  'Kazıma',
  'Kurutma',
  'Nem kontrolü',
  'Emprenye',
  'Laminasyon',
  'Macun ve tesviye',
  'Epoksi astar',
  'Boya',
  'Yeniden montaj',
  'Son kontrol',
];

export const NOTIFICATION_TYPES = {
  WORK_ORDER_CREATED: 'Yeni iş emri',
  TASK_ASSIGNED: 'Görev atama',
  MAINTENANCE_UPCOMING: 'Yaklaşan bakım',
  OVERDUE: 'Geciken iş',
  CRITICAL_FAULT: 'Kritik arıza',
  SERVICE_COMPLETED: 'Tamamlanan servis',
  REVIEW_REQUIRED: 'Kontrol bekleyen iş',
  NEW_REPORT: 'Yeni rapor',
  QUOTE_RESPONSE: 'Teklif onayı',
  QUOTE_SENT: 'Yeni teklif',
  CUSTOMER_REQUEST: 'Müşteri talebi',
  PROJECT_DELIVERY: 'Proje teslimi',
  NEW_COMMENT: 'Yeni yorum',
  APPROVAL_REQUEST: 'Onay talebi',
  APPROVAL_RESPONSE: 'Onay yanıtı',
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export const CURRENCIES = ['EUR', 'USD', 'TRY', 'GBP'] as const;
