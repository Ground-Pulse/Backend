import { IsNotEmpty, IsString } from 'class-validator';

export class DeclineIssueDto {
  @IsString()
  @IsNotEmpty({ message: 'decisionReason is required when declining an issue' })
  decisionReason!: string;
}
