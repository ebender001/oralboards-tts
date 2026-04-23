const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2";
const PORT = process.env.PORT || 3000;

const STEM_CACHE_DIR = path.join(process.cwd(), "cache", "stems");

fs.mkdirSync(STEM_CACHE_DIR, { recursive: true });

function getVoiceSettings() {
  return {
    stability: 0.55,
    similarity_boost: 0.8
  };
}

function buildStemCacheKey({ caseId, text, voiceId, modelId, voiceSettings }) {
  const payload = JSON.stringify({
    caseId,
    text,
    voiceId,
    modelId,
    voiceSettings
  });

  return crypto.createHash("sha256").update(payload).digest("hex");
}

function getStemCachePath(cacheKey) {
  return path.join(STEM_CACHE_DIR, `${cacheKey}.mp3`);
}

async function generateElevenLabsAudio({ text, voiceId, modelId, voiceSettings }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      output_format: "mp3_44100_128",
      voice_settings: voiceSettings
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs error ${resp.status}: ${errText}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/tts", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    const kind = String(req.body.kind || "prompt").trim();
    const caseId = String(req.body.caseId || "").trim();
    const voiceId = String(req.body.voiceId || DEFAULT_VOICE_ID || "").trim();
    const modelId = ELEVENLABS_MODEL_ID;
    const voiceSettings = getVoiceSettings();

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
    }

    if (!voiceId) {
      return res.status(500).json({ error: "Missing voiceId / ELEVENLABS_VOICE_ID" });
    }

    // Cache only stem audio
    if (kind === "stem") {
      if (!caseId) {
        return res.status(400).json({ error: "Missing caseId for stem caching" });
      }

      const cacheKey = buildStemCacheKey({
        caseId,
        text,
        voiceId,
        modelId,
        voiceSettings
      });

      const cachePath = getStemCachePath(cacheKey);

      if (fs.existsSync(cachePath)) {
        console.log(`Stem cache hit: ${cacheKey}`);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Cache", "hit");
        return fs.createReadStream(cachePath).pipe(res);
      }

      console.log(`Stem cache miss: ${cacheKey}`);
      const audioBuffer = await generateElevenLabsAudio({
        text,
        voiceId,
        modelId,
        voiceSettings
      });

      fs.writeFileSync(cachePath, audioBuffer);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Cache", "miss");
      return res.send(audioBuffer);
    }

    // Non-stem prompts are generated on demand only
    const audioBuffer = await generateElevenLabsAudio({
      text,
      voiceId,
      modelId,
      voiceSettings
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-TTS-Cache", "bypass");
    return res.send(audioBuffer);
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: error.message || "TTS failed" });
  }
});

app.listen(PORT, () => {
  console.log(`TTS server listening on port ${PORT}`);
});