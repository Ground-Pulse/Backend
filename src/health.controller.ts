import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';

/** Liveness/readiness probe for Render (healthCheckPath: /health). */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

/** Friendly reply for anyone opening the bare API address in a browser. */
@Controller()
@SkipThrottle()
export class RootController {
  @Get()
  info() {
    return {
      name: 'GroundPulse API',
      status: 'running',
      app: process.env.APP_URL || 'https://groundpulse-web.vercel.app',
      health: '/health',
      message: 'This is the backend API. Open the app link to use GroundPulse.',
    };
  }
}
