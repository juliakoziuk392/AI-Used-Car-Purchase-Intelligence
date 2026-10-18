import type { ListingDto } from '@carintel/shared';

export const formatUsd = (value: number | null) =>
  value === null ? 'Ціна не вказана' : `$${value.toLocaleString('uk-UA')}`;
export const formatKm = (value: number) => `${value.toLocaleString('uk-UA')} км`;

export function vehicleTitle(listing: ListingDto) {
  const v = listing.vehicle;
  if (v) return [v.make, v.model, v.generation].filter(Boolean).join(' ');
  return listing.rawData?.title ?? new URL(listing.url).hostname.replace(/^www\./, '');
}

export function vehicleSubtitle(listing: ListingDto) {
  const v = listing.vehicle;
  const year = v?.year ?? listing.rawData?.year;
  return [year, v?.engine, v?.gearbox, listing.mileage !== null ? formatKm(listing.mileage) : null]
    .filter(Boolean)
    .join(' · ');
}
