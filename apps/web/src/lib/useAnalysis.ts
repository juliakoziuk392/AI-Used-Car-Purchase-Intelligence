import { isAnalysisSettled, type AnalysisDto } from '@carintel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, streamAnalysis } from './api';

/** Аналіз з live-оновленнями через SSE, доки він не завершиться і не догенерується 3D. */
export function useAnalysis(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['analyses', id], queryFn: () => api.getAnalysis(id) });
  const isFinished = query.data ? isAnalysisSettled(query.data) : false;

  useEffect(() => {
    if (!query.data || isFinished) return;

    const controller = new AbortController();
    const onUpdate = (analysis: AnalysisDto) => {
      queryClient.setQueryData(['analyses', id], analysis);
      if (isAnalysisSettled(analysis)) {
        void queryClient.invalidateQueries({ queryKey: ['listings'] });
      }
    };

    streamAnalysis(id, onUpdate, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('Analysis stream failed', error);
    });
    return () => controller.abort();
    // Стрім відкриваємо один раз на аналіз (і знову — на повторну генерацію 3D), а не на кожне оновлення даних.
  },[id, Boolean(query.data), isFinished, queryClient]);

  return query;
}
