import { TERMINAL_ANALYSIS_STATUSES, type AnalysisStatus } from '@carintel/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CarStage } from '../components/car/CarStage';
import { api } from '../lib/api';
import { formatUsd, vehicleSubtitle, vehicleTitle } from '../lib/format';

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  queued: 'У черзі',
  running: 'Виконується',
  done: 'Готово',
  failed: 'Помилка',
};

export function ListingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listing = useQuery({
    queryKey: ['listings', id],
    queryFn: () => api.getListing(id),
    // Поки є незавершені аналізи — оновлюємо їхній статус у списку.
    refetchInterval: (query) =>
      query.state.data?.analyses?.some((a) => !TERMINAL_ANALYSIS_STATUSES.includes(a.status))
        ? 2000
        : false,
  });

  const startAnalysis = useMutation({
    mutationFn: () => api.startAnalysis(id),
    onSuccess: (analysis) => {
      void queryClient.invalidateQueries({ queryKey: ['listings', id] });
      navigate(`/analyses/${analysis.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteListing(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['listings'] });
      navigate('/');
    },
  });

  if (listing.isPending) return <p className="text-mist">Завантаження…</p>;
  if (listing.error) return <p className="text-sev-critical">{listing.error.message}</p>;

  const data = listing.data;
  const photo = data.rawData?.photos?.[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="animate-fade-up text-center">
        <p className="eyebrow">Оголошення · {data.source}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{vehicleTitle(data)}</h1>
        <p className="mt-2 text-mist">{vehicleSubtitle(data)}</p>
      </header>

      <section className="pb-8">
        {photo ? (
          <img
            src={photo}
            alt={vehicleTitle(data)}
            className="glass animate-fade-up mx-auto aspect-[16/9] w-full max-w-3xl object-cover p-1.5"
          />
        ) : (
          <CarStage />
        )}
      </section>

      <div className="glass animate-fade-up flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="eyebrow">Ціна в оголошенні</p>
          <p className="text-3xl font-bold">{formatUsd(data.price)}</p>
          {data.vehicle?.vin && <p className="mt-1 font-mono text-xs text-mist">VIN {data.vehicle.vin}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={data.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Відкрити оголошення ↗
          </a>
          <button onClick={() => remove.mutate()} disabled={remove.isPending} className="btn btn-ghost text-sev-critical">
            Видалити
          </button>
          <button onClick={() => startAnalysis.mutate()} disabled={startAnalysis.isPending} className="btn btn-primary">
            Запустити AI-аналіз
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Аналізи</h2>
        {data.analyses?.length ? (
          <ul className="flex flex-col gap-2">
            {data.analyses.map((analysis, index) => (
              <li key={analysis.id} className="animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
                <Link
                  to={`/analyses/${analysis.id}`}
                  className="glass flex items-center justify-between px-5 py-4 text-sm transition-colors hover:bg-white/10"
                >
                  <span>{new Date(analysis.createdAt).toLocaleString('uk-UA')}</span>
                  <span className="flex items-center gap-2 text-mist">
                    {analysis.status === 'running' && (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-ice" />
                    )}
                    {STATUS_LABELS[analysis.status]}
                    {analysis.status === 'running' && ` · ${analysis.progress}%`}
                    {analysis.score !== null && (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-ice">
                        ризик {analysis.score}
                      </span>
                    )}
                    <span className="text-ice">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-mist">Ще не аналізували. Натисни «Запустити AI-аналіз».</p>
        )}
      </section>
    </div>
  );
}
