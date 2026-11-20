import { useEffect, useState } from 'react';
import { apiFetch, navigateTo } from './lib/api';
import { LiveWidget } from './components/LiveWidget';
import { AiChatPage } from './pages/AiChatPage';
import { AuthPages } from './pages/AuthPages';
import { CustomerPanel } from './pages/CustomerPanel';
import { MarketingSite } from './pages/MarketingSite';
import { PublicContractView } from './pages/PublicContractView';
import { SuperAdminPanel } from './pages/SuperAdminPanel';
import type { SessionUser } from './shared/types';

export default function App() {
  const [path, setPath] = useState<string>(() => window.location.pathname);
  const [customerUser, setCustomerUser] = useState<SessionUser | null>(null);
  const [adminUser, setAdminUser] = useState<SessionUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<{ authenticated: boolean; user: SessionUser | null }>('/api/auth/me').catch(() => ({
        authenticated: false,
        user: null,
      })),
      apiFetch<{ authenticated: boolean; user: SessionUser | null }>('/api/admin/auth/me').catch(() => ({
        authenticated: false,
        user: null,
      })),
    ])
      .then(([cust, adm]) => {
        setCustomerUser(cust.authenticated ? cust.user : null);
        setAdminUser(adm.authenticated ? adm.user : null);
      })
      .finally(() => setAuthLoaded(true));
  }, []);

  // Isolated Widget Iframe Route (/widget/frame?key=...)
  if (path === '/widget/frame') {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key') || '';
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        <LiveWidget
          publicInstallKey={key}
          embeddedFrame
          onClose={() => {
            if (window.parent !== window) {
              window.parent.postMessage({ type: 'RAMAX_WIDGET_CLOSE' }, '*');
            }
          }}
        />
      </div>
    );
  }

  // Public Limited-Access Contract Share View (/contract/view/:token)
  if (path.startsWith('/contract/view/')) {
    const token = path.replace('/contract/view/', '').split('/')[0];
    return <PublicContractView shareToken={token} />;
  }

  // Separate Super Admin Panel (/control and /control/login)
  if (path.startsWith('/control')) {
    if (!authLoaded) {
      return <div className="min-h-screen bg-slate-50 p-10 text-center text-sm text-slate-500">در حال بررسی نشست مدیرکل...</div>;
    }
    if (!adminUser || path === '/control/login') {
      return (
        <AuthPages
          mode="admin_login"
          onCustomerAuthed={(u) => setCustomerUser(u)}
          onAdminAuthed={(u) => setAdminUser(u)}
        />
      );
    }
    return (
      <SuperAdminPanel
        adminUser={adminUser}
        onLogout={async () => {
          await apiFetch('/api/admin/auth/logout', { method: 'POST' });
          setAdminUser(null);
          navigateTo('/control/login');
        }}
      />
    );
  }

  // Standalone AI Chat Environment (/ai)
  if (path.startsWith('/ai')) {
    if (!authLoaded) {
      return <div className="min-h-screen bg-white p-10 text-center text-sm text-slate-500">در حال بارگذاری محیط راماکس AI...</div>;
    }
    return <AiChatPage user={customerUser} />;
  }

  // Customer Panel (/panel/*)
  if (path.startsWith('/panel')) {
    if (!authLoaded) {
      return <div className="min-h-screen bg-slate-50 p-10 text-center text-sm text-slate-500">در حال بارگذاری پنل مشتری...</div>;
    }
    if (!customerUser) {
      return (
        <AuthPages
          mode="login"
          onCustomerAuthed={(u) => setCustomerUser(u)}
          onAdminAuthed={(u) => setAdminUser(u)}
        />
      );
    }
    return (
      <CustomerPanel
        user={customerUser}
        routePath={path}
        onUserUpdated={(u) => setCustomerUser(u)}
        onLogout={async () => {
          await apiFetch('/api/auth/logout', { method: 'POST' });
          setCustomerUser(null);
          navigateTo('/login');
        }}
      />
    );
  }

  // Customer Login & Register
  if (path === '/login') {
    return (
      <AuthPages
        mode="login"
        onCustomerAuthed={(u) => setCustomerUser(u)}
        onAdminAuthed={(u) => setAdminUser(u)}
      />
    );
  }

  if (path === '/register') {
    return (
      <AuthPages
        mode="register"
        onCustomerAuthed={(u) => setCustomerUser(u)}
        onAdminAuthed={(u) => setAdminUser(u)}
      />
    );
  }

  // Main RAMAX Marketing Site (/, /features, /ecommerce, /support-solution, /automation, /pricing, /docs, /contact, /privacy, /terms)
  return <MarketingSite routePath={path} />;
}
