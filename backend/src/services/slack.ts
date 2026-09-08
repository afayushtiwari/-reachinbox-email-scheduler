import prisma from "./prisma";
import { config } from "../config";

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string };
}

interface SlackPostMessageResponse {
  ok: boolean;
  error?: string;
}

export function getSlackOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: "chat:write",
    state,
    redirect_uri: `${config.frontendUrl}/api/slack/callback`,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(code: string) {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: `${config.frontendUrl}/api/slack/callback`,
    }),
  });

  const data = (await response.json()) as SlackOAuthResponse;
  if (!data.ok) {
    throw new Error(data.error || "Slack OAuth failed");
  }
  if (!data.access_token) {
    throw new Error("Slack did not return an access token");
  }

  return {
    accessToken: data.access_token,
    teamId: data.team?.id,
    teamName: data.team?.name,
    userId: data.authed_user?.id,
  };
}

export async function saveSlackConnection(
  userId: string,
  tokenData: {
    accessToken: string;
    teamId?: string;
    teamName?: string;
    userId?: string;
  }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackAccessToken: tokenData.accessToken,
      slackTeamId: tokenData.teamId,
      slackTeamName: tokenData.teamName,
      slackUserId: tokenData.userId,
    },
  });
}

export async function sendSlackNotification(
  userId: string,
  message: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.slackAccessToken) {
    console.log(`Slack not connected for user ${userId}, skipping notification`);
    return false;
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.slackAccessToken}`,
      },
      body: JSON.stringify({
        channel: user.slackUserId || user.slackTeamId,
        text: message,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
        ],
      }),
    });

    const data = (await response.json()) as SlackPostMessageResponse;
    if (!data.ok) {
      console.error("Slack notification failed:", data.error);
      return false;
    }

    console.log(`Slack notification sent to user ${userId}`);
    return true;
  } catch (error: any) {
    console.error("Slack notification error:", error.message);
    return false;
  }
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackAccessToken: null,
      slackTeamId: null,
      slackTeamName: null,
      slackUserId: null,
      slackWebhookUrl: null,
    },
  });
}