import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { GroundPulseException } from '../exceptions/ground-pulse.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected server error occurred';

    if (exception instanceof GroundPulseException) {
      statusCode = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, any>;
        code = errorObj.code || exception.name.replace('Exception', '').toUpperCase();
        if (Array.isArray(errorObj.message)) {
          message = errorObj.message.join('; ');
          code = 'VALIDATION_ERROR';
        } else if (typeof errorObj.message === 'string') {
          message = errorObj.message;
        } else {
          message = exception.message;
        }
      } else if (typeof res === 'string') {
        message = res;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
    });
  }
}
