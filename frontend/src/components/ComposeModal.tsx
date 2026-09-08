"use client";

import { useState, useRef, useCallback } from "react";
import { scheduleEmails } from "@/lib/api";
import toast from "react-hot-toast";

interface ComposeModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ComposeModal({ onClose, onSuccess }: ComposeModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [csvInput, setCsvInput] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delayBetweenEmails, setDelayBetweenEmails] = useState(5);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseEmails = useCallback((text: string): string[] => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    return Array.from(new Set(matches));
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const emails = parseEmails(text);
        setRecipients(emails);
        setCsvInput(text);
        toast.success(`Found ${emails.length} email addresses`);
      };
      reader.readAsText(file);
    },
    [parseEmails]
  );

  const handleTextInput = useCallback(
    (text: string) => {
      setCsvInput(text);
      const emails = parseEmails(text);
      setRecipients(emails);
    },
    [parseEmails]
  );

  const handleSubmit = async () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!body.trim()) {
      toast.error("Email body is required");
      return;
    }
    if (recipients.length === 0) {
      toast.error("At least one recipient is required");
      return;
    }
    if (!startTime) {
      toast.error("Start time is required");
      return;
    }

    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime())) {
      toast.error("Invalid start time");
      return;
    }
    if (startDate.getTime() < Date.now()) {
      toast.error("Start time must be in the future");
      return;
    }

    setLoading(true);
    try {
      const result = await scheduleEmails({
        subject,
        body,
        recipients,
        startTime: startDate.toISOString(),
        delayBetweenEmails,
        hourlyLimit,
        senderEmail: senderEmail || undefined,
      });

      toast.success(result.message);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to schedule emails");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-600 rounded-2xl shadow-2xl border border-dark-400/30 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-dark-400/30">
          <h2 className="text-lg font-semibold text-white">Compose New Email</h2>
          <button
            onClick={onClose}
            className="text-dark-100 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-dark-100 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
              className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-100 mb-2">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email body here... HTML is supported."
              rows={6}
              className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-100 mb-2">
              Recipients ({recipients.length} emails detected)
            </label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-dark-500 border border-dark-400/30 rounded-lg text-sm text-dark-100 hover:bg-dark-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload CSV/TXT
                </button>
                <span className="text-xs text-dark-300 self-center">or paste emails below</span>
              </div>
              <textarea
                value={csvInput}
                onChange={(e) => handleTextInput(e.target.value)}
                placeholder="Paste email addresses here (comma or newline separated)"
                rows={3}
                className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none font-mono text-xs"
              />
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {recipients.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-600/20 text-primary-300 rounded text-xs"
                    >
                      {email}
                      <button
                        onClick={() => setRecipients(recipients.filter((e) => e !== email))}
                        className="hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-100 mb-2">Sender Email (optional)</label>
            <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="Leave empty to use your account email"
              className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-2">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-2">
                Delay (seconds)
              </label>
              <input
                type="number"
                value={delayBetweenEmails}
                onChange={(e) => setDelayBetweenEmails(parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-2">
                Hourly Limit
              </label>
              <input
                type="number"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-4 py-2.5 bg-dark-500 border border-dark-400/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-dark-400/30">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-dark-100 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Schedule
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
