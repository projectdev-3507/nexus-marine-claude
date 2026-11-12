import { prisma } from '../db';

/**
 * Teklif ve sözleşmelerin mali durumu (Finans ve Tahsilat + Yönetim Raporları ortak).
 * Sözleşme bedeli: yönetici girdiyse o tutar, girmediyse belgenin (PDF) içinde yazan fiyat.
 */

const CUR: [RegExp, string][] = [
  [/^(€|eur|euro)$/i, 'EUR'],
  [/^(tl|₺|try)$/i, 'TRY'],
  [/^(\$|usd|dolar)$/i, 'USD'],
  [/^(£|gbp|sterlin)$/i, 'GBP'],
];
const curOf = (s: string) => CUR.find(([re]) => re.test(s.trim()))?.[1] ?? null;
const NUM = String.raw`(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?`;
const SYM = String.raw`(€|EUR|Euro|TL|₺|TRY|USD|\$|GBP|£)`;
const AFTER = new RegExp(`${NUM}\\s*${SYM}(?![A-Za-zçğıöşüÇĞİÖŞÜ])`, 'i');
const BEFORE = new RegExp(`${SYM}\\s*${NUM}`, 'i');

function amountIn(line: string): { amount: number; currency: string } | null {
  let m = AFTER.exec(line);
  let num: string, dec: string | undefined, sym: string;
  if (m) [, num, dec, sym] = m as unknown as [string, string, string | undefined, string];
  else {
    m = BEFORE.exec(line);
    if (!m) return null;
    [, sym, num, dec] = m as unknown as [string, string, string, string | undefined];
  }
  const amount = Number(num.replace(/[.\s]/g, '') + (dec ? `.${dec}` : ''));
  const currency = curOf(sym);
  return amount > 0 && currency ? { amount, currency } : null;
}

function lines(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(...v.split(/\n+/));
  else if (Array.isArray(v)) v.forEach((x) => lines(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => lines(x, out));
  return out;
}

/** Belge içinde yazan fiyat: önce "toplam … bedel/tutar/fiyat" satırı, sonra herhangi bir bedel satırı, sonra ilk tutar */
export function priceFromDoc(data: unknown): { amount: number; currency: string } | null {
  const ls = lines(data);
  const pick = (f: (l: string) => boolean) => { for (const l of ls) if (f(l)) { const a = amountIn(l); if (a) return a; } return null; };
  return (
    pick((l) => /toplam/i.test(l) && /bedel|tutar|fiyat|ücret/i.test(l)) ??
    pick((l) => /bedel|tutar|fiyat|teklif/i.test(l) && !/taksit|peşinat|ara ödeme/i.test(l)) ??
    pick(() => true)
  );
}

type Totals = Record<string, number>;
export const addTo = (t: Totals, cur: string, v: number) => { t[cur] = Math.round(((t[cur] ?? 0) + v) * 100) / 100; };

/** Sözleşmeler grubundaki tüm belgeler (teklif dosyaları, protokoller, özel sözleşme başlıkları) */
export async function loadContracts(where: { q?: string } = {}) {
  const cats = await prisma.reportCategory.findMany({ where: { group: 'contracts' }, select: { id: true, name: true } });
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const q = where.q;
  const reports = await prisma.report.findMany({
    where: {
      OR: [{ categoryId: { in: cats.map((c) => c.id) } }, { type: { in: ['DELIVERY_PROTOCOL', 'PROJECT_PROPOSAL'] } }],
      ...(q ? { AND: [{ OR: [{ title: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } }, { vessel: { name: { contains: q, mode: 'insensitive' } } }] }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      vessel: { select: { id: true, name: true, owner: { select: { id: true, name: true } } } },
      versions: { orderBy: { version: 'desc' }, take: 1, select: { data: true } },
    },
  });
  const payments = await prisma.payment.findMany({ where: { reportId: { in: reports.map((r) => r.id) } }, select: { reportId: true, amount: true, currency: true, date: true } });

  return reports.map((r) => {
    const docPrice = priceFromDoc(r.versions[0]?.data);
    const manual = r.contractAmount != null;
    const amount = manual ? r.contractAmount : docPrice?.amount ?? null;
    const currency = manual ? r.contractCurrency : docPrice?.currency ?? r.contractCurrency;
    const got = payments.filter((p) => p.reportId === r.id && p.currency === currency).reduce((s, p) => s + p.amount, 0);
    const approved = r.approvalStatus === 'APPROVED';
    const collected = r.paidAt ? Math.max(amount ?? 0, got) : got;
    const remaining = r.paidAt ? 0 : Math.max(0, (amount ?? 0) - got);
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      type: r.type,
      category: (r.categoryId && catName.get(r.categoryId)) || null,
      vessel: r.vessel,
      createdAt: r.createdAt,
      approvalStatus: r.approvalStatus,
      approved,
      approvedAt: r.approvalDecidedAt,
      amount,
      currency,
      amountSource: manual ? ('manual' as const) : docPrice ? ('doc' as const) : null,
      docPrice,
      paidAt: r.paidAt,
      paidBy: r.paidBy,
      collected,
      remaining,
    };
  });
}

export type ContractRow = Awaited<ReturnType<typeof loadContracts>>[number];

/** Toplamlar: alınan, bekleyen ödeme (onaylı ve ödenmemiş), onay bekleyen teklifler */
export function contractTotals(rows: ContractRow[]) {
  const t = { contracted: {} as Totals, collected: {} as Totals, pending: {} as Totals, awaiting: {} as Totals };
  const counts = { all: rows.length, paid: 0, pending: 0, awaiting: 0 };
  for (const r of rows) {
    if (r.collected > 0) addTo(t.collected, r.currency, r.collected);
    if (r.paidAt) counts.paid++;
    else if (r.approved) { counts.pending++; if (r.remaining > 0) addTo(t.pending, r.currency, r.remaining); }
    else { counts.awaiting++; if (r.amount) addTo(t.awaiting, r.currency, r.amount); }
    if ((r.approved || r.paidAt) && r.amount) addTo(t.contracted, r.currency, r.amount);
  }
  return { totals: t, counts };
}
