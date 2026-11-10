# Nexus Marine — Enterprise Yacht Operations Platform

Tekne bakım, teknik servis, restorasyon ve müşteri yönetimi için **tek kod tabanı + tek backend + tek veritabanı + rol bazlı ekranlar** mimarisiyle geliştirilmiş platform.

| Arayüz | Teknoloji | Kimler kullanır |
| --- | --- | --- |
| **Web Admin Dashboard** | React 18 + Vite + TypeScript (PWA) | Süper admin, operasyon yöneticisi, teknisyen |
| **Müşteri Web Portalı** | Aynı web uygulaması, rol bazlı portal düzeni | Tekne sahibi, kaptan |
| **iOS / Android uygulaması** | React Native + Expo (SDK 52) | Tüm roller, role göre farklı alt menü |
| **Backend API** | Node.js + Express + Prisma | Tüm istemciler |
| **Veritabanı** | PostgreSQL 16 | Merkezi ve tek |

Kullanıcı bilgisayardan Chrome ile, iPhone'dan Safari ile (ana ekrana eklenebilir PWA) veya telefonuna yüklediği uygulamadan giriş yapar. Hepsi aynı API'yi ve aynı veritabanını kullanır. Teknisyen mobil uygulamadan işi bitirdiğinde dashboard anında güncellenir, operasyon yöneticisine kontrol bildirimi gider; yönetici onaylayıp yayınladığında tekne sahibi işi portalda ve mobil uygulamada görür.

```
nexus-marine/
├── packages/shared   # Roller, yetkiler, iş emri durum makinesi, 19 bölümlük denetim şablonu (ortak)
├── apps/api          # Express + Prisma API, PDF üretimi, zamanlayıcı, entegrasyon testleri
├── apps/web          # Yönetim paneli + müşteri portalı (responsive, PWA)
└── apps/mobile       # Expo uygulaması (iOS / Android)
```

---

## Hızlı başlangıç (geliştirme)

Gereksinimler: Node.js 20+ ve PostgreSQL 14+.

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env   # DATABASE_URL ve JWT_SECRET değerlerini düzenleyin
```

```bash
npm run db:migrate && npm run db:seed
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

- Web: http://localhost:5173 (Vite, `/api` isteklerini 4000 portuna yönlendirir)
- API: http://localhost:4000/api/health

### Mobil uygulama

```bash
cd apps/mobile && npm install
```

```bash
EXPO_PUBLIC_API_URL=http://<bilgisayar-ip>:4000 npx expo start
```

Expo Go ile QR kodu okutun. Telefonun API'ye erişebilmesi için `CORS_ORIGINS` gerekmez (yerel uygulama), ancak API adresi telefonun ulaşabileceği bir IP/alan adı olmalıdır. Mağaza sürümleri için `eas build --platform ios|android --profile production` (`apps/mobile/eas.json`). Push bildirimleri için `app.json → extra.eas.projectId` alanını EAS proje kimliğiyle doldurun ve API'de `EXPO_PUSH_ENABLED=true` yapın.

### Demo hesaplar (seed)

Tüm demo hesapların şifresi: `Nexus2026!` (üretimde `SEED_PASSWORD` ile değiştirin veya seed çalıştırmayın).

| Rol | E-posta |
| --- | --- |
| Süper Admin / Yönetici | admin@nexusmarine.com |
| Operasyon Yöneticisi | operasyon@nexusmarine.com |
| Teknisyen | teknisyen@nexusmarine.com |
| Kaptan | kaptan@nexusmarine.com |
| Tekne Sahibi | musteri@nexusmarine.com |
| Çoklu rol (sahip + kaptan) | kaptan.sahip@example.com |

Seed; 24 tekne, 18 müşteri, 70 iş emri, 55 bakım planı, M/Y ANY için 3 haftalık denetim, M/Y SEA RODS gövde restorasyonu projesi (10 aşama, ek iş talepleri, ödeme planı), kazıma sonrası teknik inceleme raporu (2 sürüm), teklifler, stok ve bildirimler oluşturur.

---

## Üretim dağıtımı

Tek Docker imajı API'yi ve derlenmiş web uygulamasını aynı origin'den sunar; HTTPS için isteğe bağlı Caddy (`--profile https`) kullanılabilir. **Adım adım AWS kurulumu: [AWS-KURULUM.md](AWS-KURULUM.md)**

```bash
cp .env.production.example .env   # JWT_SECRET, POSTGRES_PASSWORD, CORS_ORIGINS doldurun
docker compose up -d --build
```

İlk kurulumda yönetici hesabı için seed (veya doğrudan veritabanına kullanıcı ekleme):

```bash
docker compose exec app npx tsx prisma/seed.ts
```

Dosyalar (fotoğraf/PDF) `/data/storage` hacminde tutulur. Ölçeklenme gerektiğinde `apps/api/src/routes/files.ts` içindeki disk depolaması S3 uyumlu bir depolamayla değiştirilebilir.

Önemli ortam değişkenleri (`apps/api/.env.example`): `DATABASE_URL`, `JWT_SECRET` (üretimde ≥32 karakter zorunlu), `CORS_ORIGINS`, `STORAGE_DIR`, `EXPO_PUSH_ENABLED`, `SCHEDULER_INTERVAL_MIN`, `WEB_DIST_DIR`.

---

## Modüller

**Web menüsü** (yetkiye göre gösterilir): Ana Sayfa · Tekneler · Bakım Yönetimi · İş Emirleri · Takvim · Teknisyenler · Dijital Denetimler · Teknik Raporlar · Restorasyon Projeleri · Stok ve Malzemeler · Müşteriler · Teklifler ve Finans · Belgeler ve Sözleşmeler · Bildirimler · Yönetim Raporları · Kullanıcı ve Rol Yönetimi · Sistem Ayarları.

- **Ana sayfa:** 4 KPI kartı (tıklanınca filtreli liste), haftalık bakım takvimi (iş emri detay modalı), yaklaşan işler, kritik arızalar, teknisyen durumları, aylık servis istatistikleri, durum dağılımı.
- **Tekne profili:** Genel bilgiler, motor/jeneratör/akü/ekipman, bakım takvimi, iş emirleri, denetimler, arızalar, birleşik servis geçmişi zaman çizelgesi, projeler, belgeler, fotoğraflar, maliyetler (yalnızca finans yetkisi).
- **Bakım yönetimi:** Makine, elektrik, kara ve kozmetik bakım türleri; tarih ve **motor çalışma saati** bazlı hatırlatmalar; tarihi geçen bakımlar otomatik "Gecikmiş"; takvimden bakım planlama; bakımdan iş emri oluşturma; tamamlanınca tekrarlı bakımın bir sonrakini otomatik planlama.
- **İş emirleri:** Talep Oluşturuldu → Değerlendirme → Planlandı → Teknisyen Atandı → İşlem Devam Ediyor → Teknik Kontrol → Tamamlandı → Müşteriye Yayınlandı → Kapatıldı (+ Beklemede, Revizyon Gerekli, İptal). Geçişler `packages/shared/src/workflow.ts` içinde tanımlıdır ve sunucuda zorunlu tutulur; her geçiş kullanıcı/zaman/eski/yeni durumla kaydedilir. Teknisyen yalnızca kendi işini başlatıp kontrole gönderebilir; onay ve yayın yönetici yetkisidir; yayın öncesi müşteri özeti zorunludur.
- **Dijital teknik denetim:** M/Y ANY haftalık denetim matrisinin 19 bölümü (`packages/shared/src/inspection.ts`). UYGUN / DİKKAT / ARIZA / N/A, ölçüm, açıklama ve fotoğraf. **ARIZA** işaretlenince arıza kaydı açılır, yöneticiye bildirim gider, kontrol maddesinden iş emri açılabilir, arıza servis geçmişine eklenir, sonraki denetimde önceki sonuç gösterilir. Gönderimde ölçülen motor saatleri tekne kaydına işlenir. Onayda rapor otomatik oluşur; PDF Nexus Marine şablonunda üretilir.
- **Teknik raporlar:** Kazıma sonrası inceleme, gövde restorasyonu, teak/marangozluk, birleşik bakım ve teslim protokolü. Veriler tekne, iş emri ve projeden otomatik çekilir; taslak → kontrol → onay → yayın. Onaylı rapor düzenlenirse **yeni sürüm** açılır. Teknik uygunluk, ayıpsız teslim, garanti ve ibra beyanları **otomatik eklenmez**; yalnızca yetkili kullanıcı onay sırasında açıkça seçerse adı ve tarihiyle eklenir. PDF: logo, tekne bilgileri, tarih, rapor no, tablolar, fotoğraflar, hazırlayan/onaylayan, sayfa numarası, onaysız sürümde "TASLAK" filigranı.
- **Restorasyon projeleri:** Aşamalar, görevler (ağırlıklı ilerleme hesabı), Gantt görünümü, ek iş talepleri ve süre/maliyet etkisi, malzemeler, bütçe, ödeme planı, tahsilatlar, belgeler ve galeri.
- **Müşteri/CRM, teklifler, stok, belgeler, bildirimler, yönetim raporları, kullanıcı/rol yönetimi, sistem ayarları.**

**Mobil alt menüler:**

| Rol | Sekmeler |
| --- | --- |
| Operasyon yöneticisi | Genel Bakış · Görevler · Randevular · Bildirimler · Menü (müşteriler, tekneler, teknisyen atama, denetimler, raporlar) |
| Teknisyen | Görevlerim · Takvim · Denetimler · Bildirimler · Profil |
| Kaptan | Teknelerim · Bakımlar · Talepler · Raporlar · Bildirimler |
| Tekne sahibi | Teknem · Bakımlar · Servis Talebi · Belgeler · Profil |

Teknisyen işin başlangıç ve bitişini kaydeder, kamerayla fotoğraf çekip iş emrine/denetim maddesine yükler, kontrol listesini işaretler, denetim formunu doldurur.

---

## Güvenlik ve veri izolasyonu

- Rol bazlı yetkilendirme hem arayüzde hem API'de uygulanır (`packages/shared/src/roles.ts`, `apps/api/src/lib/auth.ts`). Kullanıcıya birden fazla rol ve tekne ilişkisi atanabilir.
- Kaptan ve tekne sahibi yalnızca ilişkilendirildiği teknelerin verisine erişir; başka bir kayda URL veya API ile erişim denemesi 404 döner.
- Müşteri tarafına dahili yorumlar, malzeme maliyetleri, bütçe/tahsilat, onaylanmamış fotoğraflar ve yayınlanmamış raporlar gönderilmez. Fotoğraflar yalnızca yönetici "müşteriye görünür" işaretlediğinde paylaşılır.
- Dosyalar kimlik doğrulamalı uç nokta üzerinden sunulur; şifreler bcrypt ile saklanır; giriş uç noktası hız sınırlıdır; kritik işlemler denetim kaydına (audit log) yazılır.
- Bildirimler `dedupeKey` ile tekilleştirilir; aynı olay ikinci kez bildirim üretmez.

## Testler

```bash
npm test
```

`apps/api/test/api.test.ts` gerçek bir PostgreSQL test veritabanına (`TEST_DATABASE_URL`, varsayılan `nexus_marine_test`) karşı çalışır: rol izolasyonu, URL ile erişim engeli, iş emri akışı ve geçmişi, ARIZA otomasyonu, rapor sürümleme ve beyan onayı, teklif onayı, bildirim tekilleştirme, proje ilerleme hesabı.

## Kapsam notları (ilk sürüm)

- Finans takibi manueldir; banka, online ödeme ve ERP entegrasyonu kapsam dışıdır.
- Mobil uygulama çevrimdışı kuyruk içermez; bağlantı gerektirir.
- PDF şablonu Nexus Marine kurumsal kimliğiyle hazırlanmıştır; mevcut Word/PDF şablonlarınızdaki birebir yerleşim (logo dosyası, alt bilgi metni, imza blokları) `apps/api/src/services/pdf.ts` içinde uyarlanabilir.
