-- Bildirim kaynağı: müşteri (kaptan / tekne sahibi) mi, ekip içi mi
ALTER TABLE "Notification" ADD COLUMN "fromClient" BOOLEAN NOT NULL DEFAULT false;

-- Mevcut kayıtlar: müşteri talepleri ve teklif yanıtları müşteri kaynaklıdır
UPDATE "Notification" SET "fromClient" = true WHERE "type" IN ('CUSTOMER_REQUEST', 'QUOTE_RESPONSE');
