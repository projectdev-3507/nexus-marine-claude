import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, Receipt } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/ui';
import { QuotesList } from './Finance';
import Documents from './Documents';

/** Müşteri portalı: teklifler ve belgeler tek sayfada, sekmeli */
export default function PortalOffers() {
  const { can } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const quotes = can('quotes.respond');
  const tab = !quotes || loc.pathname.startsWith('/documents') ? 'docs' : 'quotes';
  return (
    <div>
      <PageHeader
        title={quotes ? 'Teklifler ve Belgeler' : 'Belgeler'}
        sub={tab === 'quotes' ? 'Size iletilen teklifleri inceleyin, onaylayın veya reddedin.' : 'Sözleşmeler, sertifikalar ve onaylı teknik raporlar'}
      />
      {quotes && (
        <div className="big-tabs mb-2" role="tablist">
          <button role="tab" aria-selected={tab === 'quotes'} className={tab === 'quotes' ? 'active' : ''} onClick={() => nav('/quotes', { replace: true })}><Receipt /> Teklifler</button>
          <button role="tab" aria-selected={tab === 'docs'} className={tab === 'docs' ? 'active' : ''} onClick={() => nav('/documents', { replace: true })}><FolderOpen /> Belgeler</button>
        </div>
      )}
      {tab === 'quotes' ? <QuotesList portal embedded /> : <Documents portal embedded />}
    </div>
  );
}
