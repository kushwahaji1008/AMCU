import nodemailer from 'nodemailer';

const PLACEHOLDER_USERS = new Set(['', 'mock-user', 'your-email@gmail.com']);
const PLACEHOLDER_PASSES = new Set(['', 'mock-pass', 'your-app-password']);

export class EmailService {
  private getConfig() {
    const host = (
      process.env.SMTP_HOST ||
      process.env.MAIL_HOST ||
      process.env.EMAIL_HOST ||
      'smtp.gmail.com'
    )
      .trim()
      .replace(/^[a-z]*:?\/\//i, '');

    const port = Number(
      process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT || 587
    );

    const user = (
      process.env.SMTP_USER ||
      process.env.MAIL_USER ||
      process.env.MAIL_USERNAME ||
      process.env.EMAIL_USER ||
      'mock-user'
    ).trim();

    const pass = (
      process.env.SMTP_PASS ||
      process.env.MAIL_PASS ||
      process.env.MAIL_PASSWORD ||
      process.env.EMAIL_PASS ||
      'mock-pass'
    ).trim();

    const secure =
      process.env.SMTP_SECURE === 'true' || process.env.MAIL_SECURE === 'true' || port === 465;

    return { host, port, user, pass, secure };
  }

  private createTransporter() {
    const { host, port, user, pass, secure } = this.getConfig();
    const config: any = {
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    };

    if (host.includes('gmail.com')) {
      config.service = 'gmail';
    } else {
      config.host = host;
      config.port = port;
      config.secure = secure;
    }

    return { transporter: nodemailer.createTransport(config), user, pass };
  }

  async sendOTP(email: string, otp: string) {
    const fromAddress =
      process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.EMAIL_FROM || 'support@dugdhasetu.in';

    const mailOptions = {
      from: `"DugdhaSetu Support" <${fromAddress}>`,
      to: email,
      subject: 'Your OTP for DugdhaSetu',
      text: `Your OTP for verification is: ${otp}. It will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #2c3e50;">DugdhaSetu Verification</h2>
          <p>Hello,</p>
          <p>Your OTP for verification is:</p>
          <div style="font-size: 24px; font-weight: bold; color: #3498db; padding: 10px; background: #f9f9f9; display: inline-block; border-radius: 5px;">
            ${otp}
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #7f8c8d;">© 2026 DugdhaSetu. All rights reserved.</p>
        </div>
      `,
    };

    const { transporter, user, pass } = this.createTransporter();
    const isMock = PLACEHOLDER_USERS.has(user) || PLACEHOLDER_PASSES.has(pass);

    if (isMock) {
      console.log(`[EmailService] Mock mode active. OTP email suppressed for recipient.`);
      return;
    }

    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await transporter.sendMail(mailOptions);
        return;
      } catch (error: any) {
        lastError = error;
        // Do not retry authentication failures
        if (error.message?.includes('535-5.7.8') || error.responseCode === 535) {
          break;
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    console.error('Error sending email:', lastError?.message || lastError);
    let errorMessage = 'Failed to send verification email.';
    if (lastError?.message?.includes('535-5.7.8')) {
      errorMessage =
        'Gmail Authentication Failed: You MUST use an "App Password" from Google. Please check server logs for instructions.';
    }
    throw new Error(errorMessage);
  }
}

export const emailService = new EmailService();
