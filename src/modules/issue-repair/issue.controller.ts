import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IssueRepairService } from './issue-repair.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { DeclineIssueDto } from './dto/decline-issue.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, User } from '@prisma/client';

@Controller('issues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssueController {
  constructor(private readonly issueRepairService: IssueRepairService) {}

  @Post()
  @Roles(Role.INSPECTOR, Role.ADMIN)
  async create(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: CreateIssueDto,
  ) {
    return this.issueRepairService.createIssue(user, dto);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.issueRepairService.getIssue(id, user);
  }

  @Post(':id/approve')
  @Roles(Role.OWNER, Role.ADMIN)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.issueRepairService.approveIssue(id, user);
  }

  @Post(':id/decline')
  @Roles(Role.OWNER, Role.ADMIN)
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: DeclineIssueDto,
  ) {
    return this.issueRepairService.declineIssue(id, user, dto);
  }
}
