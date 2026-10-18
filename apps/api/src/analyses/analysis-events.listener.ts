import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq';
import { Subject } from 'rxjs';
import { ANALYSIS_QUEUE } from './analysis.queue';

/**
 * Слухає події черги через Redis (працює, навіть якщо воркер в іншому процесі)
 * і віддає id задач, стан яких змінився. jobId === analysisId.
 */
@QueueEventsListener(ANALYSIS_QUEUE)
export class AnalysisEventsListener extends QueueEventsHost {
  readonly changed$ = new Subject<string>();

  @OnQueueEvent('active')
  onActive({ jobId }: { jobId: string }) {
    this.changed$.next(jobId);
  }

  @OnQueueEvent('progress')
  onProgress({ jobId }: { jobId: string }) {
    this.changed$.next(jobId);
  }

  @OnQueueEvent('completed')
  onCompleted({ jobId }: { jobId: string }) {
    this.changed$.next(jobId);
  }

  @OnQueueEvent('failed')
  onFailed({ jobId }: { jobId: string }) {
    this.changed$.next(jobId);
  }
}
