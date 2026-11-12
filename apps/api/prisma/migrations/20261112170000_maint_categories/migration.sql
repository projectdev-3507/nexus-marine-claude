-- Bakım başlıkları dinamik: enum yerine metin + başlık tablosu (mevcut kayıtlar korunur)
ALTER TABLE "MaintenancePlan" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "WorkOrder" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
DROP TYPE "MaintenanceCategory";

CREATE TABLE "MaintCategory" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "items" TEXT[],
    "color" TEXT NOT NULL DEFAULT '#1767AD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintCategory_pkey" PRIMARY KEY ("key")
);

INSERT INTO "MaintCategory" ("key", "label", "short", "items", "color", "sortOrder", "builtIn") VALUES
('MECHANICAL', 'Makine Bakımları', 'Makine', ARRAY['Motor yağı kontrolü', 'Yağ ve filtre değişimi', 'Deniz suyu filtreleri', 'Yakıt filtreleri', 'Soğutma sistemi', 'Motor çalışma saati', 'Şaft ve pervane kontrolü', 'Jeneratör bakım işlemleri']::TEXT[], '#0B2342', 1, true),
('ELECTRICAL', 'Elektrik ve Akü Kontrolleri', 'Elektrik', ARRAY['Akü voltajı', 'Şarj sistemi', 'Alternatör', 'Sahil beslemesi', 'Elektrik panoları', 'Sigorta ve bağlantılar', 'İnverter ve redresör']::TEXT[], '#1767AD', 2, true),
('HAUL_OUT', 'Kara Bakımları', 'Kara Bakımı', ARRAY['Karaya alma', 'Alt gövde temizliği', 'Mekanik kazıma', 'Nem kontrolü', 'Gövde onarımı', 'Epoksi uygulamaları', 'Zehirli boya', 'Suya indirme']::TEXT[], '#5B9BD8', 3, true),
('COSMETIC', 'Kozmetik Bakımlar', 'Kozmetik', ARRAY['Pasta ve polish', 'Cila', 'Jelkot tamiri', 'Krom parlatma', 'Teak güverte bakım ve değişimi', 'Marangozluk işleri', 'Yüzey restorasyonu']::TEXT[], '#A9CDF0', 4, true);
