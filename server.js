const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const PORT = process.env.PORT || 3000;

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/tts", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(500).json({ error: "Missing ElevenLabs configuration" });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    const elevenResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8
        }
      })
    });

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      return res.status(elevenResp.status).json({ error: errText });
    }

    const audioBuffer = Buffer.from(await elevenResp.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message || "TTS failed" });
  }
});

app.listen(PORT, () => {
  console.log(`TTS server listening on port ${PORT}`);
});