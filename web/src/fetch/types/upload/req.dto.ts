export interface CreateUploadDto {
  kind: string;
}

export interface UploadResDto {
  url: string;
}

export interface UpdateUploadDto extends Partial<CreateUploadDto> {}
