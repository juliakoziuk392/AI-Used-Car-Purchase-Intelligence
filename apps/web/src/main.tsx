import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary
            fallback={(error) => (
              <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-lg font-medium">Щось зламалося на сторінці</p>
                <p className="max-w-md text-sm text-mist">{error.message}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10"
                >
                  Перезавантажити
                </button>
              </div>
            )}
          >
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
