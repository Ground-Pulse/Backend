import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProviderService } from './provider.service';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  async findAll(@Query('verified') verified?: string) {
    const verifiedOnly = verified === 'true';
    return this.providerService.findAll(verifiedOnly);
  }

  @Get('my-repairs')
  @Roles(Role.PROVIDER, Role.ADMIN)
  async getMyRepairs(@CurrentUser('id') userId: string) {
    return this.providerService.getMyRepairs(userId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.providerService.update(id, dto);
  }
}
