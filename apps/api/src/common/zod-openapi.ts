import { ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Опис тіла запиту в Swagger з тієї самої zod-схеми, якою його валідує ZodValidationPipe. */
export function ApiZodBody(schema: ZodTypeAny) {
  // zod-to-json-schema типізований під власну копію zod — у рантаймі схема та сама, тож лише приводимо тип.
  const jsonSchema: unknown = zodToJsonSchema(schema as never, { target: 'openApi3', $refStrategy: 'none' });
  return ApiBody({ schema: jsonSchema as SchemaObject });
}
