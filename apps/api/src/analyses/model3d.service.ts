import type { AnalysisReport, Model3dResult, ParsedListing, PhotoView } from '@carintel/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Ракурси, що найкраще доповнюють головне фото для реконструкції всього кузова. */
const EXTRA_VIEWS: PhotoView[] = ['rear_left', 'rear_right', 'rear', 'left', 'right', 'front_left', 'front_right', 'front'];
const MAX_VIEWS = 4;

interface FileData {
  url?: string;
  path?: string;
}

/**
 * Генерує 3D-модель саме цього авто з фото оголошення через TRELLIS (Microsoft) —
 * відкриту модель image-to-3D, розгорнуту на Hugging Face Spaces (безкоштовний ZeroGPU з денною квотою).
 * HF_TOKEN (безкоштовний акаунт) збільшує квоту, але не обов'язковий.
 */
@Injectable()
export class Model3dService {
  private readonly logger = new Logger(Model3dService.name);
  private readonly space: string;
  private readonly hfToken: `hf_${string}` | undefined;
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.space = config.get<string>('TRELLIS_SPACE', 'trellis-community/TRELLIS');
    this.hfToken = (config.get<string>('HF_TOKEN') || undefined) as `hf_${string}` | undefined;
    this.directory = path.resolve(config.get<string>('STORAGE_DIR', 'storage'), 'models');
  }

  filePath(analysisId: string) {
    const file = path.join(this.directory, `${analysisId}.glb`);
    if (!existsSync(file)) throw new NotFoundException('3D-модель ще не згенерована');
    return file;
  }

  async generate(analysisId: string, parsed: ParsedListing, report: AnalysisReport | undefined): Promise<Model3dResult> {
    const photos = pickPhotos(parsed, report);
    if (!photos.length) return { status: 'failed', photos: [], error: 'В оголошенні немає фото кузова' };

    try {
      // Пакет ESM-only — підвантажуємо динамічно з CommonJS-збірки Nest.
      const { Client, handle_file } = await import('@gradio/client');
      const client = await Client.connect(this.space, { hf_token: this.hfToken });
      await client.predict('/start_session', {});

      const prepared: FileData[] = [];
      for (const { url } of photos) {
        const result = await client.predict('/preprocess_image', { image: handle_file(url) });
        prepared.push((result.data as FileData[])[0]);
      }

      const result = await client.predict('/generate_and_extract_glb', {
        image: prepared[0],
        // Кілька ракурсів того самого авто — TRELLIS відновлює кузов з усіх боків точніше.
        multiimages: prepared.length > 1 ? prepared.map((image) => ({ image, caption: null })) : [],
        seed: 0,
        ss_guidance_strength: 7.5,
        ss_sampling_steps: 12,
        slat_guidance_strength: 3,
        slat_sampling_steps: 12,
        multiimage_algo: 'stochastic',
        mesh_simplify: 0.95,
        texture_size: 1024,
      });

      const [, glb, download] = result.data as [unknown, FileData | undefined, FileData | undefined];
      const url = glb?.url ?? download?.url;
      if (!url) throw new Error('TRELLIS не повернув GLB');

      const response = await fetch(url, {
        headers: this.hfToken ? { Authorization: `Bearer ${this.hfToken}` } : {},
      });
      if (!response.ok) throw new Error(`Не вдалося завантажити GLB (HTTP ${response.status})`);

      await mkdir(this.directory, { recursive: true });
      await writeFile(path.join(this.directory, `${analysisId}.glb`), Buffer.from(await response.arrayBuffer()));
      return { status: 'ready', photos: photos.map((photo) => photo.number) };
    } catch (error) {
      const message = gradioErrorMessage(error);
      this.logger.warn(`3D для ${analysisId} не згенеровано: ${message}`);
      return { status: 'failed', photos: photos.map((photo) => photo.number), error: message };
    }
  }
}

/**
 * Головне фото — те, яке AI визначив найкращим ракурсом на 3/4, плюс до трьох інших ракурсів кузова.
 * Без AI (демо-режим) беремо обкладинку оголошення: це майже завжди фото авто цілком.
 */
function pickPhotos(parsed: ParsedListing, report: AnalysisReport | undefined) {
  const byNumber = (number: number) => ({ number, url: parsed.photos[number - 1] });
  const views = report?.photoViews ?? [];

  if (report?.heroPhoto && parsed.photos[report.heroPhoto - 1]) {
    const chosen = [byNumber(report.heroPhoto)];
    const heroView = views.find((v) => v.photo === report.heroPhoto)?.view;
    for (const view of EXTRA_VIEWS) {
      if (chosen.length >= MAX_VIEWS) break;
      if (view === heroView) continue;
      const match = views.find((v) => v.view === view && !chosen.some((c) => c.number === v.photo));
      if (match && parsed.photos[match.photo - 1]) chosen.push(byNumber(match.photo));
    }
    return chosen;
  }

  if (parsed.cover) {
    const index = parsed.photos.findIndex((url) => sameRiaPhoto(url, parsed.cover!));
    return [{ number: index + 1, url: index >= 0 ? parsed.photos[index] : parsed.cover }];
  }
  return parsed.photos.length ? [byNumber(1)] : [];
}

/** На riastatic одне фото має кілька розмірів: __<id>hd.webp, __<id>fx.webp тощо. */
function sameRiaPhoto(a: string, b: string) {
  const id = (url: string) => url.match(/__(\d+)[a-z]*\.(webp|jpg)$/)?.[1];
  return id(a) !== undefined && id(a) === id(b);
}

/** Gradio кидає не Error, а об'єкт статусу — дістаємо з нього зрозуміле повідомлення. */
function gradioErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error);
  return /quota/i.test(message)
    ? 'Вичерпано безкоштовну денну квоту GPU на Hugging Face. Додай HF_TOKEN у .env або спробуй пізніше.'
    : message;
}
