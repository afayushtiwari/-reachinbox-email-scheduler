import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "ReachInbox - Email Scheduler",
  description: "AI-driven email scheduling and outreach platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-dark-700 text-white min-h-screen">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#25262B",
              color: "#C1C2C5",
              border: "1px solid #373A40",
            },
            success: {
              iconTheme: { primary: "#51CF66", secondary: "#25262B" },
            },
            error: {
              iconTheme: { primary: "#FF6B6B", secondary: "#25262B" },
            },
          }}
        />
      </body>
    </html>
  );
}
