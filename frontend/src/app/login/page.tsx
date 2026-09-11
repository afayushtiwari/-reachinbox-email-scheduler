"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { googleLogin, getAuthToken } from "@/lib/api";
import toast from "react-hot-toast";

declare global {
  interface Window {
    google?: any;
    googleInitialize?: boolean;
  }
}

function GoogleSignInButton({ onSuccess }: { onSuccess: (idToken: string) => void }) {
  useEffect(() => {
    if (!window.google) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google && !window.googleInitialize) {
          window.googleInitialize = true;
          window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            callback: (response: any) => {
              if (response.credential) {
                onSuccess(response.credential);
              }
            },
          });
        }
      };
      document.head.appendChild(script);
    }
  }, [onSuccess]);

  const renderGoogleButton = () => {
    if (window.google) {
      const container = document.getElementById("google-signin-btn");
      if (container) {
        container.innerHTML = "";
        window.google.accounts.id.renderButton(container, {
          theme: "filled_black",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: 300,
        });
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.google) {
        renderGoogleButton();
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="google-signin-btn" className="flex justify-center" />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleGoogleSuccess = async (idToken: string) => {
    setLoading(true);
    try {
      await googleLogin(idToken);
      toast.success("Signed in successfully!");
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-700 px-4">
      <div className="w-full max-w-md">
        <div className="bg-dark-600 rounded-2xl p-8 shadow-2xl border border-dark-400/30">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">ReachInbox</h1>
            </div>
            <p className="text-dark-100 text-sm">
              AI-driven email scheduling and outreach platform
            </p>
          </div>

          <div className="space-y-6">
            {googleClientId && (
              <div className="bg-dark-500 rounded-lg p-4 border border-dark-400/30">
                <h3 className="text-white font-medium text-sm mb-2">Get Started</h3>
                <p className="text-dark-200 text-xs mb-4">
                  Sign in with your Google account to start scheduling emails
                </p>

                {loading ? (
                  <div className="flex items-center justify-center py-3">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-dark-100">Signing in...</span>
                  </div>
                ) : (
                  <GoogleSignInButton onSuccess={handleGoogleSuccess} />
                )}
              </div>
            )}

            {!googleClientId && (
              <div className="bg-dark-500 rounded-lg p-4 border border-dark-400/30">
                <h3 className="text-white font-medium text-sm mb-2">Get Started</h3>
                <p className="text-dark-200 text-xs">
                  Google sign-in is not configured yet. Contact the administrator to enable sign-in.
                </p>
              </div>
            )}

            <div className="text-center">
              <p className="text-dark-300 text-xs">
                By signing in, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-dark-300 text-xs">
            Powered by Outbox Labs
          </p>
        </div>
      </div>
    </div>
  );
}
