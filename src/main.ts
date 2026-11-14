import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, raw } from 'express';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // Raw bodies for local media uploads (PUT /media/upload/:key), JSON everywhere else
  app.use('/media/upload', raw({ type: () => true, limit: '26mb' }));
  app.use(json({ limit: '2mb' }));

  // Local media driver: uploaded files are served from /uploads
  app.useStaticAssets(path.resolve(process.env.UPLOAD_DIR || 'uploads'), { prefix: '/uploads/', maxAge: '7d' });

  // Use Pino Logger
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // the frontend (another origin) must be able to display uploaded photos
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS Configuration
  const allowedOrigins = (configService.get<string>('ALLOWED_ORIGINS') || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, server-to-server)
      // no origin = curl / server-to-server; otherwise only the configured frontends
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Standardized GroundPulse Error Handling
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);
  console.log(`🚀 GroundPulse Backend API is running on: http://localhost:${port}`);
}

bootstrap();
