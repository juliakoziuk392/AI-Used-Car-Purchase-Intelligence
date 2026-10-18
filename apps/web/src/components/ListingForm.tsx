import { createListingSchema, type CreateListingInput } from '@carintel/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Field } from './Field';

const toNumber = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(/\s/g, '')));

/** Лише посилання й ціна: оголошення створюється й одразу йде на AI-аналіз. */
export function ListingForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<CreateListingInput>({ resolver: zodResolver(createListingSchema) });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const listing = await api.createListing(input);
      return api.startAnalysis(listing.id);
    },
    onSuccess: (analysis) => {
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      navigate(`/analyses/${analysis.id}`);
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      className="glass animate-fade-up flex flex-col gap-4 p-6 md:flex-row md:items-start"
    >
      <Field
        label="Посилання на оголошення"
        placeholder="https://auto.ria.com/uk/auto_..."
        className="flex-1"
        error={errors.url?.message}
        {...form.register('url')}
      />
      <Field
        label="Ціна, $"
        placeholder="53 000"
        inputMode="numeric"
        className="md:w-40"
        error={errors.price?.message}
        {...form.register('price', { setValueAs: toNumber })}
      />
      <button type="submit" disabled={mutation.isPending} className="btn btn-primary md:mt-[1.6rem] md:py-[0.7rem]">
        {mutation.isPending ? 'Читаємо оголошення…' : 'Перевірити авто'}
      </button>
      {mutation.error && <p className="text-sm text-sev-critical md:self-center">{mutation.error.message}</p>}
    </form>
  );
}
