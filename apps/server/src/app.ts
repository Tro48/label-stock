import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import { ERROR_CODES, type ErrorResponse } from '@label-stock/shared';
import { createDatabase } from './db/client';
import { registerErrorHandler } from './shared/error-handler';
import { CounterpartiesRepository } from './modules/counterparties/counterparties.repository';
import { CounterpartiesService } from './modules/counterparties/counterparties.service';
import { counterpartiesRoutes } from './modules/counterparties/counterparties.routes';
import { LabelsRepository } from './modules/labels/labels.repository';
import { LabelsService } from './modules/labels/labels.service';
import { labelsRoutes } from './modules/labels/labels.routes';
import { MovementsService } from './modules/movements/movements.service';
import { movementsRoutes } from './modules/movements/movements.routes';
import { exportRoutes } from './modules/export/export.routes';
import { healthRoutes } from './modules/health/health.routes';

export interface AppOptions {
  pool: pg.Pool;
  logger: FastifyServerOptions['logger'];
  rateLimitMaxPerMinute: number;
  staticDir?: string | undefined;
}

// Строка подключения и токены не должны попасть в лог ни при каких обстоятельствах.
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'databaseUrl',
  'connectionString',
  '*.databaseUrl',
  '*.connectionString',
  '*.password',
];

export async function buildApp({
  pool,
  logger,
  rateLimitMaxPerMinute,
  staticDir,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    // По умолчанию роутер режет параметры длиннее 100 символов ответом 414 в своём формате,
    // а штрихкод в /by-barcode/:code допускается до 256 символов сырого ввода.
    routerOptions: { maxParamLength: 300 },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, {
    // Приложение работает по HTTP внутри локальной сети: принудительный HTTPS сломает загрузку.
    hsts: false,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
  await app.register(rateLimit, { max: rateLimitMaxPerMinute, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: { info: { title: 'Учёт остатков этикетки', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  const db = createDatabase(pool);
  const api = {
    labels: new LabelsService(db),
    counterparties: new CounterpartiesService(new CounterpartiesRepository(db)),
    movements: new MovementsService(db),
  };

  await app.register(
    async (scope) => {
      await scope.register(labelsRoutes(api.labels));
      await scope.register(movementsRoutes(api.movements));
      await scope.register(counterpartiesRoutes(api.counterparties));
      await scope.register(exportRoutes(new LabelsRepository(db)));
      await scope.register(healthRoutes(pool));
    },
    { prefix: '/api' },
  );

  if (staticDir) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    // Клиентские маршруты SPA отдаются через index.html, неизвестные /api/* — JSON 404.
    if (staticDir && request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply
      .status(404)
      .send({ code: ERROR_CODES.notFound, message: 'Маршрут не найден' } satisfies ErrorResponse);
  });

  return app;
}
