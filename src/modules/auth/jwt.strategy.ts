import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type?: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret-jwt-key',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type && payload.type !== 'access') {
      throw GroundPulseException.unauthorized('Invalid token type for access');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { serviceProvider: true },
    });

    if (!user) {
      throw GroundPulseException.unauthorized('User no longer exists');
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
