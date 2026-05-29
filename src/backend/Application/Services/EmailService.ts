import nodemailer from 'nodemailer';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Check multiple possible environment variable names for better compatibility
    const host = (
      process.env.SMTP_HOST || 
      process.env.MAIL_HOST || 
      process.env.EMAIL_HOST || 
      'smtp.gmail.com' // Default to Gmail as it's most common
    ).trim().replace(/^[a-z]*:?\/\//i, '');

    const port = Number(
      process.env.SMTP_PORT || 
      process.env.MAIL_PORT || 
      process.env.EMAIL_PORT || 
      587
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

    const secure = process.env.SMTP_SECURE === 'true' || process.env.MAIL_SECURE === 'true' || port === 465;

    // Mask password for logging
    const maskedPass = pass === 'mock-pass' ? 'mock-pass' : '*'.repeat(pass.length);
    console.log(`Initializing EmailService - Host: "${host}", Port: ${port}, User: "${user}", PassLength: ${pass.length}, Secure: ${secure}`);

    const config: any = {
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    };

    // Special handling for Gmail
    if (host.includes('gmail.com')) {
      config.service = 'gmail';
      // When using 'service', nodemailer handles host/port/secure automatically
      delete config.host;
      delete config.port;
      delete config.secure;
    }

    this.transporter = nodemailer.createTransport(config);
  }

  async sendOTP(email: string, otp: string) {
    const fromAddress = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.EMAIL_FROM || 'support@dugdhasetu.in';
    
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

    try {
      // Check if we have real credentials
      const isMock = 
        (!process.env.SMTP_USER && !process.env.MAIL_USER && !process.env.EMAIL_USER) || 
        (process.env.SMTP_USER === 'mock-user');

      if (isMock) {
        console.log('-----------------------------------------');
        console.log(`MOCK EMAIL SENT TO: ${email}`);
        console.log(`OTP: ${otp}`);
        console.log('-----------------------------------------');
        return;
      }
      await this.transporter.sendMail(mailOptions);
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      let errorMessage = 'Failed to send verification email.';

      if (error.message?.includes('535-5.7.8')) {
        errorMessage = 'Gmail Authentication Failed: You MUST use an "App Password" from Google. Please check server logs for instructions.';
        console.error('------------------------------------------------------------');
        console.error('GMAIL AUTHENTICATION FAILED!');
        console.error('Reason: Your username or password was rejected by Google.');
        console.error('Solution:');
        console.error('1. If you have 2-Step Verification enabled, you MUST use an "App Password".');
        console.error('2. Go to: https://myaccount.google.com/apppasswords');
        console.error('3. Generate a new password for "Mail" and "Other (DugdhaSetu)".');
        console.error('4. Copy the 16-character code and paste it into EMAIL_PASS in Secrets.');
        console.error('------------------------------------------------------------');
      }

      // In production (or when we want the user to see the specific fix), we throw the descriptive error
      throw new Error(errorMessage);
    }
  }
}

export const emailService = new EmailService();
