import nodemailer from 'nodemailer';
import { logger } from './utils/logger';

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { 
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS 
  } : undefined,
  tls: {
    rejectUnauthorized: false
  }
});

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  try {
    const from = process.env.SMTP_FROM || 'support@aveniaichat.com';
    
    const mailOptions = {
      from,
      to,
      subject: 'Avenia - Email Doğrulama Kodu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00c896;">Avenia Email Doğrulama</h2>
          <p>Merhaba,</p>
          <p>Hesabınızı doğrulamak için aşağıdaki kodu kullanın:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #00c896; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p>Bu kod 10 dakika geçerlidir.</p>
          <p>Eğer bu işlemi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Bu email Avenia uygulaması tarafından gönderilmiştir.</p>
        </div>
      `,
      text: `Avenia Email Doğrulama Kodu: ${code}\n\nBu kod 10 dakika geçerlidir.`
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Verification email sent to ${to}`);
  } catch (error) {
    logger.error('Failed to send verification email:', error);
    throw error;
  }
}



