"use client";

import { useEffect, useState } from "react";
import { getSlackStatus, connectSlack, disconnectSlack, slackCallback } from "@/lib/api";
import { SlackStatus } from "@/types";
import toast from "react-hot-toast";

export default function SlackPanel() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    getSlackStatus()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackCode = params.get("slack_code");
    if (slackCode) {
      slackCallback(slackCode)
        .then((data) => {
          toast.success(`Slack connected: ${data.teamName}`);
          getSlackStatus().then(setStatus);
        })
        .catch((err) => toast.error("Failed to connect Slack"));
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const { url } = await connectSlack();
      window.location.href = url;
    } catch (error: any) {
      toast.error("Failed to initiate Slack connection");
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await disconnectSlack();
      setStatus({ connected: false, teamName: null });
      toast.success("Slack disconnected");
    } catch (error: any) {
      toast.error("Failed to disconnect Slack");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-dark-600 rounded-xl p-6 border border-dark-400/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4A154B] rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.527 2.527 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium">Slack Notifications</h3>
            <p className="text-xs text-dark-200">
              {status?.connected
                ? `Connected to ${status.teamName}`
                : "Get notified when rate limits are hit"}
            </p>
          </div>
        </div>

        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
          >
            {actionLoading ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4A154B] hover:bg-[#611f69] text-white text-sm font-medium rounded-lg transition-colors"
          >
            {actionLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
              </svg>
            )}
            Connect Slack
          </button>
        )}
      </div>
    </div>
  );
}
