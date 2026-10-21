export const ANALYSIS_QUEUE = 'analysis';

/** Задачі черги: повний аналіз і повторна генерація лише 3D-моделі. */
export const ANALYZE_JOB = 'analyze';
export const MODEL3D_JOB = 'model3d';

/** Скільки разів пробуємо виконати аналіз, перш ніж позначити його як failed. */
export const ANALYSIS_ATTEMPTS = 3;

/** Скільки задач воркер виконує паралельно — щоб генерація 3D (1–3 хв) не блокувала нові аналізи. */
export const ANALYSIS_CONCURRENCY = 2;

export interface AnalysisJobData {
  analysisId: string;
}

/**
 * id задачі генерації 3D. Унікальний на кожен запуск: BullMQ ігнорує задачу з id,
 * який ще лежить серед завершених. Двокрапку в id BullMQ не дозволяє, тож розділювач «_».
 */
export const model3dJobId = (analysisId: string) => `${analysisId}_${MODEL3D_JOB}_${Date.now()}`;

/** id аналізу за id задачі: для аналізу вони збігаються, для 3D — префікс. */
export const analysisIdFromJobId = (jobId: string) => jobId.split('_')[0];
