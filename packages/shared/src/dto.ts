import type {
  AnalysisStatus,
  AnalysisStepKey,
  ListingSource,
  RiskSeverity,
  RiskSource,
} from './enums';
import type { AnalysisReport, ParsedListing } from './report';

/** 3D-модель саме цього авто, згенерована з фото оголошення. */
export interface Model3dResult {
  status: 'ready' | 'failed';
  /** Номери фото оголошення, з яких будувалась модель. */
  photos: number[];
  error?: string;
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
