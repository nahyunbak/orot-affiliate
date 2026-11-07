import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC } from '@/auth/decorator/rbac.decorator';
import { CommonResponse } from '@/common/dto/res.dto';
import { UploadResDto } from './dto/req.dto';
import { UserRole } from '@prisma/client';

@ApiTags('upload - Upload API')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @RBAC(UserRole.Normal)
  @UseInterceptors(FileInterceptor('file'))
  @Post('upload')
  @ApiOperation({
    summary: '파일 업로드',
    description:
      '* 1. 파일을 Cloudflare R2 스토리지에 업로드  * 2. 권한: System (내부 호출)  * 3. 로직 순서  *   - 파일 유효성 검증 (파일 존재 및 버퍼 확인)  *   - 파일명 한글 인코딩 처리  *   - S3 호환 API로 Cloudflare R2에 업로드  *   - UUID를 사용한 고유 경로 생성  *   - ACL을 public-read로 설정하여 공개 접근 가능  *   - Content-Disposition 헤더로 다운로드 시 파일명 설정  *   - 업로드 완료 후 공개 URL 생성 및 반환  * 4. generateSuccessResponse 형식으로 업로드된 파일 URL 반환  *',
  })
  @ApiResponse({ type: CommonResponse<UploadResDto> })
  uploadFile(
    @Query('kind') kind: string,
    @Query('name') name: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadFile(file, kind, name);
  }
}
