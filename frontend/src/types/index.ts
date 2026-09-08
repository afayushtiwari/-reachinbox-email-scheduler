export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  slackTeamName?: string;
}

export interface EmailJob {
  id: string;
  userId: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "rate_limited";
  scheduledAt: string;
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ScheduleEmailRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  senderEmail?: string;
}

export interface ScheduleEmailResponse {
  message: string;
  campaignId: string;
  jobs: {
    id: string;
    recipientEmail: string;
    scheduledAt: string;
    bullmqJobId: string;
  }[];
  firstEmailAt: string;
  lastEmailAt: string;
}

export interface PaginatedResponse<T> {
  emails: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface EmailStats {
  scheduled: number;
  sent: number;
  failed: number;
  total: number;
}

export interface SearchResults {
  hits: EmailJob[];
  total: number;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
}
