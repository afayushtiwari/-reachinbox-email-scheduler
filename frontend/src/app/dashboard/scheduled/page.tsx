"use client";

import { useEffect, useState, useCallback } from "react";
import { getScheduledEmails, cancelEmail, searchEmails } from "@/lib/api";
import { EmailJob } from "@/types";
import EmailTable from "@/components/EmailTable";
import toast from "react-hot-toast";

export default function ScheduledPage() {
  const [emails, setEmails] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EmailJob[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchEmails = useCallback(async () => {
    try {
      const data = await getScheduledEmails();
      setEmails(data.emails);
    } catch (error: any) {
      toast.error("Failed to load scheduled emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 10000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  const handleCancel = async (id: string) => {
    try {
      await cancelEmail(id);
      toast.success("Email cancelled");
      setEmails(emails.filter((e) => e.id !== id));
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel email");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchEmails(searchQuery);
      setSearchResults(results.hits);
    } catch (error: any) {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const displayEmails = searchResults || emails;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-100">
            {emails.length} email{emails.length !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value) setSearchResults(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search emails..."
            className="px-4 py-2 bg-dark-500 border border-dark-400/30 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm w-64"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 bg-dark-500 border border-dark-400/30 rounded-lg text-sm text-dark-100 hover:bg-dark-400 hover:text-white transition-colors"
          >
            {searching ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="bg-dark-600 rounded-xl border border-dark-400/30">
        <EmailTable
          emails={displayEmails}
          type="scheduled"
          onCancel={handleCancel}
          loading={loading}
        />
      </div>
    </div>
  );
}
