import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.example.com';
    const port = parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10);
    const user = this.configService.get<string>('SMTP_USER') || 'test';
    const pass = this.configService.get<string>('SMTP_PASS') || 'test';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async sendMail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    const from = this.configService.get<string>('EMAIL_FROM') || 'GroundPulse <notifications@groundpulse.com>';
    try {
      if (process.env.NODE_ENV === 'test' || this.configService.get('SMTP_HOST') === 'smtp.example.com') {
        this.logger.log(`[MOCK EMAIL] To: ${to} | Subject: "${subject}"`);
        return true;
      }

      await this.transporter.sendMail({
        from,
        to,
        subject,
        text: text || html.replace(/<[^>]*>?/gm, ''),
        html,
      });

      this.logger.log(`Email dispatched to ${to} with subject "${subject}"`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }
}
