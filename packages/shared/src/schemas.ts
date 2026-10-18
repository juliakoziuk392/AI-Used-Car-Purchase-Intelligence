import { z } from 'zod';

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

/** Користувач вводить лише посилання й ціну — решту дістають парсер і AI. */
export const createListingSchema = z.object({
  url: z.string().trim().url('Встав посилання на оголошення'),
  price: z.number({ invalid_type_error: 'Вкажи ціну в $' }).int().positive('Ціна має бути більшою за 0'),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.pick({ price: true }).partial();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
