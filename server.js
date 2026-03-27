import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = join(__dirname, 'archive.json');
const isProd = process.env.NODE_ENV === 'production';

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
\`text_graphic\` | \`sitter_profile\` | \`photo_outline\` | \`sitter_photo\`
Rules:
- Primarily text on graphic background → \`text_graphic\`
- Sitter profile card with photo and details → \`sitter_profile\`
- Photo with graphic outline or frame → \`photo_outline\`
- Single photo of a sitter, minimal graphic elements → \`sitter_photo\`
Always generate: [chosen_template]_[NEED_HELP]
Example: \`text_graphic_[NEED_HELP]\`
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

function loadArchive() {
  if (!existsSync(ARCHIVE_PATH)) return [];
  try {
    return JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveArchive(archive) {
  writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
}

// Analyze image
app.post('/api/analyze', async (req, res) => {
  try {
    const { image_base64, media_type, asset_type } = req.body;

    if (!image_base64 || !asset_type) {
      return res.status(400).json({ error: 'Missing image or asset_type' });
    }

    const archive = loadArchive();
    // Strip image_preview and limit to last 10 entries to save tokens
    const archiveLite = archive
      .slice(-10)
      .map(({ image_preview, ...rest }) => rest);

    // Extract feedback entries where the user corrected the generated name
    const feedbackEntries = archive
      .filter(e => e.feedback && e.generated_name && e.generated_name !== e.approved_name)
      .slice(-10)
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
app.get('/api/archive', (req, res) => {
  res.json(loadArchive());
});

// Save to archive
app.post('/api/archive', (req, res) => {
  const { image_description, generated_name, approved_name, feedback, image_preview } = req.body;
  if (!image_description || !approved_name) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const archive = loadArchive();
  archive.push({
    image_description,
    generated_name: generated_name || null,
    approved_name,
    feedback: feedback || null,
    image_preview: image_preview || null,
    saved_at: new Date().toISOString(),
  });
  saveArchive(archive);
  res.json({ success: true, count: archive.length });
});

// Delete from archive
app.delete('/api/archive/:index', (req, res) => {
  const archive = loadArchive();
  const index = parseInt(req.params.index);
  if (index < 0 || index >= archive.length) {
    return res.status(404).json({ error: 'Not found' });
  }
  archive.splice(index, 1);
  saveArchive(archive);
  res.json({ success: true });
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
