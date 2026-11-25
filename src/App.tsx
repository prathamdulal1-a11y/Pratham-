import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import {
  DEPTH_OPTIONS,
  type DepthOption,
  type NarrationTake,
  PACING_OPTIONS,
  type PacingOption,
  PERSONA_SPEC_SUMMARY,
  STORY_PRESETS,
  type StoryPreset,
  VOICE_OPTIONS,
  type VoiceOption,
} from "./data/stories";
import { WaveformPlayer } from "./components/WaveformPlayer";
import {
  OfflineIndicator,
  PlayStoreGuideModal,
  PWAInstallButton,
} from "./components/PWAControls";

function base64ToWavUrl(base64: string, mimeType: string): string {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || "audio/wav" });
  return URL.createObjectURL(blob);
}

function estimateNepaliDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Reflective slow-to-medium storytelling averages ~105 words per minute (~1.75 words/sec)
  return Math.max(0, Math.round(words / 1.75));
}

function formatDurationBadge(seconds: number): string {
  if (seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function App() {
  const initialStory = STORY_PRESETS[0];

  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialStory.id);
  const [storyTitle, setStoryTitle] = useState<string>(initialStory.nepaliTitle);
  const [scriptText, setScriptText] = useState<string>(initialStory.script);
  const [editorMode, setEditorMode] = useState<"edit" | "passage">("edit");

  const [voiceName, setVoiceName] = useState<VoiceOption>("Charon");
  const [pacing, setPacing] = useState<PacingOption>("slow-medium");
  const [depth, setDepth] = useState<DepthOption>("balanced-nostalgia");
  const [customNote, setCustomNote] = useState<string>("");
  const [showDirectionPanel, setShowDirectionPanel] = useState<boolean>(false);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activePassageIndex, setActivePassageIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState<number>(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [currentTakeTitle, setCurrentTakeTitle] = useState<string>(initialStory.nepaliTitle);
  const [takes, setTakes] = useState<NarrationTake[]>([]);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [showPlayStoreGuide, setShowPlayStoreGuide] = useState<boolean>(false);

  const createdUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of createdUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  const activePreset: StoryPreset = useMemo(() => {
    return STORY_PRESETS.find((s) => s.id === selectedPresetId) ?? STORY_PRESETS[0];
  }, [selectedPresetId]);

  const paragraphs = useMemo(() => {
    return scriptText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [scriptText]);

  const wordCount = useMemo(() => {
    const trimmed = scriptText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [scriptText]);

  const charCount = scriptText.length;
  const estimatedSeconds = useMemo(() => estimateNepaliDurationSeconds(scriptText), [scriptText]);

  const synthesizeScript = useCallback(
    async (textToRead: string, label: string, passageIdx: number | null) => {
      const cleaned = textToRead.trim();
      if (!cleaned) {
        setErrorMsg("Enter or select a Nepali script before generating narration.");
        return;
      }

      setIsGenerating(true);
      setActivePassageIndex(passageIdx);
      setErrorMsg(null);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 120000);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "audio/wav, application/json",
          },
          body: JSON.stringify({
            text: textToRead,
            voiceName,
            pacing,
            depth,
            customNote,
          }),
          signal: controller.signal,
        });

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        let audioUrl: string;

        if (res.ok && contentType.includes("audio/")) {
          const audioBlob = await res.blob();
          if (audioBlob.size <= 44) {
            throw new Error("Narration service returned an empty audio file. Please try again.");
          }
          audioUrl = URL.createObjectURL(audioBlob);
        } else {
          const rawText = await res.text();
          let payload: {
            audioBase64?: string;
            mimeType?: string;
            error?: string;
            retryAfterSec?: number;
            quotaExhausted?: boolean;
          } | null = null;

          if (rawText.trim().length > 0) {
            try {
              payload = JSON.parse(rawText);
            } catch {
              throw new Error(
                res.ok
                  ? "Server returned an unexpected non-JSON response."
                  : `Narration service error (${res.status}). Please try again in a moment.`
              );
            }
          }

          if (!res.ok || !payload?.audioBase64) {
            if (res.status === 429 && !payload?.quotaExhausted) {
              setCooldownSec(payload?.retryAfterSec ?? 15);
            }
            throw new Error(
              payload?.error ||
                (res.status
                  ? `Narration service error (${res.status}). Please try again in a moment.`
                  : "Speech generation failed.")
            );
          }

          audioUrl = base64ToWavUrl(payload.audioBase64, payload.mimeType || "audio/wav");
        }

        createdUrlsRef.current.push(audioUrl);

        setCurrentAudioUrl(audioUrl);
        setCurrentTakeTitle(label);

        const newTake: NarrationTake = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: label,
          excerpt: cleaned.slice(0, 92) + (cleaned.length > 92 ? "..." : ""),
          audioUrl,
          voiceName,
          pacing,
          depth,
          durationSec: estimateNepaliDurationSeconds(cleaned),
          createdAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isPassage: passageIdx !== null,
        };

        setTakes((prev) => [newTake, ...prev]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setErrorMsg(
            "Narration request timed out. Try narrating shorter paragraphs using Paragraph Focus mode."
          );
        } else {
          const message = err instanceof Error ? err.message : "Unable to generate speech.";
          setErrorMsg(message);
        }
      } finally {
        window.clearTimeout(timeoutId);
        setIsGenerating(false);
        setActivePassageIndex(null);
      }
    },
    [voiceName, pacing, depth, customNote]
  );

  const handleLoadPreset = (preset: StoryPreset) => {
    setSelectedPresetId(preset.id);
    setStoryTitle(preset.nepaliTitle);
    setScriptText(preset.script);
    setErrorMsg(null);
    const studioEl = document.getElementById("studio");
    if (studioEl) {
      studioEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleResetScript = () => {
    setStoryTitle(activePreset.nepaliTitle);
    setScriptText(activePreset.script);
    setErrorMsg(null);
  };

  const handleClearScript = () => {
    setStoryTitle("नयाँ कथा");
    setScriptText("");
    setEditorMode("edit");
    setErrorMsg(null);
  };

  const handleDurationResolved = useCallback(
    (resolvedSec: number) => {
      if (!currentAudioUrl) return;
      setTakes((prev) =>
        prev.map((take) =>
          take.audioUrl === currentAudioUrl ? { ...take, durationSec: resolvedSec } : take
        )
      );
    },
    [currentAudioUrl]
  );

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#studio"
            className="font-display text-2xl font-semibold tracking-tight text-zinc-50 whitespace-nowrap shrink-0"
          >
            Katha Swar
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
            <a
              href="#studio"
              className="hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              Studio
            </a>
            <a
              href="#stories"
              className="hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              Stories
            </a>
            <a
              href="#voice-brief"
              className="hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              Voice Brief
            </a>
            <a
              href="#takes"
              className="hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              Takes
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => synthesizeScript(scriptText, storyTitle || "Nepali Story", null)}
              disabled={isGenerating || cooldownSec > 0 || !scriptText.trim()}
              className="h-10 px-5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isGenerating && activePassageIndex === null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Narrating...</span>
                </>
              ) : cooldownSec > 0 ? (
                <span>Wait {cooldownSec}s</span>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Narrate Story</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Studio Workspace */}
        <section id="studio" className="max-w-7xl mx-auto px-6 pt-10 pb-16">
          {/* Editorial Intro Header */}
          <div className="max-w-3xl mb-10">
            <p className="text-xs text-zinc-400 mb-3 tracking-wide">
              Nepali Storytelling Voice Studio · Gemini 3.8 Flash TTS · Verbatim Narration
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-50 leading-[1.12] [text-wrap:balance]">
              Intimate Nepali narration shaped by memory, longing, and quiet breath.
            </h1>
          </div>

          {/* Asymmetric 2-Column Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Nepali Verbatim Manuscript */}
            <div className="lg:col-span-7 bg-[#111114] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
              <div className="space-y-6">
                {/* Manuscript Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
                  <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800/80 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setEditorMode("edit")}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        editorMode === "edit"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Edit Script
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode("passage")}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        editorMode === "passage"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Paragraph Focus
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <PWAInstallButton />
                    <button
                      type="button"
                      onClick={() => setShowPlayStoreGuide(true)}
                      className="inline-flex items-center gap-1.5 hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Android App</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetScript}
                      className="inline-flex items-center gap-1.5 hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Story</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearScript}
                      className="hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Story Title Input */}
                <div>
                  <label htmlFor="story-title" className="sr-only">
                    Story title
                  </label>
                  <input
                    id="story-title"
                    type="text"
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    placeholder="कथाको शीर्षक लेख्नुहोस्..."
                    className="w-full bg-transparent font-nepali text-2xl sm:text-3xl font-medium text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>

                {/* Script Input or Paragraph Focus View */}
                {editorMode === "edit" ? (
                  <div>
                    <label htmlFor="nepali-script" className="sr-only">
                      Nepali verbatim script
                    </label>
                    <textarea
                      id="nepali-script"
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      rows={14}
                      placeholder="यहाँ आफ्नो नेपाली प्रेमकथा लेख्नुहोस् वा पेस्ट गर्नुहोस्... आवाजले प्रत्येक शब्द जस्ताको तस्तै पढ्नेछ।"
                      className="w-full bg-transparent font-nepali text-base sm:text-[17px] leading-[1.95] text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[340px] focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-4 min-h-[340px]">
                    {paragraphs.length === 0 ? (
                      <div className="py-16 text-center text-sm text-zinc-500">
                        Switch to Edit Script to write or paste a Nepali story.
                      </div>
                    ) : (
                      paragraphs.map((para, idx) => {
                        const isThisLoading = isGenerating && activePassageIndex === idx;
                        return (
                          <div
                            key={`${idx}-${para.slice(0, 16)}`}
                            className="group py-4 border-b border-zinc-800/60 last:border-b-0 flex items-start justify-between gap-5"
                          >
                            <p className="font-nepali text-base sm:text-[17px] leading-[1.95] text-zinc-200">
                              {para}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                synthesizeScript(
                                  para,
                                  `${storyTitle || "Story"} · Stanza ${idx + 1}`,
                                  idx
                                )
                              }
                              disabled={isGenerating || cooldownSec > 0}
                              aria-label={`Narrate paragraph ${idx + 1}`}
                              className="mt-1 h-10 px-3 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-300 hover:border-rose-500/60 hover:text-zinc-50 hover:bg-zinc-900 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isThisLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                              <span>Read</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Clean Unboxed Script Metadata Footer */}
              <div className="pt-6 mt-6 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <span>{wordCount} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{charCount} / 12,000 chars</span>
                  <span aria-hidden="true">·</span>
                  <span>Est. {formatDurationBadge(estimatedSeconds)}</span>
                </div>
                <span className="text-zinc-500">
                  Reads exact Nepali script verbatim
                </span>
              </div>
            </div>

            {/* Right Column: Voice Booth & Audio Player */}
            <div className="lg:col-span-5 bg-[#111114] border border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col justify-between">
              {/* Cover Artwork */}
              <div className="relative aspect-[16/10] w-full bg-zinc-900 overflow-hidden">
                {!failedImages[activePreset.id] ? (
                  <img
                    src={activePreset.imageUrl}
                    alt={activePreset.imageAlt}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [activePreset.id]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-950 to-rose-950/30 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-[#111114]/45 to-transparent" />
                <div className="absolute bottom-4 left-6 right-6">
                  <p className="text-xs text-zinc-300/90 mb-1">
                    {activePreset.chapterLabel} <span aria-hidden="true">·</span>{" "}
                    {activePreset.setting}
                  </p>
                  <h2 className="font-nepali text-xl font-medium text-zinc-50 truncate">
                    {currentTakeTitle || storyTitle}
                  </h2>
                </div>
              </div>

              {/* Audio Booth & Controls */}
              <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-5">
                  <WaveformPlayer
                    audioUrl={currentAudioUrl}
                    title={currentTakeTitle || storyTitle}
                    isGenerating={isGenerating}
                    onDurationResolved={handleDurationResolved}
                  />

                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      synthesizeScript(scriptText, storyTitle || "Nepali Story", null)
                    }
                    disabled={isGenerating || cooldownSec > 0 || !scriptText.trim()}
                    className="w-full h-11 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-sm font-medium text-white transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isGenerating && activePassageIndex === null ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Recording Narration...</span>
                      </>
                    ) : cooldownSec > 0 ? (
                      <span>Wait {cooldownSec}s before retrying...</span>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span>Narrate Full Script</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Voice Direction Settings */}
                <div className="pt-5 border-t border-zinc-800/80 space-y-4">
                  {/* Voice Base */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Storyteller Voice</span>
                      <span className="text-zinc-500">
                        {VOICE_OPTIONS.find((v) => v.id === voiceName)?.character}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 border border-zinc-800/80 rounded-lg">
                      {VOICE_OPTIONS.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVoiceName(v.id)}
                          className={`py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                            voiceName === v.id
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pacing & Depth Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="pacing-select" className="block text-xs text-zinc-400">
                        Pacing
                      </label>
                      <select
                        id="pacing-select"
                        value={pacing}
                        onChange={(e) => setPacing(e.target.value as PacingOption)}
                        className="w-full h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                      >
                        {PACING_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="depth-select" className="block text-xs text-zinc-400">
                        Emotional Texture
                      </label>
                      <select
                        id="depth-select"
                        value={depth}
                        onChange={(e) => setDepth(e.target.value as DepthOption)}
                        className="w-full h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                      >
                        {DEPTH_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Expandable Custom Nuance */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowDirectionPanel((prev) => !prev)}
                      className="w-full flex items-center justify-between py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Additional Delivery Nuance</span>
                      </span>
                      {showDirectionPanel ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {showDirectionPanel && (
                      <div className="pt-2">
                        <textarea
                          value={customNote}
                          onChange={(e) => setCustomNote(e.target.value)}
                          rows={2}
                          maxLength={400}
                          placeholder="Optional nuance (e.g., softer whisper on the final line, slightly longer pause after 'मौनता')..."
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Curated Stories Section */}
        <section id="stories" className="border-t border-zinc-800/80 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs text-zinc-400 mb-2">Curated Manuscripts</p>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-zinc-50">
                  Real-life inspired Nepali love stories
                </h2>
              </div>
              <p className="text-sm text-zinc-400 max-w-md">
                Select any chapter to load its verbatim Devanagari script into the studio editor.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {STORY_PRESETS.map((story) => {
                const isActive = story.id === selectedPresetId;
                return (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => handleLoadPreset(story)}
                    className={`group text-left rounded-2xl overflow-hidden bg-[#111114] border transition-colors cursor-pointer flex flex-col ${
                      isActive
                        ? "border-rose-500/70"
                        : "border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    <div className="aspect-[4/3] w-full bg-zinc-900 overflow-hidden">
                      {!failedImages[story.id] ? (
                        <img
                          src={story.imageUrl}
                          alt={story.imageAlt}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [story.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-950 flex items-center justify-center">
                          <BookOpen className="w-7 h-7 text-zinc-600" />
                        </div>
                      )}
                    </div>

                    <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <span>{story.chapterLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{story.mood}</span>
                        </div>
                        <h3 className="font-nepali text-xl font-medium text-zinc-100">
                          {story.nepaliTitle}
                        </h3>
                        <p className="text-sm text-zinc-400">{story.englishTitle}</p>
                      </div>

                      <p className="font-nepali text-sm text-zinc-500 line-clamp-2 leading-relaxed pt-2">
                        {story.script}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Active Voice Direction Brief */}
        <section id="voice-brief" className="border-t border-zinc-800/80 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 space-y-3">
                <p className="text-xs text-zinc-400">Active Persona Profile</p>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-zinc-50 [text-wrap:balance]">
                  Crafted for quiet intimacy, never theatrical delivery.
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Every synthesis call embeds these voice, dialect, and emotional arc directives
                  inside Gemini 3.8 Flash TTS while keeping your Nepali manuscript untouched.
                </p>
              </div>

              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                {PERSONA_SPEC_SUMMARY.map((item) => (
                  <div
                    key={item.label}
                    className="pt-4 border-t border-zinc-800/80 space-y-2"
                  >
                    <h3 className="text-sm font-semibold text-zinc-100">{item.label}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Session Recorded Takes */}
        <section id="takes" className="border-t border-zinc-800/80 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-xs text-zinc-400 mb-2">Session Archive</p>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-zinc-50">
                  Recorded takes
                </h2>
              </div>
              <span className="font-mono text-xs tabular-nums text-zinc-400">
                {takes.length} {takes.length === 1 ? "take" : "takes"}
              </span>
            </div>

            {takes.length === 0 ? (
              <div className="py-12 border border-dashed border-zinc-800 rounded-2xl text-center space-y-2">
                <p className="text-sm text-zinc-300">No narrations recorded in this session yet.</p>
                <p className="text-xs text-zinc-500">
                  Click Narrate Story above to synthesize your first Nepali storytelling take.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 border-t border-b border-zinc-800/80">
                {takes.map((take) => {
                  const isSelected = currentAudioUrl === take.audioUrl;
                  return (
                    <div
                      key={take.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                          <span className={isSelected ? "text-rose-400 font-medium" : "text-zinc-300"}>
                            {take.voiceName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{take.createdAt}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDurationBadge(Math.round(take.durationSec))}
                          </span>
                        </div>
                        <p className="font-nepali text-base font-medium text-zinc-100 truncate">
                          {take.title}
                        </p>
                        <p className="font-nepali text-xs text-zinc-500 truncate">{take.excerpt}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentAudioUrl(take.audioUrl);
                            setCurrentTakeTitle(take.title);
                          }}
                          className="h-10 px-4 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{isSelected ? "Loaded" : "Load Take"}</span>
                        </button>
                        <a
                          href={take.audioUrl}
                          download={`${take.title.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "take"}.wav`}
                          className="h-10 px-3.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-xs font-medium text-zinc-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>WAV</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/80 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span>Katha Swar — Nepali Love Story Voice Studio</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setShowPlayStoreGuide(true)}
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Android App &amp; Play Store</span>
            </button>
            <span>Powered by Gemini 3.8 Flash TTS</span>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
      <PlayStoreGuideModal
        open={showPlayStoreGuide}
        onClose={() => setShowPlayStoreGuide(false)}
      />
    </div>
  );
}
