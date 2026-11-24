import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PropertyModule } from './modules/property/property.module';
import { InspectionModule } from './modules/inspection/inspection.module';
import { IssueRepairModule } from './modules/issue-repair/issue-repair.module';
import { ProviderModule } from './modules/provider/provider.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';
import { MediaModule } from './modules/media/media.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HealthController, RootController } from './health.controller';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // Only the real .env. .env.example is a template: loading it as a
      // fallback leaked placeholder values (e.g. API_PUBLIC_URL=localhost)
      // into production, where Render provides the real settings.
      envFilePath: ['.env'],
    }),

    // Pino Logger
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
        },
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        // dashboards fire several queries per screen; auth routes have their own stricter limit
        limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 600),
      },
    ]),

    // BullMQ Queue System backed by Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        let host = 'localhost';
        let port = 6379;
        let password: string | undefined;
        let username: string | undefined;
        let tls: Record<string, never> | undefined;

        try {
          const parsed = new URL(redisUrl);
          host = parsed.hostname || 'localhost';
          port = parsed.port ? parseInt(parsed.port, 10) : 6379;
          if (parsed.username) username = decodeURIComponent(parsed.username);
          if (parsed.protocol === 'rediss:') tls = {};
          if (parsed.password) {
            password = decodeURIComponent(parsed.password);
          }
        } catch {
          // fallback to defaults
        }

        return {
          connection: {
            host,
            port,
            password,
            username,
            tls,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Core & Domain Modules
    PrismaModule,
    AuthModule,
    PropertyModule,
    InspectionModule,
    IssueRepairModule,
    ProviderModule,
    NotificationModule,
    AdminModule,
    MediaModule,
    JobsModule,
  ],
  controllers: [RootController, HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
