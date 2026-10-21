import { z } from 'zod';
import { isSupportedListingUrl } from './enums';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Користувач дає лише посилання — ціну, характеристики й фото дістають парсер і AI. */
export const createListingSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Встав посилання на оголошення')
    .refine(isSupportedListingUrl, 'Поки що підтримуються лише оголошення з auto.ria.com'),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;
