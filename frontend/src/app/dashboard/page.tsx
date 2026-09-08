"use client";

import { useEffect, useState } from "react";
import { getEmailStats, getQueueStats } from "@/lib/api";
import { EmailStats, QueueStats } from "@/types";
import ComposeModal from "@/components/ComposeModal";
import SlackPanel from "@/components/SlackPanel";
import toast from "react-hot-toast";

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-dark-600 rounded-xl p-6 border border-dark-400/30">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-dark-100">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  const fetchData = async () => {
    try {
      const [emailStats, qStats] = await Promise.all([
        getEmailStats(),
        getQueueStats(),
      ]);
      setStats(emailStats);
      setQueueStats(qStats);
    } catch (error: any) {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p className="text-sm text-dark-100 mt-1">
            Monitor your email scheduling activity
          </p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose New Email
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Emails"
          value={stats?.total || 0}
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          color="bg-blue-500/10"
        />
        <StatCard
          label="Scheduled"
          value={stats?.scheduled || 0}
          icon={
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="bg-yellow-500/10"
        />
        <StatCard
          label="Sent"
          value={stats?.sent || 0}
          icon={
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
          color="bg-green-500/10"
        />
        <StatCard
          label="Failed"
          value={stats?.failed || 0}
          icon={
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
          color="bg-red-500/10"
        />
      </div>

      {queueStats && (
        <div className="bg-dark-600 rounded-xl p-6 border border-dark-400/30">
          <h3 className="text-lg font-semibold text-white mb-4">Queue Status</h3>
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Waiting", value: queueStats.waiting, color: "text-blue-400" },
              { label: "Active", value: queueStats.active, color: "text-yellow-400" },
              { label: "Delayed", value: queueStats.delayed, color: "text-purple-400" },
              { label: "Completed", value: queueStats.completed, color: "text-green-400" },
              { label: "Failed", value: queueStats.failed, color: "text-red-400" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-dark-100 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <SlackPanel />

      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          onSuccess={() => {
            setShowCompose(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
