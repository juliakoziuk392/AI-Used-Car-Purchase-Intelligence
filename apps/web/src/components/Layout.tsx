import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ice text-sm font-extrabold text-night">C</span>
      CarIntel
    </Link>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 px-4 pt-4">
        <div className="glass mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Logo />
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-mist sm:inline">{user?.email}</span>
            <button onClick={signOut} className="btn btn-ghost py-1.5">
              Вийти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
