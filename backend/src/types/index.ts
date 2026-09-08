import { Request } from "express";

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ScheduleEmailBody {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  senderEmail?: string;
}

export interface EmailJobData {
  jobId: string;
  emailId: string;
  subject: string;
  body: string;
  recipientEmail: string;
  senderEmail: string;
  scheduledAt: string;
  userId: string;
  hourlyLimit?: number;
}

export interface SlackTokenData {
  accessToken: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  webhookUrl?: string;
}
