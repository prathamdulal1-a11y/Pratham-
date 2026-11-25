import { useState } from "react";
import { Check, Copy, Download, Smartphone, WifiOff, X } from "lucide-react";
import { useOnlineStatus, usePWAInstall } from "../hooks/usePWAInstall";

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-rose-400" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="h-8 px-3 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-rose-400" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#111114] border border-zinc-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-zinc-50">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close guide"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Tap the Share button in the Safari toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-zinc-900 border border-amber-500/50 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline — Cached stories available; network required for new narration.</span>
    </div>
  );
}

interface PlayStoreGuideModalProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_PUBLIC_ORIGIN =
  "https://ais-pre-p5ac2jue5ksihmdvgns4ne-809710390087.europe-west2.run.app";

export function PlayStoreGuideModal({ open, onClose }: PlayStoreGuideModalProps) {
  const [copiedCommand, setCopiedCommand] = useState(false);

  if (!open) return null;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const publicOrigin =
    currentOrigin && !currentOrigin.includes("ais-dev-")
      ? currentOrigin
      : DEFAULT_PUBLIC_ORIGIN;
  const manifestUrl = `${publicOrigin}/manifest.webmanifest`;
  const bubblewrapCmd = `npx @bubblewrap/cli init --manifest=${manifestUrl} && npx @bubblewrap/cli build`;

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(bubblewrapCmd);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch {
      // Clipboard blocked in some embedded contexts
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#111114] border border-zinc-800 p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-400 mb-1">Android App &amp; Play Store (.aab / .apk)</p>
            <h3 className="font-display text-2xl font-semibold text-zinc-50">
              Build Katha Swar for Android
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Android packaging guide"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed">
          Katha Swar is configured as an Android-ready Trusted Web Activity (TWA) with adaptive
          icons, standalone display, offline shell caching, and{" "}
          <code className="font-mono text-xs text-zinc-200">/.well-known/assetlinks.json</code>.
          Since Android <code className="font-mono text-xs text-zinc-200">.apk</code> /{" "}
          <code className="font-mono text-xs text-zinc-200">.aab</code> binaries require Android SDK
          signing tools outside the browser, package it in two steps:
        </p>

        <ol className="space-y-3 text-sm text-zinc-300 leading-relaxed list-decimal list-inside">
          <li>
            Click <strong className="text-zinc-100 font-medium">Share / Publish</strong> in AI Studio
            so your public app URL is live.
          </li>
          <li>
            Run <strong className="text-zinc-100 font-medium">Bubblewrap CLI</strong> locally (or
            paste your public URL into{" "}
            <strong className="text-zinc-100 font-medium">PWABuilder</strong>) to build the signed{" "}
            <code className="font-mono text-xs">.aab</code> for Play Store and{" "}
            <code className="font-mono text-xs">.apk</code> for direct Android install.
          </li>
          <li>
            Set <code className="font-mono text-xs text-zinc-200">ASSETLINKS_PACKAGE_NAME</code> and{" "}
            <code className="font-mono text-xs text-zinc-200">ASSETLINKS_SHA256_FINGERPRINT</code>{" "}
            in Settings &gt; Secrets to verify full-screen mode without a browser bar.
          </li>
          <li>
            Upload the signed <code className="font-mono text-xs">.aab</code> to Google Play
            Console or install the <code className="font-mono text-xs">.apk</code> on Android.
          </li>
        </ol>

        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 flex items-center justify-between gap-3">
          <code className="font-mono text-xs text-zinc-300 truncate">{bubblewrapCmd}</code>
          <button
            type="button"
            onClick={copyCommand}
            aria-label="Copy Bubblewrap CLI command"
            className="h-8 px-2.5 rounded-md border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {copiedCommand ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <a
            href="/twa-manifest.json"
            download="twa-manifest.json"
            className="h-10 px-4 rounded-lg border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            <span>Download twa-manifest.json</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-100 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
