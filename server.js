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

const PARSE_APP_ID = process.env.PARSE_APP_ID;
const PARSE_REST_API_KEY = process.env.PARSE_REST_API_KEY;
const PARSE_MASTER_KEY = process.env.PARSE_MASTER_KEY;
const PARSE_SERVER_URL = process.env.PARSE_SERVER_URL || "https://parseapi.back4app.com";

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

function getParseHeaders({ useMasterKey = false, contentType = "application/json" } = {}) {
  const headers = {
    "X-Parse-Application-Id": PARSE_APP_ID,
    "Content-Type": contentType
  };

  if (useMasterKey) {
    headers["X-Parse-Master-Key"] = PARSE_MASTER_KEY;
  } else if (PARSE_REST_API_KEY) {
    headers["X-Parse-REST-API-Key"] = PARSE_REST_API_KEY;
  }

  return headers;
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

async function findPersistentStemCache(cacheKey) {
  const url = `${PARSE_SERVER_URL}/classes/TTSCache?where=${encodeURIComponent(
    JSON.stringify({
      cacheKey,
      kind: "stem",
      isActive: true
    })
  )}&limit=1`;

  const resp = await fetch(url, {
    method: "GET",
    headers: getParseHeaders({ useMasterKey: true })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Parse query failed ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  return json.results && json.results.length > 0 ? json.results[0] : null;
}

async function uploadParseFile(filename, audioBuffer) {
  const url = `${PARSE_SERVER_URL}/files/${encodeURIComponent(filename)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: getParseHeaders({
      useMasterKey: true,
      contentType: "audio/mpeg"
    }),
    body: audioBuffer
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Parse file upload failed ${resp.status}: ${text}`);
  }

  return await resp.json(); // { name, url }
}

async function createPersistentStemCache({
  cacheKey,
  caseId,
  text,
  voiceId,
  modelId,
  voiceSettings,
  audioFile,
  byteLength
}) {
  const url = `${PARSE_SERVER_URL}/classes/TTSCache`;

  const body = {
    cacheKey,
    kind: "stem",
    caseId,
    text,
    voiceId,
    modelId,
    voiceSettingsJson: JSON.stringify(voiceSettings),
    contentType: "audio/mpeg",
    byteLength,
    isActive: true,
    audioFile: {
      __type: "File",
      name: audioFile.name
    }
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: getParseHeaders({ useMasterKey: true }),
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Parse TTSCache create failed ${resp.status}: ${text}`);
  }

  return await resp.json();
}

async function downloadPersistentAudio(audioUrl) {
  const resp = await fetch(audioUrl);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Persistent audio download failed ${resp.status}: ${text}`);
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

      // 1. Local disk cache
      if (fs.existsSync(cachePath)) {
        console.log(`Stem local cache hit: ${cacheKey}`);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Cache", "local-hit");
        return fs.createReadStream(cachePath).pipe(res);
      }

      // 2. Persistent Back4App cache
      const persistentCache = await findPersistentStemCache(cacheKey);
      if (persistentCache?.audioFile?.url) {
        console.log(`Stem persistent cache hit: ${cacheKey}`);
        const audioBuffer = await downloadPersistentAudio(persistentCache.audioFile.url);

        // Repopulate local cache
        fs.writeFileSync(cachePath, audioBuffer);

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Cache", "persistent-hit");
        return res.send(audioBuffer);
      }

      // 3. Full miss: generate via ElevenLabs
      console.log(`Stem full cache miss: ${cacheKey}`);
      const audioBuffer = await generateElevenLabsAudio({
        text,
        voiceId,
        modelId,
        voiceSettings
      });

      // Save local cache
      fs.writeFileSync(cachePath, audioBuffer);

      // Save persistent cache
      const filename = `${cacheKey}.mp3`;
      const uploadedFile = await uploadParseFile(filename, audioBuffer);

      await createPersistentStemCache({
        cacheKey,
        caseId,
        text,
        voiceId,
        modelId,
        voiceSettings,
        audioFile: uploadedFile,
        byteLength: audioBuffer.length
      });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-TTS-Cache", "miss");
      return res.send(audioBuffer);
    }

    // Non-stem prompts: no persistent caching yet
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