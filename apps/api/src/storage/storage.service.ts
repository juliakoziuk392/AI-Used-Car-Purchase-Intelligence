import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';

/** Ключ GLB-моделі аналізу в бакеті. */
export const modelKey = (analysisId: string) => `models/${analysisId}.glb`;

export interface StoredObject {
  body: Readable;
  length?: number;
}

/**
 * Файли застосунку (3D-моделі) в S3-сумісному сховищі: локально — MinIO з docker-compose,
 * у продакшені — будь-яке S3 (AWS, Cloudflare R2, Backblaze B2 тощо). На відміну від диска
 * контейнера, переживає перезапуски й спільне для кількох інстансів API.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET', 'carintel-photos');
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      region: config.get<string>('S3_REGION', 'us-east-1'),
      // MinIO і більшість S3-сумісних сховищ потребують адрес виду endpoint/bucket/key.
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  /** Створюємо бакет, якщо його ще нема. Сховище недоступне — API все одно стартує: без S3 ламається лише 3D. */
  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) {
        this.logger.warn(`S3 недоступне, 3D-моделі не зберігатимуться: ${errorMessage(error)}`);
        return;
      }
      await this.client
        .send(new CreateBucketCommand({ Bucket: this.bucket }))
        .then(() => this.logger.log(`Створено бакет ${this.bucket}`))
        .catch((createError: unknown) =>
          this.logger.warn(`Не вдалося створити бакет ${this.bucket}: ${errorMessage(createError)}`),
        );
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Об'єкт або null, якщо такого ключа нема. */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: object.Body as Readable, length: object.ContentLength };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(keys: string[]) {
    if (!keys.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
