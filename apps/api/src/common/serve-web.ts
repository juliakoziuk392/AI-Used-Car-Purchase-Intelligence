import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const API_PREFIX = /^\/api(?=[/?]|$)/;

/**
 * Продакшн одним сервісом (Render): API віддає ще й зібраний фронт з WEB_DIST_DIR.
 * Як Vite-проксі в розробці, запити на /api/* йдуть в API без префікса; решта GET — статика,
 * а невідомі шляхи — index.html, щоб працювали клієнтські маршрути (/listings/:id тощо).
 */
export function serveWeb(app: NestExpressApplication, distDir: string) {
  const indexHtml = join(distDir, 'index.html');
  app.useStaticAssets(distDir, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (API_PREFIX.test(req.url)) {
      req.url = '/' + req.url.replace(API_PREFIX, '').replace(/^\//, '');
      return next();
    }
    if (req.method === 'GET' || req.method === 'HEAD') return res.sendFile(indexHtml);
    next();
  });
}
