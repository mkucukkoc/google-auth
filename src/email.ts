import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const from = process.env.SMTP_FROM || 'no-reply@example.com';
  await transporter.sendMail({ from, to, subject: 'Your OTP Code', text: `Your verification code is ${code}` });
}



