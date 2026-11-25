import crypto from "crypto";
import "dotenv/config";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

const BASE_PERSONA_STYLE = [
  "Personality and affect: A deeply emotional storyteller narrating a heartfelt real-life Nepali love story, carrying sadness, tenderness, nostalgia, and a quiet sense of longing.",
  "Voice quality: A warm, slightly deep, mature Nepali male voice with a soft, soulful, intimate texture, gentle huskiness, and subtle emotional vulnerability.",
  "Tone: Melancholic, poetic, reflective, romantic, and deeply touching—feeling like someone remembering a beautiful love story with emotions hidden in the heart.",
  "Dialect and pronunciation: Natural conversational Nepali with authentic everyday expressions, clear and natural Nepali pronunciation, smooth sentence flow, gentle emphasis on emotional words, subtle pitch variation, and carefully controlled vocal intensity.",
  "Delivery arc: Begin with a mysterious, emotionally captivating hook. Use slow, thoughtful delivery during meaningful moments and add natural pauses after powerful sentences. Create a feeling of love, distance, memories, and longing. Gradually build emotional depth throughout the story, using a soft, almost trembling emotional texture during particularly touching moments, and end with a peaceful, heartbreaking yet beautiful emotional feeling.",
  "Performance: Speak intimately as if telling a personal love story to someone sitting right in front of you. Make every sentence feel meaningful and genuine.",
  "Strict prohibitions: Avoid cheerful energy, motivational delivery, news-anchor voice, exaggerated crying, theatrical acting, singing, and robotic narration.",
  "Critical script fidelity: Read the provided Nepali script verbatim, word-for-word, exactly as written. Do not translate, rewrite, summarize, skip, or add any extra words.",
].join(" ");

type VoiceOption = "Charon" | "Fenrir" | "Puck";
type PacingOption = "slow-lingering" | "slow-medium" | "measured";
type DepthOption = "quiet-intimate" | "balanced-nostalgia" | "deeply-vulnerable";

const ALLOWED_VOICES = new Set<VoiceOption>(["Charon", "Fenrir", "Puck"]);

function buildStyleDirective(
  pacing: PacingOption | undefined,
  depth: DepthOption | undefined,
  customNote: string | undefined
): string {
  const modifiers: string[] = [BASE_PERSONA_STYLE];

  if (pacing === "slow-lingering") {
    modifiers.push(
      "Pacing nuance: Lean noticeably slower with extended reflective pauses between sentences and long breaths around ellipses."
    );
  } else if (pacing === "measured") {
    modifiers.push(
      "Pacing nuance: Keep a steady, unhurried medium-slow conversational cadence with natural rhythm variations."
    );
  } else {
    modifiers.push(
      "Pacing nuance: Slow to medium pace with natural, organic variations in rhythm and thoughtful pauses after poignant lines."
    );
  }

  if (depth === "quiet-intimate") {
    modifiers.push(
      "Emotional nuance: Keep vocal intensity hushed, close-mic, and softly restrained like a quiet midnight confession."
    );
  } else if (depth === "deeply-vulnerable") {
    modifiers.push(
      "Emotional nuance: Allow a delicate, slightly trembling emotional vulnerability and warm huskiness on tender memories."
    );
  } else {
    modifiers.push(
      "Emotional nuance: Balanced nostalgic warmth with gentle emotional swelling in the middle and peaceful stillness at the end."
    );
  }

  if (customNote && customNote.trim().length > 0) {
    modifiers.push(`Additional storyteller nuance: ${customNote.trim().slice(0, 400)}`);
  }

  return modifiers.join(" ");
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorDetails(err: unknown): {
  status: number;
  message: string;
  retryAfterSec?: number;
} {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const statusMatch = rawMessage.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  const parsedStatus = statusMatch ? Number(statusMatch[1]) : 500;

  let upstreamMessage = rawMessage;
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed?.error?.message) {
      upstreamMessage = String(parsed.error.message);
    }
  } catch {
    // Raw message is not pure JSON
  }

  if (rawMessage.includes("API_KEY_INVALID") || rawMessage.includes("PERMISSION_DENIED")) {
    return {
      status: 403,
      message: "Gemini API key permission denied or invalid. Please check your key in Settings > Secrets.",
    };
  }

  if (rawMessage.includes("RESOURCE_EXHAUSTED") || parsedStatus === 429) {
    const retryMatch = upstreamMessage.match(/retry in\s+([\d.]+)s/i);
    const retryAfterSec = retryMatch ? Math.ceil(Number(retryMatch[1])) : undefined;
    return {
      status: 429,
      retryAfterSec,
      message: retryAfterSec
        ? `Gemini TTS rate limit reached. Please wait ${retryAfterSec}s and try again, or switch to a billing-enabled API key in Settings > Secrets for higher quota.`
        : `Gemini TTS rate limit or quota reached (${upstreamMessage}). You can select a billing-enabled API key in Settings > Secrets to increase your quota.`,
    };
  }

  if (rawMessage.includes("GEMINI_API_KEY is not configured")) {
    return {
      status: 500,
      message: "Server Gemini API key is not configured. Please verify Settings > Secrets.",
    };
  }

  if (
    rawMessage.includes("Unexpected end of JSON input") ||
    rawMessage.includes("ECONNRESET") ||
    rawMessage.includes("ETIMEDOUT") ||
    rawMessage.includes("fetch failed")
  ) {
    return {
      status: 502,
      message: "The speech service returned an empty or interrupted response. Please try again.",
    };
  }

  return {
    status: parsedStatus >= 400 && parsedStatus < 600 ? parsedStatus : 500,
    message: upstreamMessage || "Failed to synthesize speech.",
  };
}

const TTS_CACHE_LIMIT = 15;
const ttsCache = new Map<string, { audioBase64: string; mimeType: string }>();

function getCacheKey(
  scriptText: string,
  voiceName: VoiceOption,
  styleDirective: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${voiceName}\n${styleDirective}\n${scriptText}`)
    .digest("hex");
}

async function callTtsModel(
  ai: GoogleGenAI,
  model: "gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts",
  scriptText: string,
  voiceName: VoiceOption,
  styleDirective: string
): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: scriptText,
            speechMetadata: {
              style: styleDirective,
            },
          } as { text: string; speechMetadata?: { style?: string } },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const audioBase64 = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || "audio/wav";

  if (!audioBase64) {
    throw new Error("The TTS model returned an empty audio response.");
  }

  return { audioBase64, mimeType, modelUsed: model };
}

function extractWavPcm(wavBuffer: Buffer): {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcm: Buffer;
} {
  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString("ascii", 0, 4) !== "RIFF" ||
    wavBuffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Invalid WAV audio buffer received from TTS.");
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcm: Buffer | null = null;

  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(wavBuffer.length, dataStart + chunkSize);

    if (chunkId === "fmt " && chunkSize >= 16 && dataStart + 16 <= wavBuffer.length) {
      numChannels = wavBuffer.readUInt16LE(dataStart + 2);
      sampleRate = wavBuffer.readUInt32LE(dataStart + 4);
      bitsPerSample = wavBuffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === "data") {
      pcm = wavBuffer.subarray(dataStart, dataEnd);
      break;
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!pcm) {
    pcm = wavBuffer.subarray(44);
  }

  return { sampleRate, numChannels, bitsPerSample, pcm };
}

function buildWavFromPcmChunks(
  chunks: Array<{ sampleRate: number; numChannels: number; bitsPerSample: number; pcm: Buffer }>
): Buffer {
  const first = chunks[0];
  const totalPcmBytes = chunks.reduce((acc, c) => acc + c.pcm.length, 0);
  const header = Buffer.alloc(44);
  const byteRate = (first.sampleRate * first.numChannels * first.bitsPerSample) / 8;
  const blockAlign = (first.numChannels * first.bitsPerSample) / 8;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + totalPcmBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(first.numChannels, 22);
  header.writeUInt32LE(first.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(first.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(totalPcmBytes, 40);

  return Buffer.concat([header, ...chunks.map((c) => c.pcm)]);
}

function splitScriptIntoChunks(text: string, maxChars = 3600): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const sentences = para.split(/(?<=[।.!?])\s+/);
      let sentenceBuf = "";
      for (const s of sentences) {
        if ((sentenceBuf + " " + s).trim().length > maxChars && sentenceBuf) {
          chunks.push(sentenceBuf.trim());
          sentenceBuf = s;
        } else {
          sentenceBuf = sentenceBuf ? `${sentenceBuf} ${s}` : s;
        }
      }
      if (sentenceBuf.trim()) {
        chunks.push(sentenceBuf.trim());
      }
      continue;
    }

    if ((current + "\n\n" + para).trim().length > maxChars && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function synthesizeSingleChunk(
  ai: GoogleGenAI,
  chunkText: string,
  voiceName: VoiceOption,
  styleDirective: string
): Promise<{ audioBase64: string; mimeType: string; modelUsed: string }> {
  try {
    return await callTtsModel(
      ai,
      "gemini-3.8-flash-tts",
      chunkText,
      voiceName,
      styleDirective
    );
  } catch (err) {
    const details = extractErrorDetails(err);

    if (details.status === 429) {
      return await callTtsModel(
        ai,
        "gemini-3.8-flash-lite-tts",
        chunkText,
        voiceName,
        styleDirective
      );
    }

    if (details.status >= 500) {
      await sleep(1000);
      return await callTtsModel(
        ai,
        "gemini-3.8-flash-tts",
        chunkText,
        voiceName,
        styleDirective
      );
    }

    throw err;
  }
}

async function generateTtsWithRetry(
  scriptText: string,
  voiceName: VoiceOption,
  styleDirective: string
): Promise<{ audioBase64: string; mimeType: string; cached: boolean; modelUsed: string }> {
  const cacheKey = getCacheKey(scriptText, voiceName, styleDirective);
  const cachedEntry = ttsCache.get(cacheKey);
  if (cachedEntry) {
    return { ...cachedEntry, cached: true, modelUsed: "cache" };
  }

  const ai = getAiClient();
  const chunks = splitScriptIntoChunks(scriptText);

  let finalResult: { audioBase64: string; mimeType: string; modelUsed: string };

  if (chunks.length === 1) {
    finalResult = await synthesizeSingleChunk(ai, chunks[0], voiceName, styleDirective);
  } else {
    const pcmParts: Array<{
      sampleRate: number;
      numChannels: number;
      bitsPerSample: number;
      pcm: Buffer;
    }> = [];
    let lastModelUsed = "gemini-3.8-flash-tts";

    for (const chunk of chunks) {
      const partResult = await synthesizeSingleChunk(ai, chunk, voiceName, styleDirective);
      lastModelUsed = partResult.modelUsed;
      pcmParts.push(extractWavPcm(Buffer.from(partResult.audioBase64, "base64")));
    }

    const stitchedWav = buildWavFromPcmChunks(pcmParts);
    finalResult = {
      audioBase64: stitchedWav.toString("base64"),
      mimeType: "audio/wav",
      modelUsed: lastModelUsed,
    };
  }

  if (ttsCache.size >= TTS_CACHE_LIMIT) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  ttsCache.set(cacheKey, {
    audioBase64: finalResult.audioBase64,
    mimeType: finalResult.mimeType,
  });

  return { ...finalResult, cached: false };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: "gemini-3.8-flash-tts" });
  });

  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.ASSETLINKS_PACKAGE_NAME?.trim();
    const sha256 = process.env.ASSETLINKS_SHA256_FINGERPRINT?.trim();

    if (!packageName || !sha256) {
      res.json([]);
      return;
    }

    const fingerprints = sha256
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceName, pacing, depth, customNote } = req.body ?? {};

      if (typeof text !== "string" || text.trim().length === 0) {
        res.status(400).json({ error: "Please provide a Nepali script to narrate." });
        return;
      }

      if (text.length > 12000) {
        res.status(400).json({
          error: "Script exceeds 12,000 characters. Please narrate in smaller chapters or paragraphs.",
        });
        return;
      }

      const selectedVoice: VoiceOption = ALLOWED_VOICES.has(voiceName) ? voiceName : "Charon";
      const styleDirective = buildStyleDirective(pacing, depth, customNote);

      // Preserve exact script text verbatim as provided by the user
      const { audioBase64, mimeType, cached, modelUsed } = await generateTtsWithRetry(
        text,
        selectedVoice,
        styleDirective
      );

      const acceptHeader = (req.headers.accept || "").toLowerCase();
      if (acceptHeader.includes("audio/wav") || req.body?.responseFormat === "binary") {
        const audioBuffer = Buffer.from(audioBase64, "base64");
        res.setHeader("Content-Type", mimeType || "audio/wav");
        res.setHeader("Content-Length", String(audioBuffer.length));
        res.setHeader("X-Voice-Name", selectedVoice);
        res.setHeader("X-Model-Used", modelUsed);
        res.setHeader("X-Cached", cached ? "true" : "false");
        res.status(200).send(audioBuffer);
        return;
      }

      res.json({
        audioBase64,
        mimeType,
        voiceName: selectedVoice,
        characterCount: text.length,
        cached,
        modelUsed,
      });
    } catch (err) {
      const details = extractErrorDetails(err);
      res.status(details.status).json({
        error: details.message,
        ...(details.retryAfterSec ? { retryAfterSec: details.retryAfterSec } : {}),
      });
    }
  });

  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith("/api")) {
        const details = extractErrorDetails(err);
        res.status(details.status).json({ error: details.message });
        return;
      }
      next(err);
    }
  );

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      plugins: [
        {
          name: "disable-vite-client-ws",
          enforce: "post",
          transform(code, id) {
            if (id.includes("vite/dist/client/client.mjs")) {
              const patched = code.replace(
                /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);(?=\s*let willUnload = false;)/,
                "const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} }); /* WebSocket HMR disabled in proxy dev mode */"
              );
              return { code: patched, map: null };
            }
          },
        },
      ],
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Application build not found.");
      }
    });
  }

  httpServer.requestTimeout = 300000;
  httpServer.headersTimeout = 65000;
  httpServer.keepAliveTimeout = 65000;

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Katha Swar server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
