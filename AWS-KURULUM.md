# AWS'de kurulum (EC2 + Docker)

Tek sunucu: **app** (API + web paneli + müşteri portalı) → **PostgreSQL**.
İki seçenek var:

- **A) Caddy'siz (en basit):** Uygulama `http://SUNUCU_IP:4000` adresinden açılır.
- **B) Caddy ile HTTPS:** Alan adı + otomatik Let's Encrypt sertifikası (`https://app.sirketiniz.com`).
  Telefona uygulama olarak kurma (PWA) ve en sorunsuz mobil deneyim için gerekir.

A ile başlayıp istediğiniz zaman B'ye geçebilirsiniz; veriler kaybolmaz.

## 1. AWS tarafı

1. **EC2 başlatın:** Ubuntu 24.04, `t3.medium`, disk 50 GB `gp3`.
2. **Elastic IP** ayırıp sunucuya bağlayın.
3. **Security Group** kuralları:
   | Port | Kaynak |
   |---|---|
   | 22 (SSH) | Yalnızca sizin IP'niz |
   | 4000 | 0.0.0.0/0 — **yalnızca A (Caddy'siz)** |
   | 80 (HTTP) | 0.0.0.0/0 — **yalnızca B (Caddy)** |
   | 443 (HTTPS) | 0.0.0.0/0 — **yalnızca B (Caddy)** |
4. **DNS (yalnızca B):** Alan adınız için bir **A kaydı** oluşturup Elastic IP'ye yönlendirin.
   Örnek: `app.sirketiniz.com → 3.120.x.x`

## 2. Sunucuyu hazırlayın

```bash
ssh -i anahtar.pem ubuntu@SUNUCU_IP

# Docker kurulumu
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit   # yeniden bağlanın
```

## 3. Uygulamayı kurun

```bash
git clone https://github.com/projectdev-3507/nexus-marine-claude.git
cd nexus-marine-claude
git checkout claude/eloquent-bell-p9b4rk

cp .env.production.example .env
nano .env
```

`.env` içinde doldurulacaklar:

| Değişken | A) Caddy'siz | B) Caddy ile |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` çıktısı | aynı |
| `POSTGRES_PASSWORD` | Güçlü bir şifre | aynı |
| `CORS_ORIGINS` | `http://SUNUCU_IP:4000` | `https://app.sirketiniz.com` |
| `DOMAIN` | — | `app.sirketiniz.com` |
| `APP_BIND` | — | `127.0.0.1` (4000 portu dışarıya kapanır) |

**A) Caddy'siz başlatma:**

```bash
docker compose up -d --build
```

Tarayıcıda `http://SUNUCU_IP:4000` adresini açın.

**B) Caddy ile (HTTPS) başlatma:**

```bash
docker compose --profile https up -d --build
docker compose logs -f caddy   # "certificate obtained successfully" görünmeli
```

Tarayıcıda `https://app.sirketiniz.com` adresini açın.

> A'dan B'ye geçerken: `.env`'e `DOMAIN`, `APP_BIND=127.0.0.1` ekleyin, `CORS_ORIGINS`'i
> https adresiyle değiştirin, Security Group'ta 80/443'ü açıp 4000'i kapatın ve
> B komutunu çalıştırın.

## 4. İlk kullanıcılar

Demo verisi ve demo hesaplarıyla (tümünün şifresi `SEED_PASSWORD`):

```bash
docker compose exec -e SEED_PASSWORD='GüçlüBirŞifre!' app npx tsx prisma/seed.ts
```

> Canlı kullanımda demo verisi istemiyorsanız seed çalıştırmayın; yöneticiyi oluşturup
> giriş yaptıktan sonra **Kullanıcı ve Rol Yönetimi** ekranından diğer hesapları açın.

## 5. Güncelleme

```bash
cd nexus-marine-claude
git pull
docker compose up -d --build                    # A) Caddy'siz
# docker compose --profile https up -d --build  # B) Caddy ile
```

Veritabanı şema değişiklikleri açılışta otomatik uygulanır (`prisma migrate deploy`).

## 6. Yedekleme

- **EBS snapshot:** EC2 → Lifecycle Manager → günlük snapshot politikası (7–14 gün saklama).
- **Veritabanı dökümü (isteğe bağlı):**
  ```bash
  docker compose exec -T db pg_dump -U nexus nexus_marine | gzip > yedek-$(date +%F).sql.gz
  ```
  Bu komutu cron ile her gece çalıştırıp `aws s3 cp` ile S3'e gönderebilirsiniz.

Yüklenen fotoğraf/video/belgeler `storage` Docker hacminde, veritabanı `pgdata` hacminde durur;
ikisi de EBS diskindedir, snapshot ikisini birlikte yedekler.

## Sorun giderme

| Belirti | Kontrol |
|---|---|
| Sayfa açılmıyor (A) | Security Group'ta 4000 açık mı? `.env`'de `APP_BIND=127.0.0.1` kalmış olmasın |
| Sertifika alınamıyor (B) | DNS A kaydı doğru IP'yi gösteriyor mu? 80 ve 443 portları açık mı? |
| Girişte CORS hatası | `CORS_ORIGINS` tam olarak `https://alan-adınız` mı? |
| Loglar | `docker compose logs -f app` |
