import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IssueRepairService } from './issue-repair.service';
import { AssignProviderDto, CompleteRepairDto, RateRepairDto, ReasonDto, RepairStatusDto } from './dto/issue-repair.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/access';

@Controller('repairs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepairController {
  constructor(private readonly service: IssueRepairService) {}

  /** ?status=REQUESTED,ASSIGNED (owner → own, provider → own jobs, admin → all) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.listRepairs(user, status);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  assign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: AssignProviderDto) {
    return this.service.assign(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.PROVIDER, Role.ADMIN)
  status(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: RepairStatusDto) {
    return this.service.updateStatus(user, id, dto);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @Roles(Role.PROVIDER)
  decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: ReasonDto) {
    return this.service.declineJob(user, id, dto.reason);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(Role.PROVIDER)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: CompleteRepairDto) {
    return this.service.complete(user, id, dto);
  }

  @Post(':id/rate')
  @HttpCode(200)
  @Roles(Role.OWNER)
  rate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: RateRepairDto) {
    return this.service.rate(user, id, dto.rating);
  }
}
