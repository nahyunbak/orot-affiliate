import { IsNotEmpty } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateUploadDto {
  @IsNotEmpty()
  kind: string;
}

export class UploadResDto {
  url: string;
}

export class UpdateUploadDto extends PartialType(CreateUploadDto) {}
