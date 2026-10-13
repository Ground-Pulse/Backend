import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { Role, User } from '@prisma/client';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw GroundPulseException.emailAlreadyExists();
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
          phone: dto.phone,
        },
      });

      if (dto.role === Role.PROVIDER) {
        await tx.serviceProvider.create({
          data: {
            userId: createdUser.id,
            serviceTypes: ['General Maintenance'],
            locality: 'Bangalore',
            verified: false,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: 'USER',
          entityId: createdUser.id,
          action: 'REGISTERED',
          actorId: createdUser.id,
          metadata: { role: dto.role, email: dto.email },
        },
      });

      return createdUser;
    });

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { serviceProvider: true },
    });

    if (!user) {
      throw GroundPulseException.invalidCredentials();
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw GroundPulseException.invalidCredentials();
    }

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        serviceProvider: user.serviceProvider,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-key',
      });

      if (payload.type !== 'refresh') {
        throw GroundPulseException.unauthorized('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw GroundPulseException.unauthorized('User not found');
      }

      const tokens = await this.generateTokens(user);
      return {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      throw GroundPulseException.unauthorized('Invalid or expired refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        serviceProvider: true,
      },
    });

    if (!user) {
      throw GroundPulseException.unauthorized('User not found');
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-key';
    const accessExpiration = this.configService.get<string>('JWT_EXPIRATION') || '15m';
    const refreshExpiration = this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '7d';

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret,
        expiresIn: accessExpiration,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret,
        expiresIn: refreshExpiration,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
