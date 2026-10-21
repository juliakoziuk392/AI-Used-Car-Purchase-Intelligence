import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq';
import { Subject } from 'rxjs';
import { ANALYSIS_QUEUE, analysisIdFromJobId } from './analysis.queue';

/**
 * Слухає події черги через Redis (працює, навіть якщо воркер в іншому процесі)
 * і віддає id аналізів, стан яких змінився — і для самого аналізу, і для генерації його 3D.
 */
@QueueEventsListener(ANALYSIS_QUEUE)
export class AnalysisEventsListener extends QueueEventsHost {
  readonly changed$ = new Subject<string>();

  @OnQueueEvent('active')
  onActive({ jobId }: { jobId: string }) {
    this.emit(jobId);
  }

  @OnQueueEvent('progress')
  onProgress({ jobId }: { jobId: string }) {
    this.emit(jobId);
  }

  @OnQueueEvent('completed')
  onCompleted({ jobId }: { jobId: string }) {
    this.emit(jobId);
  }

  /** Спроба не вдалася, і задача чекає на повтор (backoff). */
  @OnQueueEvent('delayed')
  onDelayed({ jobId }: { jobId: string }) {
    this.emit(jobId);
  }

  @OnQueueEvent('failed')
  onFailed({ jobId }: { jobId: string }) {
    this.emit(jobId);
  }

  private emit(jobId: string) {
    this.changed$.next(analysisIdFromJobId(jobId));
  }
}
