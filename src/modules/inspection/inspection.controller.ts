import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { InspectionFilters, InspectionService } from './inspection.service';
import { SaveChecklistDraftDto, ScheduleInspectionDto } from './dto/inspection.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/access';

@Controller('inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  /** ?propertyId=&status=SCHEDULED,IN_PROGRESS&unassigned=true (role-scoped) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: InspectionFilters) {
    return this.inspections.list(user, { propertyId: q.propertyId, status: q.status, unassigned: q.unassigned });
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  schedule(@CurrentUser() user: AuthUser, @Body() dto: ScheduleInspectionDto) {
    return this.inspections.schedule(user, dto);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.inspections.detail(user, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Roles(Role.INSPECTOR)
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.inspections.start(user, id);
  }

  @Patch(':id/checklist')
  @Roles(Role.INSPECTOR)
  saveDraft(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: SaveChecklistDraftDto) {
    return this.inspections.saveDraft(user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(Role.INSPECTOR)
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.inspections.submit(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.ADMIN)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.inspections.cancel(user, id);
  }
}
