import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PropertyService } from './property.service';
import { CreateDocumentDto, CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/access';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertyController {
  constructor(private readonly properties: PropertyService) {}

  @Get('properties')
  findAll(@CurrentUser() user: AuthUser) {
    return this.properties.findAll(user);
  }

  @Post('properties')
  @Roles(Role.OWNER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePropertyDto) {
    return this.properties.create(user, dto);
  }

  @Get('properties/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.properties.findOne(id, user);
  }

  @Patch('properties/:id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdatePropertyDto) {
    return this.properties.update(id, user, dto);
  }

  @Post('properties/:id/archive')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.ADMIN)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.properties.archive(id, user);
  }

  @Get('properties/:id/health-history')
  healthHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.properties.healthHistory(id, user);
  }

  @Get('properties/:id/documents')
  documents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.properties.listDocuments(id, user);
  }

  @Post('properties/:id/documents')
  @Roles(Role.OWNER)
  addDocument(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateDocumentDto) {
    return this.properties.addDocument(id, user, dto);
  }

  @Delete('documents/:id')
  @Roles(Role.OWNER)
  deleteDocument(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.properties.deleteDocument(id, user);
  }
}
