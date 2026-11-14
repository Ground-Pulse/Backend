import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProviderService } from './provider.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderController {
  constructor(private readonly providers: ProviderService) {}

  /** ?verified=true&locality=&serviceType= */
  @Get()
  @Roles(Role.ADMIN)
  list(@Query('verified') verified?: string, @Query('locality') locality?: string, @Query('serviceType') serviceType?: string) {
    return this.providers.list({ verified, locality, serviceType });
  }

  @Get('me')
  @Roles(Role.PROVIDER)
  me(@CurrentUser('id') userId: string) {
    return this.providers.me(userId);
  }
}
