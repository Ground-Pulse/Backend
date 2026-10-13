import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InspectionService } from './inspection.service';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { BatchUpdateChecklistDto } from './dto/update-checklist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, User } from '@prisma/client';

@Controller('inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionController {
  constructor(private readonly inspectionService: InspectionService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  async schedule(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: ScheduleInspectionDto,
  ) {
    return this.inspectionService.schedule(user, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Query('role') roleQuery?: string,
  ) {
    return this.inspectionService.findAll(user, roleQuery);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.inspectionService.findOne(id, user);
  }

  @Patch(':id/checklist')
  @Roles(Role.INSPECTOR, Role.ADMIN)
  async updateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: BatchUpdateChecklistDto,
  ) {
    return this.inspectionService.updateChecklist(id, user, dto);
  }

  @Post(':id/submit')
  @Roles(Role.INSPECTOR, Role.ADMIN)
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.inspectionService.submit(id, user);
  }
}
