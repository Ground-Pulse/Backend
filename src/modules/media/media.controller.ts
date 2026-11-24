import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
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

  /** db/local drivers. Authorized by the HMAC signature in the URL, not a JWT. */
  @Put('upload/:key')
  @SkipThrottle()
  upload(
    @Param('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Query('u') userId: string,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ) {
    return this.media.store(key, exp, sig, userId || '', contentType, req.body as Buffer);
  }

  /**
   * db driver: serves a stored file. Keys are unguessable (random UUID), so
   * like a CDN/S3 public URL, the link itself grants read access — this is
   * what lets <img src> show photos without sending a token.
   */
  @Get('file/:key')
  @SkipThrottle()
  async file(@Param('key') key: string, @Res() res: Response) {
    const file = await this.media.getFile(key);
    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.data.length),
      // a key never changes content, so browsers/CDNs may cache it for good
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(Buffer.from(file.data));
  }
}
