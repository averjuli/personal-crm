import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

// Created on the first email, not on import: the image build and `next build`
// have no mail settings
let transport: Transporter | undefined;

// Where the email goes is decided by SMTP_URL alone: Mailpit on this computer
// and in the tests, Resend on the server
export async function sendMail(message: MailMessage) {
  transport ??= nodemailer.createTransport(requiredEnv("SMTP_URL"));
  await transport.sendMail({ from: requiredEnv("MAIL_FROM"), ...message });
}
