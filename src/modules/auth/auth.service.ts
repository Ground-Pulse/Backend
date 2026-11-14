import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { NotificationChannel, Role, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdatePreferencesDto, UpdateProfileDto } from './dto/profile.dto';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { JwtPayload } from './jwt.strategy';
import { publicUser } from '../../common/views';
import { writeAudit } from '../../common/audit';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private notifications: NotificationService,
  ) {}

  /** Owners are active immediately; inspectors/providers wait for admin verification. */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw GroundPulseException.emailAlreadyExists('An account with this email already exists.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          role: dto.role,
          phone: dto.phone?.trim() || null,
          verified: dto.role === Role.OWNER,
        },
      });
      if (dto.role === Role.PROVIDER) {
        await tx.serviceProvider.create({
          data: {
            userId: created.id,
            serviceTypes: dto.serviceTypes?.length ? dto.serviceTypes : ['General Repairs'],
            locality: dto.locality?.trim() || 'Bengaluru',
            verified: false,
          },
        });
      }
      await writeAudit(tx, 'User', created.id, 'REGISTERED', created.id, { role: dto.role });
      return created;
    });

    if (user.role !== Role.OWNER) {
      await this.notifications.notifyAdmins(
        'ACCOUNT_VERIFIED',
        'New verification request',
        `${user.name} signed up as ${user.role.toLowerCase()}.`,
        '/admin/verification',
      );
      await this.notifications.dashboardChanged();
    }

    return { ...(await this.generateTokens(user)), user: publicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw GroundPulseException.invalidCredentials();
    }
    return { ...(await this.generateTokens(user)), user: publicUser(user) };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, { secret: this.secret() });
    } catch {
      throw GroundPulseException.unauthorized('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw GroundPulseException.unauthorized('Invalid refresh token');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw GroundPulseException.unauthorized('User not found');
    return { ...(await this.generateTokens(user)), user: publicUser(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw GroundPulseException.unauthorized('User not found');
    return publicUser(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
      },
    });
    return publicUser(user);
  }

  async getPreferences(userId: string) {
    const pref = await this.prisma.userPreference.findUnique({ where: { userId } });
    return { notificationChannel: pref?.notificationChannel ?? NotificationChannel.BOTH };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const pref = await this.prisma.userPreference.upsert({
      where: { userId },
      update: { notificationChannel: dto.notificationChannel },
      create: { userId, notificationChannel: dto.notificationChannel },
    });
    return { notificationChannel: pref.notificationChannel };
  }

  private secret() {
    return this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-key';
  }

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const base = { sub: user.id, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...base, type: 'access' } satisfies JwtPayload, {
        secret: this.secret(),
        expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '15m',
      }),
      this.jwtService.signAsync({ ...base, type: 'refresh' } satisfies JwtPayload, {
        secret: this.secret(),
        expiresIn: this.configService.get<string>('REFRESH_TOKEN_EXPIRATION') || '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
