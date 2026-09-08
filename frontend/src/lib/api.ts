import {
  User,
  EmailJob,
  ScheduleEmailRequest,
  ScheduleEmailResponse,
  PaginatedResponse,
  QueueStats,
  EmailStats,
  SearchResults,
  SlackStatus,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  } else {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("auth_token");
  }
  return authToken;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function googleLogin(idToken: string): Promise<{ token: string; user: User }> {
  const data = await apiFetch<{ token: string; user: User }>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
  setAuthToken(data.token);
  return data;
}

export async function devLogin(
  email?: string,
  name?: string
): Promise<{ token: string; user: User; devMode: boolean }> {
  const data = await apiFetch<{ token: string; user: User; devMode: boolean }>(
    "/api/auth/dev-login",
    {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }
  );
  setAuthToken(data.token);
  return data;
}

export async function getMe(): Promise<{ user: User }> {
  return apiFetch<{ user: User }>("/api/auth/me");
}

export async function scheduleEmails(
  request: ScheduleEmailRequest
): Promise<ScheduleEmailResponse> {
  return apiFetch<ScheduleEmailResponse>("/api/emails/schedule", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getScheduledEmails(
  page: number = 1,
  limit: number = 50
): Promise<PaginatedResponse<EmailJob>> {
  return apiFetch<PaginatedResponse<EmailJob>>(
    `/api/emails/scheduled?page=${page}&limit=${limit}`
  );
}

export async function getSentEmails(
  page: number = 1,
  limit: number = 50
): Promise<PaginatedResponse<EmailJob>> {
  return apiFetch<PaginatedResponse<EmailJob>>(
    `/api/emails/sent?page=${page}&limit=${limit}`
  );
}

export async function searchEmails(
  query: string,
  page: number = 1
): Promise<SearchResults> {
  return apiFetch<SearchResults>(
    `/api/emails/search?q=${encodeURIComponent(query)}&page=${page}`
  );
}

export async function cancelEmail(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/emails/${id}`, {
    method: "DELETE",
  });
}

export async function getEmailStats(): Promise<EmailStats> {
  return apiFetch<EmailStats>("/api/emails/stats");
}

export async function getQueueStats(): Promise<QueueStats> {
  return apiFetch<QueueStats>("/api/queue/stats");
}

export async function getSlackStatus(): Promise<SlackStatus> {
  return apiFetch<SlackStatus>("/api/slack/status");
}

export async function connectSlack(): Promise<{ url: string; state: string }> {
  return apiFetch<{ url: string; state: string }>("/api/slack/connect");
}

export async function slackCallback(
  code: string
): Promise<{ message: string; teamName: string }> {
  return apiFetch<{ message: string; teamName: string }>("/api/slack/callback", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function disconnectSlack(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/slack/disconnect", {
    method: "DELETE",
  });
}
