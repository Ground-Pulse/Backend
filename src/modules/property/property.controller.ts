import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get()
  async findAll(@CurrentUser() user: Omit<User, 'passwordHash'>) {
    return this.propertyService.findAll(user);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  async create(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertyService.create(user, dto);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.propertyService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertyService.update(id, user, dto);
  }
}
