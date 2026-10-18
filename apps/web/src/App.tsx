import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './lib/auth';
import { AnalysisPage } from './pages/AnalysisPage';
import { AuthPage } from './pages/AuthPage';
import { ListingPage } from './pages/ListingPage';
import { ListingsPage } from './pages/ListingsPage';

function RequireAuth() {
  const { user, isLoading, isServerDown, retry } = useAuth();
  if (isLoading) return <p className="p-8 text-mist">Завантаження…</p>;
  if (isServerDown) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium">Сервер не відповідає</p>
        <p className="max-w-md text-sm text-mist">Перевір, що API запущений (pnpm dev), і спробуй ще раз.</p>
        <button onClick={retry} className="rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10">
          Спробувати ще раз
        </button>
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<ListingsPage />} />
          <Route path="/listings/:id" element={<ListingPage />} />
          <Route path="/analyses/:id" element={<AnalysisPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
