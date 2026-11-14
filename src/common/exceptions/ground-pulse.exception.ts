import { HttpException, HttpStatus } from '@nestjs/common';

export class GroundPulseException extends HttpException {
  public readonly code: string;

  constructor(statusCode: HttpStatus, code: string, message: string) {
    super({ statusCode, code, message }, statusCode);
    this.code = code;
  } 

  static propertyNotFound(message = 'Property not found'): GroundPulseException {
    return new GroundPulseException(HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND', message);
  }

  static forbiddenNotOwner(message = 'You are not authorized to access or modify this property'): GroundPulseException {
    return new GroundPulseException(HttpStatus.FORBIDDEN, 'FORBIDDEN_NOT_OWNER', message);
  }

  static inspectionNotFound(message = 'Inspection not found'): GroundPulseException {
    return new GroundPulseException(HttpStatus.NOT_FOUND, 'INSPECTION_NOT_FOUND', message);
  }

  static pastDateNotAllowed(message = 'Scheduled date must be in the future'): GroundPulseException {
    return new GroundPulseException(HttpStatus.BAD_REQUEST, 'PAST_DATE_NOT_ALLOWED', message);
  }

  static checklistIncomplete(message = 'All checklist items must have a status before submitting'): GroundPulseException {
    return new GroundPulseException(HttpStatus.BAD_REQUEST, 'CHECKLIST_INCOMPLETE', message);
  }

  static inspectionAlreadySubmitted(message = 'Inspection has already been submitted'): GroundPulseException {
    return new GroundPulseException(HttpStatus.CONFLICT, 'INSPECTION_ALREADY_SUBMITTED', message);
  }

  static issueMediaRequired(message = 'At least one photo or media proof is required when flagging an issue'): GroundPulseException {
    return new GroundPulseException(HttpStatus.BAD_REQUEST, 'ISSUE_MEDIA_REQUIRED', message);
  }

  static issueAlreadyDecided(message = 'This issue has already been approved or declined'): GroundPulseException {
    return new GroundPulseException(HttpStatus.CONFLICT, 'ISSUE_ALREADY_DECIDED', message);
  }

  static issueNotFound(message = 'Issue not found'): GroundPulseException {
    return new GroundPulseException(HttpStatus.NOT_FOUND, 'ISSUE_NOT_FOUND', message);
  }

  static repairNotFound(message = 'Repair record not found'): GroundPulseException {
    return new GroundPulseException(HttpStatus.NOT_FOUND, 'REPAIR_NOT_FOUND', message);
  }

  static providerNotVerified(message = 'Cannot assign unverified service provider'): GroundPulseException {
    return new GroundPulseException(HttpStatus.FORBIDDEN, 'PROVIDER_NOT_VERIFIED', message);
  }

  static repairInvalidTransition(message = 'Invalid repair status transition'): GroundPulseException {
    return new GroundPulseException(HttpStatus.CONFLICT, 'REPAIR_INVALID_TRANSITION', message);
  }

  static emailAlreadyExists(message = 'A user with this email address already exists'): GroundPulseException {
    return new GroundPulseException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', message);
  }

  static invalidCredentials(message = 'Invalid email or password'): GroundPulseException {
    return new GroundPulseException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', message);
  }

  static notFound(message = 'Not found'): GroundPulseException {
    return new GroundPulseException(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }

  static forbidden(message = "You don't have permission to do that."): GroundPulseException {
    return new GroundPulseException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
  }

  static validation(message: string): GroundPulseException {
    return new GroundPulseException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message);
  }

  static conflict(code: string, message: string): GroundPulseException {
    return new GroundPulseException(HttpStatus.CONFLICT, code, message);
  }

  static inspectorNotVerified(message = 'Only verified inspectors can be assigned'): GroundPulseException {
    return new GroundPulseException(HttpStatus.FORBIDDEN, 'INSPECTOR_NOT_VERIFIED', message);
  }

  static completionNoteRequired(message = 'Add a confirmation note before marking this job complete.'): GroundPulseException {
    return new GroundPulseException(HttpStatus.BAD_REQUEST, 'COMPLETION_NOTE_REQUIRED', message);
  }

  static unauthorized(message = 'Unauthorized'): GroundPulseException {
    return new GroundPulseException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
  }
}
