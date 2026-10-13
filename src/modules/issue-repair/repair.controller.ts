import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IssueRepairService } from './issue-repair.service';
import {
  AssignProviderDto,
  UpdateRepairStatusDto,
  CompleteRepairDto,
} from './dto/repair-actions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, User } from '@prisma/client';

@Controller('repairs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepairController {
  constructor(private readonly issueRepairService: IssueRepairService) {}

  @Post(':id/assign')
  @Roles(Role.ADMIN)
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: AssignProviderDto,
  ) {
    return this.issueRepairService.assignProvider(id, user, dto);
  }

  @Patch(':id/status')
  @Roles(Role.PROVIDER, Role.ADMIN)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: UpdateRepairStatusDto,
  ) {
    return this.issueRepairService.updateRepairStatus(id, user, dto);
  }

  @Post(':id/complete')
  @Roles(Role.PROVIDER, Role.ADMIN)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: CompleteRepairDto,
  ) {
    return this.issueRepairService.completeRepair(id, user, dto);
  }
}
