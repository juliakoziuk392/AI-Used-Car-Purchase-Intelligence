import { detectListingSource, type CreateListingInput } from '@carintel/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { Analysis, Listing, Vehicle } from '../database/models';
import { EMPTY_PARSED_LISTING, parseListingPage } from './listing-parser';

export interface VehicleFields {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  generation?: string | null;
  engine?: string | null;
  gearbox?: string | null;
  year?: number | null;
}

@Injectable()
export class ListingsService {
  constructor(
    @InjectModel(Listing) private readonly listings: typeof Listing,
    @InjectModel(Vehicle) private readonly vehicles: typeof Vehicle,
  ) {}

  findAll(userId: string) {
    return this.listings.findAll({
      where: { userId },
      include: [Vehicle],
      order: [['createdAt', 'DESC']],
    });
  }

  async findOne(userId: string, id: string, transaction?: Transaction) {
    const listing = await this.listings.findOne({
      where: { id, userId },
      include: [Vehicle, Analysis],
      order: [[{ model: Analysis, as: 'analyses' }, 'createdAt', 'DESC']],
      transaction,
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  /** Користувач дає лише посилання — ціну, марку, модель, рік, пробіг і фото беремо зі сторінки. */
  async create(userId: string, input: CreateListingInput) {
    // Якщо сторінку не вдалося прочитати, оголошення все одно створюємо — AI спробує ще раз під час аналізу.
    const parsed = await parseListingPage(input.url).catch(() => EMPTY_PARSED_LISTING);
    const listing = await this.listings.create({
      userId,
      url: input.url,
      source: detectListingSource(input.url),
      price: parsed.priceUsd,
      mileage: parsed.mileageKm,
      rawData: parsed,
    });
    await this.applyVehicle(listing, {
      vin: parsed.vin,
      make: parsed.make,
      model: parsed.model,
      year: parsed.year,
    });
    return this.findOne(userId, listing.id);
  }

  /**
   * Прив'язує до оголошення авто або доповнює вже прив'язане новими даними.
   * Нове авто створюємо лише коли відомі марка, модель і рік.
   */
  async applyVehicle(listing: Listing, data: VehicleFields) {
    const fields = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== null && value !== undefined && value !== ''),
    ) as VehicleFields;

    if (listing.vehicleId) {
      // VIN не чіпаємо: він унікальний і вже визначає це авто.
      const { vin: _vin, ...rest } = fields;
      await this.vehicles.update(rest, { where: { id: listing.vehicleId } });
      return;
    }
    if (!fields.make || !fields.model || !fields.year) return;

    const vehicle = fields.vin
      ? (await this.vehicles.findOrCreate({ where: { vin: fields.vin }, defaults: { ...fields } }))[0]
      : await this.vehicles.create({ ...fields });
    await listing.update({ vehicleId: vehicle.id });
  }

  async remove(userId: string, id: string) {
    const listing = await this.findOne(userId, id);
    await listing.destroy();
  }
}
