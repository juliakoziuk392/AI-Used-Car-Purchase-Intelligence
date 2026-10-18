import { TERMINAL_ANALYSIS_STATUSES, type AnalysisDto } from '@carintel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, streamAnalysis } from './api';

/** Аналіз з live-оновленнями через SSE, доки він не завершиться. */
export function useAnalysis(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['analyses', id], queryFn: () => api.getAnalysis(id) });
  const isFinished = query.data ? TERMINAL_ANALYSIS_STATUSES.includes(query.data.status) : false;

  useEffect(() => {
    if (!query.data || isFinished) return;

    const controller = new AbortController();
    const onUpdate = (analysis: AnalysisDto) => {
      queryClient.setQueryData(['analyses', id], analysis);
      if (TERMINAL_ANALYSIS_STATUSES.includes(analysis.status)) {
        void queryClient.invalidateQueries({ queryKey: ['listings'] });
      }
    };

    streamAnalysis(id, onUpdate, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('Analysis stream failed', error);
    });
    return () => controller.abort();
    // Стрім відкриваємо один раз на аналіз, а не на кожне оновлення даних.
  },[id, Boolean(query.data), isFinished, queryClient]);

  return query;
}
