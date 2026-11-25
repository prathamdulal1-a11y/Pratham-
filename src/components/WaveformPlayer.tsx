import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, Volume2 } from "lucide-react";

interface WaveformPlayerProps {
  audioUrl: string | null;
  title: string;
  isGenerating: boolean;
  onDurationResolved?: (durationSec: number) => void;
}

const SPEED_STEPS = [0.85, 1.0, 1.1] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function WaveformPlayer({
  audioUrl,
  title,
  isGenerating,
  onDurationResolved,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState<number>(1);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const playbackRate = SPEED_STEPS[speedIndex];

  // Draw idle or live waveform bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderFrame = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 56;
      const gap = Math.max(2 * dpr, w * 0.006);
      const barWidth = Math.max(2 * dpr, (w - gap * (barCount - 1)) / barCount);
      const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

      let freqData: Uint8Array<ArrayBuffer> | null = null;
      if (isPlaying && analyserRef.current) {
        freqData = new Uint8Array(new ArrayBuffer(analyserRef.current.frequencyBinCount));
        analyserRef.current.getByteFrequencyData(freqData);
      }

      const nowSec = performance.now() / 1000;
      for (let i = 0; i < barCount; i++) {
        const normPos = i / (barCount - 1);
        let amplitude = 0.16 + 0.12 * Math.sin(i * 0.55) + 0.08 * Math.cos(i * 1.1);

        if (freqData && freqData.length > 0) {
          const binIndex = Math.min(
            freqData.length - 1,
            Math.floor((i / barCount) * (freqData.length * 0.65))
          );
          const val = freqData[binIndex] / 255;
          amplitude = Math.max(0.1, val * 0.88 + 0.1);
        } else if (isPlaying) {
          amplitude =
            0.22 +
            0.26 * Math.abs(Math.sin(nowSec * 3.2 + i * 0.42)) +
            0.16 * Math.abs(Math.cos(nowSec * 2.1 + i * 0.7));
        } else if (!audioUrl) {
          amplitude = 0.08 + 0.04 * Math.sin(i * 0.45);
        }

        const barHeight = Math.max(3 * dpr, amplitude * (h * 0.84));
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        const isPlayed = audioUrl ? normPos <= progressRatio : false;
        if (!audioUrl) {
          ctx.fillStyle = "rgba(161, 161, 170, 0.18)";
        } else if (isPlayed) {
          ctx.fillStyle = "#E11D48";
        } else {
          ctx.fillStyle = "rgba(244, 244, 245, 0.24)";
        }

        const radius = Math.min(barWidth / 2, 2 * dpr);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      if (isPlaying) {
        rafRef.current = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, currentTime, duration, audioUrl]);

  // Handle new audioUrl loading & auto-play attempt
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaybackError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    if (!audioUrl) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = audioUrl;
    audio.playbackRate = playbackRate;
    audio.load();

    const tryAutoPlay = async () => {
      try {
        if (audioCtxRef.current?.state === "suspended") {
          await audioCtxRef.current.resume();
        }
        await audio.play();
        setIsPlaying(true);
      } catch {
        // Browser blocked autoplay; user can click Play manually
        setIsPlaying(false);
      }
    };

    tryAutoPlay();
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const ensureAudioAnalyser = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        if (ctx.state !== "running") {
          return;
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.78;
        if (!sourceNodeRef.current) {
          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          sourceNodeRef.current = source;
        }
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } else if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
    } catch {
      // Proceed with standard <audio> playback even if Web Audio analyser cannot attach
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    setPlaybackError(null);

    try {
      await ensureAudioAnalyser();

      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } catch {
      setPlaybackError("Unable to start audio playback in this browser session.");
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = clickRatio * duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEED_STEPS.length);
  };

  const safeFilename = `${(title || "nepali-story")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "nepali-story"}.wav`;

  return (
    <div className="space-y-4">
      <audio
        ref={audioRef}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(d);
          if (onDurationResolved && Number.isFinite(d)) {
            onDurationResolved(d);
          }
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => {
          setIsPlaying(true);
        }}
        onError={() => {
          setIsPlaying(false);
          if (audioUrl) {
            setPlaybackError("Audio stream failed to decode.");
          }
        }}
      />

      {/* Interactive waveform & scrub track */}
      <div
        role="slider"
        tabIndex={audioUrl ? 0 : -1}
        aria-label="Audio playback progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        onClick={handleSeek}
        onKeyDown={(e) => {
          const audio = audioRef.current;
          if (!audio || !audioUrl || duration <= 0) return;
          if (e.key === "ArrowRight") {
            audio.currentTime = Math.min(duration, audio.currentTime + 5);
          } else if (e.key === "ArrowLeft") {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
          }
        }}
        className={`relative h-16 w-full rounded-lg bg-zinc-950/80 border border-zinc-800/90 px-3 py-2 flex items-center ${
          audioUrl ? "cursor-pointer hover:border-zinc-700" : "cursor-default"
        } transition-colors`}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
        {isGenerating && (
          <div className="absolute inset-0 rounded-lg bg-zinc-950/85 backdrop-blur-xs flex items-center justify-center gap-2.5 text-xs text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
            <span>Synthesizing soulful Nepali narration...</span>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            disabled={!audioUrl || isGenerating}
            aria-label={isPlaying ? "Pause narration" : "Play narration"}
            className="h-11 w-11 rounded-full flex items-center justify-center bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <div className="flex flex-col">
            <span className="font-mono text-xs tabular-nums text-zinc-200">
              {formatTime(currentTime)} <span className="text-zinc-600">/</span> {formatTime(duration)}
            </span>
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
              {audioUrl ? "24 kHz WAV Master" : "Ready to record"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleSpeed}
            disabled={!audioUrl}
            aria-label="Change playback speed"
            className="h-10 px-3 rounded-lg border border-zinc-800 text-xs font-mono tabular-nums text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            {playbackRate.toFixed(2).replace(/\.00$/, ".0")}x
          </button>

          {audioUrl && (
            <a
              href={audioUrl}
              download={safeFilename}
              className="h-10 px-3.5 rounded-lg border border-zinc-800 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save WAV</span>
            </a>
          )}
        </div>
      </div>

      {playbackError && (
        <p className="text-xs text-rose-400" role="alert">
          {playbackError}
        </p>
      )}
    </div>
  );
}
