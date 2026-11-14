import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { ReassignDto, SaveTemplateDto, VerificationDecisionDto } from './dto/admin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/access';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('admin/dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Post('admin/reassign')
  @HttpCode(200)
  reassign(@CurrentUser() user: AuthUser, @Body() dto: ReassignDto) {
    return this.admin.reassign(user, dto);
  }

  @Get('admin/verification')
  verificationQueue() {
    return this.admin.verificationQueue();
  }

  @Post('admin/verification/:userId/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.approveVerification(user, userId);
  }

  @Post('admin/verification/:userId/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: VerificationDecisionDto) {
    return this.admin.rejectVerification(user, userId, dto.reason);
  }

  @Get('admin/audit-logs')
  audit(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.admin.auditLogs({ entityType, entityId });
  }

  @Get('inspectors')
  inspectors(@Query('verified') verified?: string) {
    return this.admin.inspectors(verified === 'true');
  }

  @Get('templates')
  templates() {
    return this.admin.templates();
  }

  @Put('templates/:id')
  saveTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveTemplateDto) {
    return this.admin.saveTemplate(id, dto);
  }
}
