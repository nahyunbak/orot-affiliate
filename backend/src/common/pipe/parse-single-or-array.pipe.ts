import {
  ArgumentMetadata,
  ParseArrayPipe,
  PipeTransform,
} from '@nestjs/common';

type ParseSingleOrArrayPipeOptions = ConstructorParameters<
  typeof ParseArrayPipe
>[0];

export class ParseSingleOrArrayPipe implements PipeTransform {
  private readonly parseArrayPipe: ParseArrayPipe;

  constructor(options: ParseSingleOrArrayPipeOptions = {}) {
    this.parseArrayPipe = new ParseArrayPipe(options);
  }

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (value === undefined || value === null) {
      return this.parseArrayPipe.transform(value, metadata);
    }

    return this.parseArrayPipe.transform(
      Array.isArray(value) ? value : [value],
      metadata,
    );
  }
}
