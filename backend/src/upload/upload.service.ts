import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import AWS from 'aws-sdk';
import { envVariableKeys } from '@/common/constants/env';
import { ERROR_MESSAGE } from '@/common/constants/errorMessage';
import { INTERNAL_ERROR_MESSAGE } from '@/common/constants/internalErrorMessage';
import { SUCCESS_MESSAGE } from '@/common/constants/successMessage';
import { CommonResponse } from '@/common/dto/res.dto';
import {
  generateErrorResponse,
  generateSuccessResponse,
} from '@/common/helper/format';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { UploadResDto } from './dto/req.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly MAX_FILE_SIZE = 200 * 1024 * 1024;

  constructor(private configService: ConfigService) {}

  private buildPublicUrl(key: string): string {
    const baseUrl = this.configService
      .get<string>(envVariableKeys.CLOUDFLARE_R2_DOMAIN)
      ?.trim()
      ?.replace(/\/+$/, '');

    if (!baseUrl) {
      throw new Error(ERROR_MESSAGE.UPLOAD.FAILED);
    }

    return `${baseUrl}/${key}`;
  }

  // Role: System

  /**
   * @description
   * 1. 한글 파일명 Base64 인코딩 헬퍼 메서드
   * 2. 권한: System (내부 호출)
   * 3. 로직 순서
   *   - UTF-8 텍스트를 Buffer로 변환
   *   - Base64 문자열로 인코딩하여 반환
   * 4. string 형식으로 인코딩된 텍스트 반환
   */
  private encodeKorean(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
  }

  /**
   * @summary 파일 업로드
   * @description
   * 1. 파일을 Cloudflare R2 스토리지에 업로드
   * 2. 권한: System (내부 호출)
   * 3. 로직 순서
   *   - 파일 유효성 검증 (파일 존재 및 버퍼 확인)
   *   - 파일명 한글 인코딩 처리
   *   - S3 호환 API로 Cloudflare R2에 업로드
   *   - UUID를 사용한 고유 경로 생성
   *   - ACL을 public-read로 설정하여 공개 접근 가능
   *   - Content-Disposition 헤더로 다운로드 시 파일명 설정
   *   - 업로드 완료 후 공개 URL 생성 및 반환
   * 4. generateSuccessResponse 형식으로 업로드된 파일 URL 반환
   * @access Normal
   * @route POST /upload
   * @query kind:string, name:string
   * @file file
   * @response CommonResponse<UploadResDto>
   */
  async uploadFile(
    file: Express.Multer.File,
    kind: string,
    name: string,
  ): Promise<CommonResponse<UploadResDto>> {
    if (!file || !file.buffer) {
      return generateErrorResponse(ERROR_MESSAGE.UPLOAD.INVALID_FILE);
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return generateErrorResponse(ERROR_MESSAGE.UPLOAD.FILE_TOO_LARGE);
    }

    if (
      ![
        envVariableKeys.AWS_ENDPOINT,
        envVariableKeys.AWS_ACCESS_KEY_ID,
        envVariableKeys.AWS_SECRET_ACCESS_KEY,
        envVariableKeys.AWS_BUCKET_NAME,
        envVariableKeys.CLOUDFLARE_R2_DOMAIN,
      ].every((key) => this.configService.get<string>(key)?.trim())
    ) {
      throw new ServiceUnavailableException('Upload storage is not configured');
    }
    try {
      // 파일명 인코딩
      const encodedFilename = this.encodeKorean(name);

      const params = {
        Bucket: this.configService.get<string>(envVariableKeys.AWS_BUCKET_NAME),
        Key: `${kind}/${uuidv4()}/${encodedFilename}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
        ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      };

      const storage = new AWS.S3({
        endpoint: this.configService.get<string>(envVariableKeys.AWS_ENDPOINT),
        accessKeyId: this.configService.get<string>(
          envVariableKeys.AWS_ACCESS_KEY_ID,
        ),
        secretAccessKey: this.configService.get<string>(
          envVariableKeys.AWS_SECRET_ACCESS_KEY,
        ),
        signatureVersion: 'v4',
      });
      const result = await storage.upload(params).promise();

      // 디코딩된 파일명 로깅

      const publicUrl = this.buildPublicUrl(result.Key);

      return generateSuccessResponse(
        { url: publicUrl },
        SUCCESS_MESSAGE.UPLOAD.FILE_UPLOADED,
      );
    } catch (error) {
      this.logger.error(
        INTERNAL_ERROR_MESSAGE.UPLOAD.FILE_UPLOAD_FAILED,
        error,
        {
          kind,
          name,
          mimetype: file.mimetype,
          size: file.size,
        },
      );
      return generateErrorResponse(ERROR_MESSAGE.UPLOAD.FAILED);
    }
  }
}
