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

console.log("PARSE_APP_ID exists:", !!PARSE_APP_ID);
console.log("PARSE_REST_API_KEY exists:", !!PARSE_REST_API_KEY);
console.log("PARSE_MASTER_KEY exists:", !!PARSE_MASTER_KEY);
console.log("PARSE_SERVER_URL:", PARSE_SERVER_URL);

const STEM_CACHE_DIR = path.join(process.cwd(), "cache", "stems");
fs.mkdirSync(STEM_CACHE_DIR, { recursive: true });

// Medical-grade TTS normalization
const MEDICAL_ABBREVIATIONS = {
  // Vital signs and measurements
  'BP': 'blood pressure',
  'HR': 'heart rate',
  'RR': 'respiratory rate',
  'SBP': 'systolic blood pressure',
  'DBP': 'diastolic blood pressure',
  'MAP': 'mean arterial pressure',
  'SpO2': 'oxygen saturation',
  'SaO2': 'arterial oxygen saturation',
  'SvO2': 'venous oxygen saturation',
  'PaO2': 'partial pressure of oxygen',
  'PaCO2': 'partial pressure of carbon dioxide',
  'HCO3': 'bicarbonate',
  'BE': 'base excess',
  'FiO2': 'fraction of inspired oxygen',

  // Labs
  'WBC': 'white blood cell count',
  'RBC': 'red blood cell count',
  'Hgb': 'hemoglobin',
  'Hct': 'hematocrit',
  'Plt': 'platelet count',
  'MCV': 'mean corpuscular volume',
  'MCH': 'mean corpuscular hemoglobin',
  'MCHC': 'mean corpuscular hemoglobin concentration',
  'RDW': 'red cell distribution width',
  'Na': 'sodium',
  'K': 'potassium',
  'Cl': 'chloride',
  'CO2': 'carbon dioxide',
  'BUN': 'blood urea nitrogen',
  'Cr': 'creatinine',
  'Glu': 'glucose',
  'Ca': 'calcium',
  'Mg': 'magnesium',
  'Phos': 'phosphate',
  'Alb': 'albumin',
  'Tbil': 'total bilirubin',
  'Dbil': 'direct bilirubin',
  'AST': 'aspartate aminotransferase',
  'ALT': 'alanine aminotransferase',
  'ALP': 'alkaline phosphatase',
  'GGT': 'gamma-glutamyl transferase',
  'LDH': 'lactate dehydrogenase',
  'CK': 'creatine kinase',
  'Troponin': 'troponin',
  'BNP': 'brain natriuretic peptide',
  'NT-proBNP': 'N-terminal pro-brain natriuretic peptide',
  'CRP': 'C-reactive protein',
  'ESR': 'erythrocyte sedimentation rate',
  'PT': 'prothrombin time',
  'INR': 'international normalized ratio',
  'PTT': 'partial thromboplastin time',
  'Fibrinogen': 'fibrinogen',
  'D-dimer': 'D-dimer',

  // Imaging and procedures
  'CT': 'computed tomography',
  'MRI': 'magnetic resonance imaging',
  'US': 'ultrasound',
  'ECHO': 'echocardiogram',
  'ECG': 'electrocardiogram',
  'EKG': 'electrocardiogram',
  'TEE': 'transesophageal echocardiogram',
  'TTE': 'transthoracic echocardiogram',
  'CXR': 'chest X-ray',
  'ABG': 'arterial blood gas',
  'VBG': 'venous blood gas',
  'CBC': 'complete blood count',
  'CMP': 'comprehensive metabolic panel',
  'LFT': 'liver function test',
  'UA': 'urinalysis',
  'CSF': 'cerebrospinal fluid',

  // Medications and units
  'mg': 'milligrams',
  'mcg': 'micrograms',
  'g': 'grams',
  'mL': 'milliliters',
  'L': 'liters',
  'IU': 'international units',
  'U': 'units',
  'PO': 'by mouth',
  'IV': 'intravenous',
  'IM': 'intramuscular',
  'SC': 'subcutaneous',
  'PR': 'per rectum',
  'SL': 'sublingual',
  'TID': 'three times daily',
  'BID': 'twice daily',
  'QID': 'four times daily',
  'QD': 'once daily',
  'QHS': 'at bedtime',
  'PRN': 'as needed',

  // Common medical terms
  'MI': 'myocardial infarction',
  'CHF': 'congestive heart failure',
  'COPD': 'chronic obstructive pulmonary disease',
  'PNA': 'pneumonia',
  'UTI': 'urinary tract infection',
  'DVT': 'deep vein thrombosis',
  'PE': 'pulmonary embolism',
  'ARDS': 'acute respiratory distress syndrome',
  'SIRS': 'systemic inflammatory response syndrome',
  'MODS': 'multiple organ dysfunction syndrome',
  'AKI': 'acute kidney injury',
  'CKD': 'chronic kidney disease',
  'DM': 'diabetes mellitus',
  'HTN': 'hypertension',
  'CAD': 'coronary artery disease',
  'PAD': 'peripheral artery disease',
  'CVA': 'cerebrovascular accident',
  'TIA': 'transient ischemic attack',
  'AF': 'atrial fibrillation',
  'VT': 'ventricular tachycardia',
  'VF': 'ventricular fibrillation',
  'SVT': 'supraventricular tachycardia',
  'AV': 'atrioventricular',
  'SA': 'sinoatrial',
  'LV': 'left ventricle',
  'RV': 'right ventricle',
  'LA': 'left atrium',
  'RA': 'right atrium',
  'Ao': 'aorta',
  'PA': 'pulmonary artery',
  'SVC': 'superior vena cava',
  'IVC': 'inferior vena cava',
  'RVOT': 'right ventricular outflow tract',
  'LVOT': 'left ventricular outflow tract',
};

const NUMBER_PATTERNS = [
  // Blood pressure: 120/80 -> one twenty over eighty
  { regex: /(\d{2,3})\/(\d{2,3})/g, replacement: (match, sys, dia) => `${numberToWords(sys)} over ${numberToWords(dia)}` },

  // Fractions: 1/2 -> one half
  { regex: /(\d+)\/(\d+)/g, replacement: (match, num, den) => `${numberToWords(num)} ${fractionToWords(den)}` },

  // Ranges: 100-200 -> one hundred to two hundred
  { regex: /(\d+)-(\d+)/g, replacement: (match, start, end) => `${numberToWords(start)} to ${numberToWords(end)}` },

  // Decimals: 12.5 -> twelve point five
  { regex: /(\d+)\.(\d+)/g, replacement: (match, whole, decimal) => `${numberToWords(whole)} point ${decimal.split('').map(d => numberToWords(d)).join(' ')}` },

  // Percentages: 95% -> ninety five percent
  { regex: /(\d+)%/g, replacement: (match, num) => `${numberToWords(num)} percent` },

  // Temperatures: 98.6F -> ninety eight point six degrees Fahrenheit
  { regex: /(\d+(?:\.\d+)?)([CF])/gi, replacement: (match, temp, unit) => `${numberToWords(temp)} degrees ${unit.toUpperCase() === 'C' ? 'Celsius' : 'Fahrenheit'}` },
];

function numberToWords(num) {
  const words = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion'];

  if (num === 0) return 'zero';
  if (num < 20) return words[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + words[num % 10] : '');
  if (num < 1000) return words[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  for (let i = 0; i < scales.length; i++) {
    const scale = Math.pow(1000, i + 1);
    if (num < scale * 1000) {
      return numberToWords(Math.floor(num / scale)) + ' ' + scales[i] + (num % scale ? ' ' + numberToWords(num % scale) : '');
    }
  }
  return num.toString();
}

function fractionToWords(den) {
  const fractions = {
    2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth'
  };
  return fractions[den] || `over ${numberToWords(den)}`;
}

function normalizeMedicalAbbreviations(text) {
  let normalized = text;
  for (const [abbr, full] of Object.entries(MEDICAL_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    normalized = normalized.replace(regex, full);
  }
  return normalized;
}

function normalizeNumbers(text) {
  let normalized = text;
  for (const pattern of NUMBER_PATTERNS) {
    normalized = normalized.replace(pattern.regex, pattern.replacement);
  }
  return normalized;
}

function normalizeForTTS(text) {
  if (!text) return '';

  let normalized = text;

  // Normalize medical abbreviations
  normalized = normalizeMedicalAbbreviations(normalized);

  // Normalize numbers and measurements
  normalized = normalizeNumbers(normalized);

  // Handle common punctuation for better TTS
  normalized = normalized.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 over $2'); // Ensure BP format
  normalized = normalized.replace(/(\w+)\s*-\s*(\w+)/g, '$1 $2'); // Hyphenated terms
  normalized = normalized.replace(/(\w+)\s*\.\s*(\w+)/g, '$1 $2'); // Abbreviations with periods

  // Clean up extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

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
  console.log("[TTS persistent cache lookup]", {
    cacheKey,
    kind: "stem",
    isActive: true
  });

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
    console.log("[TTS persistent cache result] lookup-error", {
      cacheKey,
      status: resp.status,
      responseText: text
    });
    throw new Error(`Parse query failed ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  const result = json.results && json.results.length > 0 ? json.results[0] : null;

  console.log("[TTS persistent cache result]", {
    cacheKey,
    hit: !!result,
    objectId: result?.objectId || null,
    hasAudioFile: !!result?.audioFile?.url,
    resultCount: json.results?.length || 0
  });

  return result;
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
  rawText,
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
    rawText,
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

app.get("/parse-healthz", async (req, res) => {
  try {
    const cacheKey = String(req.query.cacheKey || "").trim();
    const caseId = String(req.query.caseId || "").trim();

    let query = "limit=1&order=-createdAt";

    if (cacheKey) {
      query = `where=${encodeURIComponent(
        JSON.stringify({ cacheKey })
      )}&limit=5`;
    } else if (caseId) {
      query = `where=${encodeURIComponent(
        JSON.stringify({ caseId, kind: "stem" })
      )}&limit=5`;
    }

    const url = `${PARSE_SERVER_URL}/classes/TTSCache?${query}`;

    console.log("[parse-healthz query]", {
      cacheKey: cacheKey || null,
      caseId: caseId || null,
      url
    });

    const resp = await fetch(url, {
      method: "GET",
      headers: getParseHeaders({ useMasterKey: true })
    });

    const responseText = await resp.text();

    res.status(resp.ok ? 200 : resp.status).json({
      ok: resp.ok,
      status: resp.status,
      query: {
        cacheKey: cacheKey || null,
        caseId: caseId || null
      },
      responseText
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Parse connectivity failed"
    });
  }
});

app.post("/tts", async (req, res) => {
  try {
    const rawText = String(req.body.text || "").trim();
    const text = normalizeForTTS(rawText);
    const kind = String(req.body.kind || "prompt").trim();
    const caseId = String(req.body.caseId || "").trim();
    const voiceId = String(req.body.voiceId || DEFAULT_VOICE_ID || "").trim();
    const modelId = ELEVENLABS_MODEL_ID;
    const voiceSettings = getVoiceSettings();

    if (!rawText) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
    }

    if (!voiceId) {
      return res.status(500).json({ error: "Missing voiceId / ELEVENLABS_VOICE_ID" });
    }

    console.log("[TTS request]", {
      kind,
      caseId,
      voiceId,
      modelId,
      rawPrefix: rawText.slice(0, 120),
      normalizedPrefix: text.slice(0, 120)
    });

    // Cache only stem audio
    if (kind === "stem") {
      if (!caseId) {
        return res.status(400).json({ error: "Missing caseId for stem caching" });
      }

      const cacheKey = buildStemCacheKey({
        caseId,
        text, // Use normalized text for cache key
        voiceId,
        modelId,
        voiceSettings
      });

      const cachePath = getStemCachePath(cacheKey);

      console.log("[TTS stem cache key]", {
        caseId,
        kind,
        cacheKey,
        cachePath,
        voiceId,
        modelId,
        voiceSettings,
        normalizedTextLength: text.length
      });

      // 1. Local disk cache
      if (fs.existsSync(cachePath)) {
        console.log("[TTS local cache hit]", { cacheKey, cachePath });
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Cache", "local-hit");
        return fs.createReadStream(cachePath).pipe(res);
      }

      // 2. Persistent Back4App cache
      let persistentCache = null;
      try {
        persistentCache = await findPersistentStemCache(cacheKey);
      } catch (error) {
        console.warn(`Persistent cache lookup failed for ${cacheKey}:`, error.message || error);
      }

      if (persistentCache?.audioFile?.url) {
        try {
          console.log("[TTS persistent cache hit]", {
            cacheKey,
            objectId: persistentCache.objectId,
            audioUrl: persistentCache.audioFile.url
          });
          const audioBuffer = await downloadPersistentAudio(persistentCache.audioFile.url);

          // Repopulate local cache
          fs.writeFileSync(cachePath, audioBuffer);

          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("X-TTS-Cache", "persistent-hit");
          return res.send(audioBuffer);
        } catch (error) {
          console.warn(`Persistent audio download failed for ${cacheKey}:`, error.message || error);
        }
      }

      // 3. Full miss: generate via ElevenLabs
      console.log("[TTS full cache miss]", {
        cacheKey,
        caseId,
        kind,
        rawPrefix: rawText.slice(0, 120),
        normalizedPrefix: text.slice(0, 120)
      });
      const audioBuffer = await generateElevenLabsAudio({
        text,
        voiceId,
        modelId,
        voiceSettings
      });

      // Save local cache
      fs.writeFileSync(cachePath, audioBuffer);

      // Save persistent cache
      try {
        const filename = `${cacheKey}.mp3`;
        const uploadedFile = await uploadParseFile(filename, audioBuffer);

        const createdCache = await createPersistentStemCache({
          cacheKey,
          caseId,
          rawText,
          text,
          voiceId,
          modelId,
          voiceSettings,
          audioFile: uploadedFile,
          byteLength: audioBuffer.length
        });

        console.log("[TTS persistent cache saved]", {
          cacheKey,
          objectId: createdCache.objectId,
          fileName: uploadedFile.name,
          byteLength: audioBuffer.length
        });
      } catch (error) {
        console.warn(`Persistent cache save failed for ${cacheKey}:`, error.message || error);
      }

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