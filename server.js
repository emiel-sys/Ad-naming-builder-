import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Use PostgreSQL when DATABASE_URL is available (production), else fall back to JSON file (local dev)
const USE_DB = !!process.env.DATABASE_URL;
const ARCHIVE_PATH = join(__dirname, 'archive.json'); // local fallback only

let pool;
if (USE_DB) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  // Create table if it doesn't exist yet
  pool.query(`
    CREATE TABLE IF NOT EXISTS archive (
      id        SERIAL PRIMARY KEY,
      image_description TEXT,
      generated_name    TEXT,
      approved_name     TEXT NOT NULL,
      feedback          TEXT,
      image_preview     TEXT,
      content_type      TEXT,
      theme             TEXT,
      saved_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(err => console.error('DB init error:', err.message));
}

const app = express();
if (!isProd) app.use(cors());
app.use(express.json({ limit: '20mb' }));

const client = new Anthropic();

const SYSTEM_PROMPT = `# SYSTEM — Ad Name Builder Agent (Sitly, Static Ads)
## Role
You are the Ad Naming Agent for Sitly. You analyze static advertisement images
and generate the correct name according to the Sitly naming convention. You learn from
the archive of previously approved ads that you receive with each analysis.
---
## Naming Convention
**Format (fixed order, separated by \`-\`):**
asset_type-content_type-theme-sub_theme-asset_variation-message
**Example:**
static-graphic-practical_support-help_tasks-text_graphic_[NEED_HELP]-find_trusted_sitter
**Note about [NEED_HELP]:**
The asset_variation field always ends with a variation_number that the user
fills in themselves. Always generate the name with the literal placeholder [NEED_HELP]
at that position. The app shows this in red so the user knows they need to fill it with a number (1, 2, 3…).
---
## Field Specifications
### 1. asset_type
This field is determined by the user upon upload via a click — not by you.
Valid values: \`static\` | \`static_carousel\`
Take the chosen value 1-to-1 into the name.
### 2. content_type
Valid values (choose exactly one):
\`influencer\` | \`ugc\` | \`ambassador\` | \`graphic\` | \`photo\` | \`inhouse\` | \`stock\`
Rules:
- Recognizable person / creator with their own style → \`influencer\`
- User-generated content, no clear creator identity → \`ugc\`
- Known brand face → \`ambassador\`
- Pure graphic / illustrative, no real person → \`graphic\`
- Stock material → \`stock\`
- Internally produced without clear person → \`inhouse\`
- Real photo of a user or sitter → \`photo\`
### 3. theme
Valid values (choose exactly one):
\`money_related\` | \`emotional_value\` | \`product_feature\` | \`time_related\`
| \`emotional_connection\` | \`practical_support\` | \`product_features\`
Rules:
- Earning or saving money → \`money_related\`
- Feeling, connection, trust (from emotion) → \`emotional_value\`
- Personal bond between parent and sitter → \`emotional_connection\`
- How the platform works → \`product_feature\`
- Time savings or flexibility → \`time_related\`
- Concrete help with daily tasks → \`practical_support\`
### 4. sub_theme
Valid values (choose exactly one):
\`easy_job\` | \`make_money\` | \`flexible_job\` | \`meaningful_job\` | \`fun_job\`
| \`easy_signup\` | \`find_nearby\` | \`me_time\` | \`work_balance\` | \`partner_time\`
| \`help_tasks\` | \`special_skills\` | \`support_system\` | \`building_trust\`
| \`safety_children\` | \`function_1\` | \`function_2\`
Choose the sub_theme that most specifically describes the core of the message
within the chosen theme.
### 5. asset_variation
Format for statics: \`[static_template]_[NEED_HELP]\`
Valid static_template values (choose exactly one based on the image):
\`insight_led\` | \`sitter_profile\` | \`proof_based\` | \`product_mockup\` | \`tear_off_flyer\` | \`photo_outline\` | \`airdrop\` | \`meme\` | \`quote\` | \`parent_concerns\` | \`babysitter_available\` | \`babysitter_wanted\` | \`numbers_first\`
Rules:
- Numbers, statistics, or percentages prominent → \`numbers_first\`
- Sitter profile card with photo and details → \`sitter_profile\`
- Photo with graphic outline or frame → \`photo_outline\`
- Insight, fact, or data-driven angle → \`insight_led\`
- Testimonial, review, or proof → \`proof_based\`
- App or product mockup / screenshot → \`product_mockup\`
- Tear-off flyer style → \`tear_off_flyer\`
- AirDrop notification style → \`airdrop\`
- Meme format → \`meme\`
- Highlighted quote / pull quote → \`quote\`
- Parent concerns / worries angle → \`parent_concerns\`
- "Babysitter available" angle → \`babysitter_available\`
- "Babysitter wanted" angle → \`babysitter_wanted\`
Always generate: [chosen_template]_[NEED_HELP]
Example: \`numbers_first_[NEED_HELP]\`
### 6. message
A short interpretation of the primary message of the ad.
Rules:
- Interpret what the core message is for the target audience (parents or sitters)
- Maximum 4 words
- Lowercase, underscores instead of spaces
- No punctuation
- Examples: \`find_trusted_sitter\`, \`earn_extra_money\`, \`help_with_little_ones\`,
  \`flexible_work_nearby\`, \`safe_childcare_fast\`
---
## Archive (Few-Shot Learning)
You receive a JSON block with previously approved ads from the Sitly archive with each analysis.
Use this archive for:
1. Consistency in message formulation
2. Theme + sub_theme mapping
3. content_type recognition

## User Corrections (Learning from Feedback)
You also receive a \`user_corrections\` array. Each entry shows a case where the user
changed the generated name and explained why. ALWAYS apply these lessons:
- If a correction says "use X instead of Y for this type of ad", apply that rule to similar ads
- Corrections are the strongest signal — they override your default reasoning when applicable
- Look for patterns across corrections to build better judgment
---
## Analysis Steps (show these to the user)
Work through these steps explicitly and visibly:
**Step 1 — Image Description**
Objectively describe what you see in the image: people, text, colors, composition, atmosphere.
**Step 2 — Field Classification**
Determine per field the value + short reason:
- content_type: [value] — [reason]
- theme: [value] — [reason]
- sub_theme: [value] — [reason]
- asset_variation (template part): [value] — [reason]
- message: [value] — [reason]
**Step 3 — Archive Check**
Are there similar ads in the archive?
**Step 4 — Confidence**
Per field indicate: ✅ certain | ⚠️ uncertain
**Step 5 — Output**
Give the generated name in this exact format:
GENERATED NAME:
[asset_type]-[content_type]-[theme]-[sub_theme]-[asset_variation]-[message]
---
## Hard Rules
- Always lowercase in the name
- Always underscores, never spaces
- Never skip a field
- [NEED_HELP] stands always literal in the output, never a number

## IMPORTANT: Answer in JSON
ALWAYS answer in the following JSON format (no markdown, pure JSON):
{
  "step1_image_description": "...",
  "step2_field_classification": {
    "content_type": { "value": "...", "reason": "..." },
    "theme": { "value": "...", "reason": "..." },
    "sub_theme": { "value": "...", "reason": "..." },
    "asset_variation": { "value": "...", "reason": "..." },
    "message": { "value": "...", "reason": "..." }
  },
  "step3_archive_check": "...",
  "step4_confidence": {
    "content_type": { "status": "certain|uncertain", "note": "..." },
    "theme": { "status": "certain|uncertain", "note": "..." },
    "sub_theme": { "status": "certain|uncertain", "note": "..." },
    "asset_variation": { "status": "certain|uncertain", "note": "..." },
    "message": { "status": "certain|uncertain", "note": "..." }
  },
  "step5_generated_name": "..."
}`;

// JSON file fallback (local dev only)
function loadArchiveFile() {
  if (!existsSync(ARCHIVE_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'));
    // Attach array index as id so endpoints work the same way
    return data.map((entry, i) => ({ ...entry, id: i }));
  } catch { return []; }
}

function saveArchiveFile(entries) {
  // Strip the id field (synthetic) before persisting
  const clean = entries.map(({ id, ...rest }) => rest);
  writeFileSync(ARCHIVE_PATH, JSON.stringify(clean, null, 2));
}

// Analyze image
app.post('/api/analyze', async (req, res) => {
  try {
    const { image_base64, media_type, asset_type } = req.body;

    if (!image_base64 || !asset_type) {
      return res.status(400).json({ error: 'Missing image or asset_type' });
    }

    let archive;
    if (USE_DB) {
      const result = await pool.query(
        'SELECT image_description, generated_name, approved_name, feedback, content_type, theme FROM archive ORDER BY saved_at DESC LIMIT 10'
      );
      archive = result.rows;
    } else {
      archive = loadArchiveFile().slice(-10);
    }

    // Strip image_preview and use last 10 entries for context
    const archiveLite = archive.map(({ image_preview, id, ...rest }) => rest);

    // Extract feedback entries where the user corrected the generated name
    const feedbackEntries = archive
      .filter(e => e.feedback && e.generated_name && e.generated_name !== e.approved_name)
      .map(e => ({
        original_name: e.generated_name,
        corrected_name: e.approved_name,
        feedback: e.feedback,
      }));

    const archiveContext = JSON.stringify({ archive: archiveLite, user_corrections: feedbackEntries }, null, 2);

    // Retry helper for rate limits
    async function callWithRetry(maxRetries = 2) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: media_type || 'image/jpeg',
                      data: image_base64,
                    },
                  },
                  {
                    type: 'text',
                    text: `Asset type chosen by user: ${asset_type}\n\nArchive of previously approved ads:\n${archiveContext}\n\nAnalyze this ad image and generate the name.`,
                  },
                ],
              },
            ],
          });
        } catch (err) {
          if (err.status === 429 && attempt < maxRetries) {
            console.log(`Rate limited, waiting 60s before retry ${attempt + 1}...`);
            await new Promise(r => setTimeout(r, 60000));
          } else {
            throw err;
          }
        }
      }
    }

    const response = await callWithRetry();

    const text = response.content[0].text;

    // Try to parse JSON from the response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          parsed = JSON.parse(text.substring(start, end + 1));
        } else {
          throw new Error('Could not parse API response as JSON');
        }
      }
    }

    res.json({ analysis: parsed });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get archive
app.get('/api/archive', async (req, res) => {
  try {
    if (USE_DB) {
      const result = await pool.query('SELECT * FROM archive ORDER BY saved_at ASC');
      return res.json(result.rows);
    }
    res.json(loadArchiveFile());
  } catch (err) {
    console.error('Archive fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save to archive
app.post('/api/archive', async (req, res) => {
  try {
    const { image_description, generated_name, approved_name, feedback, image_preview, content_type, theme } = req.body;
    if (!image_description || !approved_name) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (USE_DB) {
      const result = await pool.query(
        `INSERT INTO archive (image_description, generated_name, approved_name, feedback, image_preview, content_type, theme)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [image_description, generated_name || null, approved_name, feedback || null, image_preview || null, content_type || null, theme || null]
      );
      const count = await pool.query('SELECT COUNT(*) FROM archive');
      return res.json({ success: true, count: parseInt(count.rows[0].count) });
    }
    const archive = loadArchiveFile();
    archive.push({ image_description, generated_name: generated_name || null, approved_name, feedback: feedback || null, image_preview: image_preview || null, content_type: content_type || null, theme: theme || null, saved_at: new Date().toISOString() });
    saveArchiveFile(archive);
    res.json({ success: true, count: archive.length });
  } catch (err) {
    console.error('Archive save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Move archive entry to a different folder (update content_type + theme)
app.patch('/api/archive/:id', async (req, res) => {
  try {
    const { content_type, theme } = req.body;
    if (USE_DB) {
      const result = await pool.query(
        'UPDATE archive SET content_type=$1, theme=$2 WHERE id=$3',
        [content_type || null, theme || null, req.params.id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    const archive = loadArchiveFile();
    const index = parseInt(req.params.id);
    if (isNaN(index) || index < 0 || index >= archive.length) return res.status(404).json({ error: 'Not found' });
    archive[index] = { ...archive[index], content_type: content_type || null, theme: theme || null };
    saveArchiveFile(archive);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete from archive
app.delete('/api/archive/:id', async (req, res) => {
  try {
    if (USE_DB) {
      const result = await pool.query('DELETE FROM archive WHERE id=$1', [req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    const archive = loadArchiveFile();
    const index = parseInt(req.params.id);
    if (index < 0 || index >= archive.length) return res.status(404).json({ error: 'Not found' });
    archive.splice(index, 1);
    saveArchiveFile(archive);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve React build in production
if (isProd) {
  const distPath = join(__dirname, 'dist');
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.use((req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
