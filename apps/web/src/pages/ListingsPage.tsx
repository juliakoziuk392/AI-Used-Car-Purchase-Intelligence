import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CarSilhouette } from '../components/car/CarSilhouette';
import { ListingForm } from '../components/ListingForm';
import { api } from '../lib/api';
import { formatUsd, vehicleSubtitle, vehicleTitle } from '../lib/format';

export function ListingsPage() {
  const listings = useQuery({ queryKey: ['listings'], queryFn: api.listListings });

  return (
    <div className="flex flex-col gap-10">
      <header className="animate-fade-up text-center">
        <p className="eyebrow">AI Used-Car Purchase Intelligence</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Перевір авто перед покупкою</h1>
        <p className="mx-auto mt-3 max-w-xl text-mist">
          Встав посилання на оголошення — AI прочитає опис і фото, покаже слабкі місця на авто й підкаже, за що торгуватися.
        </p>
      </header>

      <ListingForm />

      <section className="flex flex-col gap-4">
        <h2 className="eyebrow">Мої оголошення</h2>
        {listings.isPending && <p className="text-mist">Завантаження…</p>}
        {listings.error && <p className="text-sev-critical">{listings.error.message}</p>}
        {listings.data?.length === 0 && <p className="text-mist">Поки порожньо — додай перше оголошення вище.</p>}
        <ul className="grid gap-4 sm:grid-cols-2">
          {listings.data?.map((listing, index) => {
            const photo = listing.rawData?.photos?.[0];
            return (
              <li key={listing.id} className="animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
                <Link
                  to={`/listings/${listing.id}`}
                  className="glass group block overflow-hidden transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-b from-white/10 to-transparent">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <CarSilhouette className="absolute inset-x-6 bottom-2 transition-transform duration-500 group-hover:translate-x-2" />
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3 p-5">
                    <div>
                      <p className="font-semibold">{vehicleTitle(listing)}</p>
                      <p className="text-sm text-mist">{vehicleSubtitle(listing)}</p>
                    </div>
                    <span className="text-lg font-bold">{formatUsd(listing.price)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
