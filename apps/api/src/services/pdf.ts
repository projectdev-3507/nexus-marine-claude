import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import {
  INSPECTION_RESULT_LABELS,
  INSPECTION_TEMPLATE,
  REPORT_TYPES,
  REPORT_STATUS_LABELS,
  type InspectionResult,
  type ReportType,
} from '@nexus/shared';
import { fileURLToPath } from 'url';
import { prisma } from '../db';
import { config } from '../config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONT_DIR = [path.resolve(__dirname, '../../assets/fonts'), path.resolve(__dirname, '../assets/fonts'), path.resolve(process.cwd(), 'assets/fonts')].find((d) =>
  fs.existsSync(path.join(d, 'Inter-Regular.otf')),
);

const C = {
  navy: '#0B2342',
  deep: '#07182E',
  marine: '#1767AD',
  light: '#EAF3FC',
  bg: '#F4F7FB',
  text: '#1C2B3A',
  muted: '#64748B',
  border: '#D6E0EB',
  ok: '#16A34A',
  warn: '#EA8A0C',
  fault: '#DC2626',
  na: '#94A3B8',
};
const RESULT_COLOR: Record<InspectionResult, string> = { OK: C.ok, ATTENTION: C.warn, FAULT: C.fault, NA: C.na };

const M = 42; // kenar boşluğu

type Doc = PDFKit.PDFDocument;

function createDoc(meta: { title: string; number: string; date: Date; draft: boolean; subtitle?: string }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 96, bottom: 60, left: M, right: M }, bufferPages: true, info: { Title: meta.title, Author: 'Nexus Marine' } });
  if (FONT_DIR) {
    doc.registerFont('R', path.join(FONT_DIR, 'Inter-Regular.otf'));
    doc.registerFont('S', path.join(FONT_DIR, 'Inter-SemiBold.otf'));
    doc.registerFont('B', path.join(FONT_DIR, 'Inter-Bold.otf'));
  } else {
    doc.registerFont('R', 'Helvetica');
    doc.registerFont('S', 'Helvetica-Bold');
    doc.registerFont('B', 'Helvetica-Bold');
  }
  doc.font('R').fontSize(9).fillColor(C.text);
  const decorate = () => header(doc, meta);
  decorate();
  doc.on('pageAdded', decorate);
  (doc as any).__finalize = () => footer(doc, meta);
  return doc;
}

function logo(doc: Doc, x: number, y: number) {
  doc.save();
  doc.roundedRect(x, y, 34, 34, 7).fill(C.marine);
  // dalga + pusula amblemi
  doc.lineWidth(2).strokeColor('#FFFFFF');
  doc.moveTo(x + 7, y + 21).bezierCurveTo(x + 11, y + 17, x + 15, y + 25, x + 19, y + 21).bezierCurveTo(x + 23, y + 17, x + 26, y + 24, x + 28, y + 21).stroke();
  doc.moveTo(x + 17, y + 6).lineTo(x + 22, y + 16).lineTo(x + 12, y + 16).closePath().fill('#FFFFFF');
  doc.restore();
  doc.font('B').fontSize(14).fillColor('#FFFFFF').text('NEXUS MARINE', x + 44, y + 4, { lineBreak: false });
  doc.font('R').fontSize(7.5).fillColor('#B8CDE3').text('YACHT SERVICES · TECHNICAL OPERATIONS', x + 44, y + 22, { lineBreak: false, characterSpacing: 0.6 });
}

function header(doc: Doc, meta: { title: string; number: string; date: Date; draft: boolean; subtitle?: string }) {
  const w = doc.page.width;
  const { x, y } = { x: doc.x, y: doc.y };
  doc.save();
  doc.rect(0, 0, w, 70).fill(C.navy);
  doc.rect(0, 70, w, 3).fill(C.marine);
  logo(doc, M, 18);
  doc.font('S').fontSize(9).fillColor('#FFFFFF').text(meta.number, w - M - 200, 22, { width: 200, align: 'right' });
  doc.font('R').fontSize(8).fillColor('#B8CDE3').text(fmtDate(meta.date), w - M - 200, 36, { width: 200, align: 'right' });
  if (meta.draft) {
    doc.font('B').fontSize(8).fillColor('#FFB547').text('TASLAK — ONAYLANMAMIŞTIR', w - M - 200, 50, { width: 200, align: 'right' });
    doc.save();
    doc.rotate(-35, { origin: [w / 2, doc.page.height / 2] });
    doc.font('B').fontSize(90).fillColor(C.fault).opacity(0.06).text('TASLAK', 0, doc.page.height / 2 - 50, { width: w, align: 'center', lineBreak: false });
    doc.restore();
  }
  doc.restore();
  doc.x = x;
  doc.y = Math.max(y, 96);
  doc.font('R').fontSize(9).fillColor(C.text);
}

function footer(doc: Doc, meta: { title: string; number: string }) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const h = doc.page.height;
    const w = doc.page.width;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(M, h - 40).lineTo(w - M, h - 40).lineWidth(0.5).strokeColor(C.border).stroke();
    doc.font('R').fontSize(7.5).fillColor(C.muted);
    doc.text(`Nexus Marine · ${meta.title} · ${meta.number}`, M, h - 32, { width: w - 2 * M - 80, lineBreak: false });
    doc.text(`Sayfa ${i + 1} / ${range.count}`, w - M - 80, h - 32, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

export function finalize(doc: Doc) {
  (doc as any).__finalize?.();
}

const fmtDate = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const contentWidth = (doc: Doc) => doc.page.width - 2 * M;

function ensureSpace(doc: Doc, h: number) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function title(doc: Doc, text: string, sub?: string) {
  doc.font('B').fontSize(16).fillColor(C.navy).text(text, M, doc.y);
  if (sub) doc.font('R').fontSize(9).fillColor(C.muted).text(sub);
  doc.moveDown(0.6);
}

function sectionHeading(doc: Doc, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  const y = doc.y;
  doc.rect(M, y, contentWidth(doc), 20).fill(C.light);
  doc.rect(M, y, 3, 20).fill(C.marine);
  doc.font('S').fontSize(10).fillColor(C.navy).text(text, M + 10, y + 5, { width: contentWidth(doc) - 20 });
  doc.y = y + 26;
  doc.x = M;
  doc.font('R').fontSize(9).fillColor(C.text);
}

function kvGrid(doc: Doc, pairs: Array<[string, string | number | null | undefined]>, cols = 2) {
  const w = contentWidth(doc) / cols;
  const rowH = 28;
  for (let i = 0; i < pairs.length; i += cols) {
    ensureSpace(doc, rowH);
    const y = doc.y;
    for (let c = 0; c < cols; c++) {
      const p = pairs[i + c];
      if (!p) continue;
      const x = M + c * w;
      doc.rect(x, y, w, rowH).lineWidth(0.5).strokeColor(C.border).stroke();
      doc.font('R').fontSize(7).fillColor(C.muted).text(p[0].toUpperCase(), x + 6, y + 4, { width: w - 12, characterSpacing: 0.3, lineBreak: false });
      doc.font('S').fontSize(9).fillColor(C.text).text(p[1] == null || p[1] === '' ? '—' : String(p[1]), x + 6, y + 14, { width: w - 12, lineBreak: false, ellipsis: true });
    }
    doc.y = y + rowH;
  }
  doc.x = M;
  doc.moveDown(0.5);
}

interface Col {
  label: string;
  width: number; // oran
  align?: 'left' | 'right' | 'center';
}

function table(doc: Doc, cols: Col[], rows: Array<Array<string | { text: string; color?: string; bold?: boolean }>>) {
  const total = cols.reduce((s, c) => s + c.width, 0);
  const W = contentWidth(doc);
  const widths = cols.map((c) => (c.width / total) * W);
  const drawHead = () => {
    const y = doc.y;
    doc.rect(M, y, W, 18).fill(C.navy);
    let x = M;
    cols.forEach((c, i) => {
      doc.font('S').fontSize(7.5).fillColor('#FFFFFF').text(c.label, x + 5, y + 5, { width: widths[i] - 10, align: c.align ?? 'left', lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 18;
  };
  ensureSpace(doc, 40);
  drawHead();
  rows.forEach((row, ri) => {
    const cells = row.map((c) => (typeof c === 'string' ? { text: c } : c));
    doc.font('R').fontSize(8);
    const h = Math.max(16, ...cells.map((c, i) => doc.heightOfString(c.text || '—', { width: widths[i] - 10 }) + 8));
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHead();
    }
    const y = doc.y;
    if (ri % 2 === 1) doc.rect(M, y, W, h).fill(C.bg);
    let x = M;
    cells.forEach((c, i) => {
      doc.font(c.bold ? 'S' : 'R').fontSize(8).fillColor(c.color ?? C.text).text(c.text || '—', x + 5, y + 4, { width: widths[i] - 10, align: cols[i].align ?? 'left' });
      x += widths[i];
    });
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.4).strokeColor(C.border).stroke();
    doc.y = y + h;
  });
  doc.x = M;
  doc.moveDown(0.6);
}

function paragraph(doc: Doc, label: string, text?: string | null) {
  if (!text) return;
  ensureSpace(doc, 40);
  doc.font('S').fontSize(8.5).fillColor(C.navy).text(label, M);
  doc.font('R').fontSize(9).fillColor(C.text).text(text, M, doc.y + 2, { width: contentWidth(doc), lineGap: 2 });
  doc.moveDown(0.6);
}

async function photos(doc: Doc, attachments: Array<{ storageKey: string; mimeType: string; caption: string | null; fileName: string; tag?: string | null }>, heading = 'Fotoğraflar') {
  const imgs = attachments.filter((a) => /image\/(jpeg|png)/.test(a.mimeType)).slice(0, 24);
  if (!imgs.length) return;
  sectionHeading(doc, heading);
  const gap = 10;
  const w = (contentWidth(doc) - gap * 2) / 3;
  const h = w * 0.72;
  let col = 0;
  for (const a of imgs) {
    const file = path.join(config.storageDir, a.storageKey);
    if (!fs.existsSync(file)) continue;
    if (col === 0) ensureSpace(doc, h + 24);
    const x = M + col * (w + gap);
    const y = doc.y;
    try {
      doc.save();
      doc.roundedRect(x, y, w, h, 4).clip();
      doc.image(file, x, y, { cover: [w, h], align: 'center', valign: 'center' });
      doc.restore();
    } catch {
      doc.restore();
      doc.rect(x, y, w, h).fill(C.bg);
    }
    const cap = [a.tag === 'BEFORE' ? 'ÖNCE' : a.tag === 'AFTER' ? 'SONRA' : null, a.caption ?? a.fileName].filter(Boolean).join(' · ');
    doc.font('R').fontSize(7).fillColor(C.muted).text(cap, x, y + h + 3, { width: w, lineBreak: false, ellipsis: true });
    col = (col + 1) % 3;
    if (col === 0) doc.y = y + h + 18;
    else doc.y = y;
  }
  if (col !== 0) doc.y += h + 18;
  doc.x = M;
}

function signatures(doc: Doc, boxes: Array<{ role: string; name?: string | null; date?: Date | null; signed?: boolean }>) {
  ensureSpace(doc, 100);
  sectionHeading(doc, 'Onay ve İmzalar');
  const gap = 12;
  const w = (contentWidth(doc) - gap * (boxes.length - 1)) / boxes.length;
  const y = doc.y;
  boxes.forEach((b, i) => {
    const x = M + i * (w + gap);
    doc.roundedRect(x, y, w, 76, 4).lineWidth(0.6).strokeColor(C.border).stroke();
    doc.font('R').fontSize(7).fillColor(C.muted).text(b.role.toUpperCase(), x + 8, y + 8, { width: w - 16, characterSpacing: 0.3 });
    doc.font('S').fontSize(9.5).fillColor(C.text).text(b.name ?? '........................................', x + 8, y + 22, { width: w - 16 });
    doc.font('R').fontSize(7.5).fillColor(b.signed ? C.ok : C.muted).text(b.signed ? `Elektronik onay · ${fmtDate(b.date)}` : 'İmza / Tarih', x + 8, y + 58, { width: w - 16 });
  });
  doc.y = y + 88;
  doc.x = M;
}

function vesselBlock(doc: Doc, v: { name: string; type?: string | null; make?: string | null; model?: string | null; year?: number | null; lengthM?: number | null; flag?: string | null; marina?: string | null; berth?: string | null; owner?: { name: string } | null }, extra: Array<[string, string | null | undefined]> = []) {
  sectionHeading(doc, 'Tekne Bilgileri');
  kvGrid(
    doc,
    [
      ['Tekne adı', v.name],
      ['Tip', v.type],
      ['Marka / Model', [v.make, v.model].filter(Boolean).join(' ')],
      ['Yıl / Boy', [v.year, v.lengthM ? `${v.lengthM} m` : null].filter(Boolean).join(' · ')],
      ['Bayrak', v.flag],
      ['Marina / Bağlama', [v.marina, v.berth].filter(Boolean).join(' · ')],
      ...(v.owner ? ([['Tekne sahibi', v.owner.name]] as Array<[string, string]>) : []),
      ...extra,
    ],
    3,
  );
}

// ──────────────────────────────────────────────────────────────
// Denetim raporu
// ──────────────────────────────────────────────────────────────
export async function inspectionPdf(id: string, opts: { includeInternalPhotos: boolean }) {
  const insp = await prisma.inspection.findUniqueOrThrow({
    where: { id },
    include: { vessel: { include: { owner: true, engines: true } }, inspector: true, items: true },
  });
  const approver = insp.approvedById ? await prisma.user.findUnique({ where: { id: insp.approvedById } }) : null;
  const attachments = await prisma.attachment.findMany({
    where: { entityType: 'INSPECTION_ITEM', entityId: { in: insp.items.map((i) => i.id) }, ...(opts.includeInternalPhotos ? {} : { customerVisible: true }) },
  });
  const docTitle = 'Haftalık Periyodik Tekne Kontrol ve Teknik Denetim Matrisi';
  const doc = createDoc({ title: 'Teknik Denetim', number: insp.number, date: insp.date, draft: insp.status !== 'APPROVED' });
  title(doc, `${insp.vessel.name} — ${docTitle}`, `Şablon sürümü ${insp.templateVersion} · Durum: ${insp.status === 'APPROVED' ? 'Onaylandı' : insp.status === 'SUBMITTED' ? 'Onay bekliyor' : 'Taslak'}`);
  vesselBlock(doc, insp.vessel, [
    ['Denetim tarihi', fmtDate(insp.date)],
    ['Denetçi', insp.inspector.name],
    ['Kaptan', insp.captainName],
  ]);

  const count = (r: InspectionResult) => insp.items.filter((i) => i.result === r).length;
  sectionHeading(doc, 'Özet');
  const W = contentWidth(doc);
  const y = doc.y;
  (['OK', 'ATTENTION', 'FAULT', 'NA'] as InspectionResult[]).forEach((r, i) => {
    const bw = (W - 30) / 4;
    const x = M + i * (bw + 10);
    doc.roundedRect(x, y, bw, 44, 4).fill(C.bg);
    doc.rect(x, y, 3, 44).fill(RESULT_COLOR[r]);
    doc.font('B').fontSize(18).fillColor(RESULT_COLOR[r]).text(String(count(r)), x + 12, y + 6, { lineBreak: false });
    doc.font('S').fontSize(8).fillColor(C.text).text(INSPECTION_RESULT_LABELS[r], x + 12, y + 29, { lineBreak: false });
  });
  doc.y = y + 56;

  for (const sec of INSPECTION_TEMPLATE) {
    const items = insp.items.filter((i) => i.sectionCode === sec.code).sort((a, b) => Number(a.itemCode.split('.')[1]) - Number(b.itemCode.split('.')[1]));
    sectionHeading(doc, `${Number(sec.code.slice(1))}. ${sec.title}`);
    table(
      doc,
      [
        { label: 'NO', width: 0.6 },
        { label: 'KONTROL MADDESİ', width: 4 },
        { label: 'SONUÇ', width: 1.1, align: 'center' },
        { label: 'ÖLÇÜM', width: 1.1, align: 'center' },
        { label: 'AÇIKLAMA', width: 3.4 },
      ],
      items.map((i) => [
        i.itemCode.split('.')[1],
        i.label,
        i.result ? { text: INSPECTION_RESULT_LABELS[i.result as InspectionResult], color: RESULT_COLOR[i.result as InspectionResult], bold: true } : '—',
        i.measurement ? `${i.measurement}${i.unit ? ' ' + i.unit : ''}` : '',
        i.note ?? '',
      ]),
    );
  }
  paragraph(doc, 'Genel değerlendirme', insp.generalNotes);
  await photos(doc, attachments.map((a) => ({ ...a, caption: a.caption ?? insp.items.find((i) => i.id === a.entityId)?.label ?? null })), 'Denetim Fotoğrafları');
  signatures(doc, [
    { role: 'Denetçi / Teknisyen', name: insp.inspector.name, date: insp.submittedAt, signed: !!insp.submittedAt },
    { role: 'Kaptan', name: insp.captainName },
    { role: 'Operasyon Onayı', name: approver?.name, date: insp.approvedAt, signed: !!insp.approvedAt },
  ]);
  finalize(doc);
  return doc;
}

// ──────────────────────────────────────────────────────────────
// Teknik raporlar
// ──────────────────────────────────────────────────────────────
export const CLAUSE_CATALOG: Record<string, { label: string; text: string }> = {
  TECHNICAL_COMPLIANCE: {
    label: 'Teknik uygunluk beyanı',
    text: 'Bu raporda belirtilen işlemler Nexus Marine teknik standartlarına uygun olarak gerçekleştirilmiş ve kontrol edilmiştir.',
  },
  DEFECT_FREE_DELIVERY: {
    label: 'Ayıpsız teslim beyanı',
    text: 'Tekne, yukarıda listelenen işler tamamlanmış ve görünür bir ayıp bulunmaksızın teslim edilmiştir.',
  },
  WARRANTY: {
    label: 'Garanti taahhüdü',
    text: 'Yapılan işçilik, teslim tarihinden itibaren belirtilen garanti süresi boyunca garanti kapsamındadır. Garanti, kullanım hatası ve dış etkenleri kapsamaz.',
  },
  RELEASE: {
    label: 'İbra beyanı',
    text: 'Taraflar, bu protokolde belirtilen işler ve bedeller kapsamında birbirlerini karşılıklı olarak ibra eder.',
  },
};

export async function reportPdf(reportId: string, version: number | undefined, opts: { includeInternalPhotos: boolean }) {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: { vessel: { include: { owner: true } }, versions: { orderBy: { version: 'desc' } } },
  });
  if (report.type === 'INSPECTION' && report.inspectionId) return inspectionPdf(report.inspectionId, opts);
  const ver = (version ? report.versions.find((v) => v.version === version) : report.versions[0]) ?? report.versions[0];
  const data = (ver?.data ?? {}) as Record<string, any>;
  const users = await prisma.user.findMany({ where: { id: { in: [ver?.createdById, ver?.approvedById].filter(Boolean) as string[] } } });
  const preparer = users.find((u) => u.id === ver?.createdById);
  const approver = users.find((u) => u.id === ver?.approvedById);
  const approved = ver && ['APPROVED', 'PUBLISHED'].includes(ver.status);
  const doc = createDoc({ title: REPORT_TYPES[report.type as ReportType], number: `${report.number} · v${ver?.version ?? 1}`, date: ver?.createdAt ?? report.createdAt, draft: !approved });
  title(doc, report.title, `${REPORT_TYPES[report.type as ReportType]} · Sürüm ${ver?.version ?? 1} · ${REPORT_STATUS_LABELS[(ver?.status ?? 'DRAFT') as keyof typeof REPORT_STATUS_LABELS]}`);
  vesselBlock(doc, report.vessel, [['Rapor tarihi', fmtDate(data.reportDate ?? ver?.createdAt)]]);

  switch (report.type) {
    case 'POST_SCRAPING': {
      sectionHeading(doc, 'İnceleme Bilgileri');
      kvGrid(doc, [['İnceleme tarihi', fmtDate(data.inspectionDate)], ['İnceleme yeri', data.location], ['İnceleyen', data.inspector]], 3);
      paragraph(doc, 'İskele (Port) tarafı bulguları', data.portFindings);
      paragraph(doc, 'Sancak (Starboard) tarafı bulguları', data.starboardFindings);
      if (data.damages?.length) {
        sectionHeading(doc, 'Tespit Edilen Hasarlar');
        table(doc, [{ label: 'KONUM', width: 2 }, { label: 'TARAF', width: 1 }, { label: 'AÇIKLAMA', width: 4 }, { label: 'DERECE', width: 1.2 }], data.damages.map((d: any) => [d.location ?? '', d.side ?? '', d.description ?? '', d.severity ?? '']));
      }
      if (data.moistureReadings?.length) {
        sectionHeading(doc, 'Nem Ölçümleri');
        table(doc, [{ label: 'ÖLÇÜM NOKTASI', width: 3 }, { label: 'TARAF', width: 1.2 }, { label: 'DEĞER (%)', width: 1.2, align: 'right' }, { label: 'DEĞERLENDİRME', width: 2.6 }], data.moistureReadings.map((m: any) => {
          const v = Number(m.value);
          const color = v >= 20 ? C.fault : v >= 15 ? C.warn : C.ok;
          return [m.point ?? '', m.side ?? '', { text: String(m.value ?? ''), color, bold: true }, m.note ?? (v >= 20 ? 'Yüksek nem' : v >= 15 ? 'Takip' : 'Normal')];
        }));
      }
      paragraph(doc, 'Teknik değerlendirme', data.assessment);
      paragraph(doc, 'Önerilen onarım', data.recommendation);
      break;
    }
    case 'HULL_RESTORATION': {
      paragraph(doc, 'Proje özeti', data.summary);
      if (data.phases?.length) {
        sectionHeading(doc, 'Restorasyon Aşamaları');
        table(doc, [{ label: '#', width: 0.5 }, { label: 'AŞAMA', width: 2.2 }, { label: 'SORUMLU', width: 1.6 }, { label: 'TARİH', width: 2 }, { label: 'DURUM', width: 1.2 }, { label: 'MALZEME', width: 2.5 }], data.phases.map((p: any, i: number) => [String(i + 1), p.name, p.responsible ?? '', [fmtDate(p.startDate), fmtDate(p.endDate)].join(' – '), { text: p.status === 'DONE' ? 'Tamamlandı' : p.status === 'IN_PROGRESS' ? 'Devam ediyor' : 'Başlamadı', color: p.status === 'DONE' ? C.ok : p.status === 'IN_PROGRESS' ? C.warn : C.muted, bold: true }, p.materials ?? '']));
      }
      if (data.progress != null) kvGrid(doc, [['Genel ilerleme', `%${Math.round(data.progress)}`], ['Başlangıç', fmtDate(data.startDate)], ['Planlanan bitiş', fmtDate(data.endDate)]], 3);
      paragraph(doc, 'Teknik notlar', data.notes);
      break;
    }
    case 'TEAK_CARPENTRY': {
      paragraph(doc, 'Çalışma özeti', data.summary);
      if (data.areas?.length) {
        sectionHeading(doc, 'Çalışma Alanları');
        table(doc, [{ label: 'ALAN', width: 2.2 }, { label: 'MİKTAR', width: 1.1, align: 'right' }, { label: 'MALZEME', width: 1.8 }, { label: 'KULLANILAN ÜRÜNLER', width: 2.2 }, { label: 'İŞÇİLİK (s)', width: 1.1, align: 'right' }, { label: 'İLERLEME', width: 1.1, align: 'right' }], data.areas.map((a: any) => [a.area ?? '', `${a.quantity ?? ''} ${a.unit ?? 'm²'}`, a.material ?? '', a.products ?? '', String(a.labourHours ?? ''), { text: `%${a.progress ?? 0}`, bold: true, color: Number(a.progress) >= 100 ? C.ok : C.marine }]));
        const totalQty = data.areas.reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0);
        const avg = data.areas.reduce((s: number, a: any) => s + (Number(a.progress) || 0), 0) / data.areas.length;
        kvGrid(doc, [['Toplam alan', `${totalQty.toFixed(1)} m²`], ['Ortalama ilerleme', `%${Math.round(avg)}`], ['Toplam işçilik', `${data.areas.reduce((s: number, a: any) => s + (Number(a.labourHours) || 0), 0)} saat`]], 3);
      }
      break;
    }
    case 'DELIVERY_PROTOCOL': {
      if (data.works?.length) {
        sectionHeading(doc, 'Yapılan İşler');
        table(doc, [{ label: 'NO', width: 0.6 }, { label: 'İŞ TANIMI', width: 5 }, { label: 'REFERANS', width: 1.6 }, { label: 'TARİH', width: 1.6 }], data.works.map((w: any, i: number) => [String(i + 1), w.description ?? '', w.ref ?? '', fmtDate(w.date)]));
      }
      if (data.captainRequests?.length) {
        sectionHeading(doc, 'Ek Kaptan Talepleri');
        table(doc, [{ label: 'TALEP', width: 5 }, { label: 'DURUM', width: 1.5 }], data.captainRequests.map((c: any) => [c.title ?? c.description ?? '', c.status ?? '']));
      }
      if (data.materials?.length) {
        sectionHeading(doc, 'Kullanılan Malzemeler');
        table(doc, [{ label: 'MALZEME', width: 4 }, { label: 'MİKTAR', width: 1.5, align: 'right' }], data.materials.map((m: any) => [m.name ?? '', `${m.quantity ?? ''} ${m.unit ?? ''}`]));
      }
      if (data.approvedExtras?.length) {
        sectionHeading(doc, 'Onaylanan Ek İşler');
        table(doc, [{ label: 'İŞ', width: 5 }, { label: 'ONAY TARİHİ', width: 1.6 }], data.approvedExtras.map((e: any) => [e.title ?? '', fmtDate(e.decidedAt)]));
      }
      sectionHeading(doc, 'Teslim Bilgileri');
      kvGrid(doc, [['Teslim tarihi', fmtDate(data.deliveryDate)], ['Garanti', data.warranty], ['Ödeme durumu', data.paymentStatus]], 3);
      paragraph(doc, 'Notlar', data.notes);
      break;
    }
  }
  if (data.preparedNotes) paragraph(doc, 'Ek açıklamalar', data.preparedNotes);

  // Yalnızca yetkili kullanıcı tarafından onaylanmış beyanlar eklenir
  const clauses = ((ver?.clauses as any[]) ?? []).filter((c) => c.approvedById && approved);
  if (clauses.length) {
    sectionHeading(doc, 'Beyanlar');
    for (const c of clauses) {
      ensureSpace(doc, 40);
      doc.font('S').fontSize(8.5).fillColor(C.navy).text(CLAUSE_CATALOG[c.key]?.label ?? c.key, M);
      doc.font('R').fontSize(8.5).fillColor(C.text).text(c.text, { width: contentWidth(doc) });
      doc.font('R').fontSize(7).fillColor(C.muted).text(`Onaylayan: ${c.approvedByName ?? ''} · ${fmtDate(c.approvedAt)}`);
      doc.moveDown(0.5);
    }
  }

  const attachments = await prisma.attachment.findMany({
    where: { entityType: 'REPORT', entityId: report.id, ...(opts.includeInternalPhotos ? {} : { customerVisible: true }) },
    orderBy: { createdAt: 'asc' },
  });
  let extra: typeof attachments = [];
  if (report.workOrderId) extra = await prisma.attachment.findMany({ where: { entityType: 'WORK_ORDER', entityId: report.workOrderId, customerVisible: true } });
  if (report.projectId) {
    const phaseIds = (await prisma.projectPhase.findMany({ where: { projectId: report.projectId }, select: { id: true } })).map((p) => p.id);
    extra = extra.concat(await prisma.attachment.findMany({ where: { OR: [{ entityType: 'PROJECT', entityId: report.projectId }, { entityType: 'PHASE', entityId: { in: phaseIds } }], customerVisible: true } }));
  }
  await photos(doc, [...attachments, ...extra]);
  signatures(doc, [
    { role: 'Hazırlayan', name: data.preparedBy ?? preparer?.name, date: ver?.createdAt, signed: true },
    { role: 'Onaylayan', name: approver?.name ?? data.approvedBy, date: ver?.approvedAt, signed: !!ver?.approvedAt },
    ...(report.type === 'DELIVERY_PROTOCOL' ? [{ role: 'Teslim Alan (Kaptan / Sahip)', name: data.receivedBy }] : []),
  ]);
  finalize(doc);
  return doc;
}

/** Bir PDF'i buffer olarak üretir (testler ve arşivleme için) */
export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
