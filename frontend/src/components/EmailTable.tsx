"use client";

import { EmailJob } from "@/types";

interface EmailTableProps {
  emails: EmailJob[];
  type: "scheduled" | "sent";
  onCancel?: (id: string) => void;
  loading?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    sending: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    sent: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    rate_limited: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.scheduled}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function EmailTable({ emails, type, onCancel, loading }: EmailTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="w-16 h-16 bg-dark-500 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-dark-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {type === "scheduled" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            )}
          </svg>
        </div>
        <p className="text-dark-100 font-medium">
          No {type === "scheduled" ? "scheduled" : "sent"} emails yet
        </p>
        <p className="text-dark-300 text-sm mt-1">
          {type === "scheduled"
            ? "Schedule your first email campaign to get started"
            : "Sent emails will appear here after they are processed"}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-400/30">
            <th className="text-left py-3 px-4 text-xs font-medium text-dark-200 uppercase tracking-wider">
              Recipient
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-dark-200 uppercase tracking-wider">
              Subject
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-dark-200 uppercase tracking-wider">
              {type === "scheduled" ? "Scheduled For" : "Sent At"}
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-dark-200 uppercase tracking-wider">
              Status
            </th>
            {type === "scheduled" && (
              <th className="text-right py-3 px-4 text-xs font-medium text-dark-200 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-400/20">
          {emails.map((email) => (
            <tr
              key={email.id}
              className="hover:bg-dark-500/30 transition-colors"
            >
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-600/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-primary-400">
                      {email.recipientEmail.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-white truncate max-w-[200px]">
                    {email.recipientEmail}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4">
                <span className="text-sm text-dark-100 truncate max-w-[200px] block">
                  {email.subject}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="text-sm text-dark-200">
                  {new Date(type === "scheduled" ? email.scheduledAt : email.sentAt || email.createdAt).toLocaleString()}
                </span>
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={email.status} />
              </td>
              {type === "scheduled" && (
                <td className="py-3 px-4 text-right">
                  {onCancel && (email.status === "scheduled" || email.status === "rate_limited") && (
                    <button
                      onClick={() => onCancel(email.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
