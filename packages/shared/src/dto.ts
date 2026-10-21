import {
  TERMINAL_ANALYSIS_STATUSES,
  type AnalysisStatus,
  type AnalysisStepKey,
  type ListingSource,
  type RiskSeverity,
  type RiskSource,
} from './enums';
import type { AnalysisReport, ParsedListing } from './report';

/** 3D-модель саме цього авто, згенерована з фото оголошення. */
export interface Model3dResult {
  /** generating — повторна генерація йде у фоні (задача в черзі), прогрес приходить через SSE. */
  status: 'generating' | 'ready' | 'failed';
  /** Номери фото оголошення, з яких будувалась модель. */
  photos: number[];
  error?: string;
  /** Лише для generating: прогрес 0–100 і поточний етап. */
  progress?: number;
  stage?: string;
  /** Лише для generating: коли поставили в чергу (ISO) — щоб розпізнати задачу, що зависла. */
  startedAt?: string;
}

export interface AnalysisResult {
  report?: AnalysisReport;
  model3d?: Model3dResult;
  error?: string;
}

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface VehicleDto {
  id: string;
  vin: string | null;
  make: string;
  model: string;
  generation: string | null;
  engine: string | null;
  gearbox: string | null;
  year: number;
}

export interface RiskFlagDto {
  id: string;
  severity: RiskSeverity;
  category: string;
  evidence: string;
  source: RiskSource;
}

export interface AnalysisDto {
  id: string;
  listingId: string;
  status: AnalysisStatus;
  progress: number;
  currentStep: AnalysisStepKey | null;
  score: number | null;
  result: AnalysisResult | null;
  riskFlags?: RiskFlagDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Чи більше не буде оновлень: аналіз завершився і 3D не генерується у фоні.
 * Доки ні — SSE-стрім лишається відкритим.
 */
export function isAnalysisSettled(analysis: Pick<AnalysisDto, 'status' | 'result'>): boolean {
  return (
    TERMINAL_ANALYSIS_STATUSES.includes(analysis.status) && analysis.result?.model3d?.status !== 'generating'
  );
}

export interface ListingDto {
  id: string;
  url: string;
  source: ListingSource;
  /** Ціна з оголошення в USD; null — якщо на сторінці її не знайшли. */
  price: number | null;
  mileage: number | null;
  vehicle: VehicleDto | null;
  rawData: Partial<ParsedListing>;
  analyses?: AnalysisDto[];
  createdAt: string;
  updatedAt: string;
}
