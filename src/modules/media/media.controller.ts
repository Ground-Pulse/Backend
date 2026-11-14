import { Body, Controller, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { MediaService } from './media.service';
import { PresignDto } from './dto/presign.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  presign(@Body() dto: PresignDto, @CurrentUser('id') userId: string) {
    return this.media.presign(dto, userId);
  }

  /** Local driver only. Authorized by the HMAC signature in the URL, not a JWT. */
  @Put('upload/:key')
  @SkipThrottle()
  upload(@Param('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Req() req: Request) {
    return this.media.storeLocal(key, exp, sig, req.body as Buffer);
  }
}
