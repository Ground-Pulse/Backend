import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { MediaService } from './media.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign-upload')
  async presignUpload(
    @Body() dto: PresignUploadDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.mediaService.getPresignedUploadUrl(dto, userId);
  }
}
