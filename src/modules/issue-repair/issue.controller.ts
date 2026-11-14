import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IssueRepairService } from './issue-repair.service';
import { FlagIssueDto, MessageDto, ReasonDto } from './dto/issue-repair.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/access';

@Controller('issues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssueController {
  constructor(private readonly service: IssueRepairService) {}

  /** ?propertyId=&status=FLAGGED,APPROVED (role-scoped) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('propertyId') propertyId?: string, @Query('status') status?: string) {
    return this.service.listIssues(user, { propertyId, status });
  }

  @Post()
  @Roles(Role.INSPECTOR)
  flag(@CurrentUser() user: AuthUser, @Body() dto: FlagIssueDto) {
    return this.service.flagIssue(user, dto);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.issueDetail(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(Role.OWNER)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(user, id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @Roles(Role.OWNER)
  decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: ReasonDto) {
    return this.service.decline(user, id, dto.reason);
  }

  @Get(':id/messages')
  messages(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.listMessages(user, id);
  }

  @Post(':id/messages')
  postMessage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: MessageDto) {
    return this.service.postMessage(user, id, dto.body);
  }
}
