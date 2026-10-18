import { ANALYSIS_STEP_KEYS, ANALYSIS_STEPS, type AnalysisDto, type CarZone } from '@carintel/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { paintFromColorName } from '../components/car3d/paint';
import { Showroom } from '../components/car3d/Showroom';
import { ReportView, sortFindings } from '../components/report/ReportView';
import { api } from '../lib/api';
import { vehicleSubtitle, vehicleTitle } from '../lib/format';
import { useAnalysis } from '../lib/useAnalysis';

type StepState = 'done' | 'active' | 'pending' | 'failed';

function stepState(analysis: AnalysisDto, index: number): StepState {
  if (analysis.status === 'done') return 'done';
  if (analysis.status === 'queued' || !analysis.currentStep) return 'pending';
  const current = ANALYSIS_STEP_KEYS.indexOf(analysis.currentStep);
  if (index < current) return 'done';
  if (index > current) return 'pending';
  return analysis.status === 'failed' ? 'failed' : 'active';
}

export function AnalysisPage() {
  const { id = '' } = useParams();
  const analysis = useAnalysis(id);
  const [selectedZone, setSelectedZone] = useState<CarZone | null>(null);
  const listingId = analysis.data?.listingId;
  const listing = useQuery({
    queryKey: ['listings', listingId],
    queryFn: () => api.getListing(listingId!),
    enabled: Boolean(listingId),
  });

  if (analysis.isPending) return <p className="text-mist">Завантаження…</p>;
  if (analysis.error) return <p className="text-sev-critical">{analysis.error.message}</p>;

  const data = analysis.data;
  const report = data.status === 'done' ? data.result?.report : undefined;
  const failed = data.status === 'failed';
  const activeStep = ANALYSIS_STEPS.find((step) => step.key === data.currentStep);

  const title = listing.data ? vehicleTitle(listing.data) : 'Авто';
  const subtitle = listing.data ? vehicleSubtitle(listing.data) : '';
  const paint = paintFromColorName(listing.data?.rawData?.specs?.['Колір']);

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/listings/${data.listingId}`} className="text-sm text-mist transition-colors hover:text-ice">
        ← До оголошення
      </Link>

      <div>
        <Showroom
          eyebrow={report ? 'Звіт перед покупкою' : failed ? 'Аналіз зупинено' : 'AI аналізує оголошення'}
          title={title}
          subtitle={
            report ? (
              subtitle
            ) : failed ? (
              <span className="text-sev-critical">{data.result?.error ?? 'Щось пішло не так'}</span>
            ) : (
              <span className="text-shimmer text-lg font-medium">
                {activeStep ? `${activeStep.label}…` : 'Ставимо в чергу…'}
              </span>
            )
          }
          paint={paint}
          findings={report ? sortFindings(report.findings) : []}
          selectedZone={selectedZone}
          onSelectZone={setSelectedZone}
          scanning={!report && !failed}
        />

        {report ? (
          <div className="mt-0">
            <ReportView
              report={report}
              selectedZone={selectedZone}
              setSelectedZone={setSelectedZone}
              photos={listing.data?.rawData?.photos ?? []}
            />
          </div>
        ) : (
          <AnalysisSteps analysis={data} />
        )}
      </div>
    </div>
  );
}

function AnalysisSteps({ analysis }: { analysis: AnalysisDto }) {
  const failed = analysis.status === 'failed';
  return (
    <div className="relative z-10 mx-auto -mt-20 w-full max-w-xl px-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${failed ? 'bg-sev-critical' : 'bg-ice'}`}
          style={{ width: `${Math.max(analysis.progress, 4)}%` }}
        />
      </div>
      <ol className="mt-6 flex flex-col gap-2">
        {ANALYSIS_STEPS.map((step, index) => {
          const state = stepState(analysis, index);
          return (
            <li
              key={step.key}
              className={`glass flex items-center gap-4 px-5 py-3.5 transition-all duration-500 ${
                state === 'active' ? 'scale-[1.02] border-white/30 bg-white/10' : ''
              } ${state === 'pending' ? 'opacity-50' : ''}`}
            >
              <StepIcon state={state} />
              <div>
                <p className="font-medium">{step.label}</p>
                <p className="text-sm text-mist">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sev-low text-night">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/15 border-t-ice" />;
  }
  if (state === 'failed') {
    return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sev-critical font-bold text-night">!</span>;
  }
  return <span className="h-7 w-7 rounded-full border-2 border-white/15" />;
}
