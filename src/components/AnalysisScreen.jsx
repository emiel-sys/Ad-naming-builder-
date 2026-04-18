import { useState, useEffect } from 'react';

const STEP_LABELS = [
  'Image Description',
  'Field Classification',
  'Archive Check',
  'Confidence',
  'Output',
];

// Valid options per field — keep in sync with server.js SYSTEM_PROMPT
const FIELD_OPTIONS = {
  content_type: ['influencer', 'ugc', 'ambassador', 'graphic', 'photo', 'inhouse', 'stock'],
  theme: [
    'money_related', 'emotional_value', 'product_feature', 'time_related',
    'emotional_connection', 'practical_support', 'product_features',
  ],
  sub_theme: [
    'easy_job', 'make_money', 'flexible_job', 'meaningful_job', 'fun_job',
    'easy_signup', 'find_nearby', 'me_time', 'work_balance', 'partner_time',
    'help_tasks', 'special_skills', 'support_system', 'building_trust',
    'safety_children', 'function_1', 'function_2',
  ],
  // asset_variation uses a static_template + _[NEED_HELP] suffix
  asset_variation: [
    'insight_led', 'sitter_profile', 'proof_based', 'product_mockup',
    'tear_off_flyer', 'photo_outline', 'airdrop', 'meme', 'quote',
    'parent_concerns', 'babysitter_available', 'babysitter_wanted',
    'numbers_first',
  ],
};

const NEED_HELP = '[VARIATION_NUMBER]';

// Strip the _[VARIATION_NUMBER] suffix to show clean template name in the dropdown
function stripVariationSuffix(value) {
  if (!value) return '';
  return value.replace(/_\[VARIATION_NUMBER\]$/, '').replace(/_\[NEED_HELP\]$/, '').replace(/_\d+$/, '');
}

function buildVariationValue(template) {
  if (!template) return '';
  return `${template}_${NEED_HELP}`;
}

function ConfidenceBadge({ status }) {
  return status === 'certain'
    ? <span className="badge badge-ok">✅ Certain</span>
    : <span className="badge badge-warn">⚠️ Uncertain</span>;
}

// Rebuild the generated name from the (possibly edited) field classification
function buildGeneratedName(assetType, fields) {
  const parts = [
    assetType,
    fields?.content_type?.value,
    fields?.theme?.value,
    fields?.sub_theme?.value,
    fields?.asset_variation?.value,
    fields?.message?.value,
  ].filter(Boolean);
  return parts.join('-');
}

export default function AnalysisScreen({
  uploadData,
  analysis,
  setAnalysis,
  originalAnalysis,
  setOriginalAnalysis,
  step2Feedback,
  setStep2Feedback,
  onResult,
  onBack,
}) {
  const [loading, setLoading] = useState(!analysis);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(analysis ? 4 : 0);

  useEffect(() => {
    // If we already have an analysis (e.g. user came back from Edit), skip the API call
    if (analysis) {
      setLoading(false);
      setActiveStep(4);
      return;
    }

    let cancelled = false;

    async function analyze() {
      try {
        for (let i = 0; i < 4; i++) {
          if (cancelled) return;
          setActiveStep(i);
          await new Promise((r) => setTimeout(r, 600));
        }

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: uploadData.image_base64,
            media_type: uploadData.media_type,
            asset_type: uploadData.asset_type,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Analysis failed');
        }

        const data = await res.json();
        if (!cancelled) {
          setAnalysis(data.analysis);
          // Deep-clone so originalAnalysis stays immutable for diff comparison
          setOriginalAnalysis(JSON.parse(JSON.stringify(data.analysis)));
          setActiveStep(4);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    analyze();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadData]);

  // Update a single Step 2 field — also recompute the generated name
  function updateField(fieldName, newValue) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        step2_field_classification: {
          ...prev.step2_field_classification,
          [fieldName]: {
            ...prev.step2_field_classification[fieldName],
            value: newValue,
          },
        },
      };
      next.step5_generated_name = buildGeneratedName(
        uploadData.asset_type,
        next.step2_field_classification
      );
      return next;
    });
  }

  // Detect whether any Step 2 field has been changed compared to the original AI output
  function hasFieldChanges() {
    if (!analysis || !originalAnalysis) return false;
    const cur = analysis.step2_field_classification || {};
    const orig = originalAnalysis.step2_field_classification || {};
    return Object.keys(cur).some((k) => cur[k]?.value !== orig[k]?.value);
  }

  // Build a human-readable summary of which fields changed (for the feedback hint)
  function changeSummary() {
    if (!analysis || !originalAnalysis) return [];
    const cur = analysis.step2_field_classification || {};
    const orig = originalAnalysis.step2_field_classification || {};
    return Object.keys(cur)
      .filter((k) => cur[k]?.value !== orig[k]?.value)
      .map((k) => ({ field: k, from: orig[k]?.value, to: cur[k]?.value }));
  }

  if (error) {
    return (
      <div className="analysis-screen">
        <div className="error-box">
          <h3>Analysis Error</h3>
          <p>{error}</p>
          <button className="btn-secondary" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  const fieldsChanged = hasFieldChanges();
  const changes = changeSummary();

  return (
    <div className="analysis-screen">
      <div className="analysis-layout">
        <div className="analysis-image">
          <img src={uploadData.preview} alt="Ad being analyzed" />
        </div>

        <div className="analysis-steps">
          <h2>Analysis</h2>

          <div className="step-progress">
            {STEP_LABELS.map((label, i) => (
              <div
                key={i}
                className={`step-item ${i < activeStep ? 'done' : ''} ${i === activeStep ? 'active' : ''}`}
              >
                <div className="step-number">{i + 1}</div>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {loading && (
            <div className="loading-indicator">
              <div className="spinner" />
              <p>Analyzing image with AI...</p>
            </div>
          )}

          {analysis && (
            <div className="analysis-results">
              <div className="step-card">
                <h3>Step 1 — Image Description</h3>
                <p>{analysis.step1_image_description}</p>
              </div>

              <div className="step-card">
                <h3>Step 2 — Field Classification</h3>
                <p className="step-hint">Click any value to override the AI's choice.</p>
                <table className="field-table">
                  <thead>
                    <tr><th>Field</th><th>Value</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(analysis.step2_field_classification).map(([field, data]) => {
                      const origValue = originalAnalysis?.step2_field_classification?.[field]?.value;
                      const isChanged = origValue !== undefined && origValue !== data.value;
                      const options = FIELD_OPTIONS[field];

                      return (
                        <tr key={field} className={isChanged ? 'row-changed' : ''}>
                          <td className="field-name">{field}</td>
                          <td>
                            {field === 'asset_variation' && options ? (
                              <select
                                className={`field-select ${isChanged ? 'changed' : ''}`}
                                value={stripVariationSuffix(data.value)}
                                onChange={(e) => updateField(field, buildVariationValue(e.target.value))}
                              >
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}_[VARIATION_NUMBER]</option>
                                ))}
                              </select>
                            ) : options ? (
                              <select
                                className={`field-select ${isChanged ? 'changed' : ''}`}
                                value={data.value || ''}
                                onChange={(e) => updateField(field, e.target.value)}
                              >
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              // Free-text fields (message)
                              <input
                                type="text"
                                className={`field-input ${isChanged ? 'changed' : ''}`}
                                value={data.value || ''}
                                onChange={(e) => updateField(field, e.target.value)}
                                spellCheck={false}
                              />
                            )}
                            {isChanged && (
                              <span className="changed-marker" title={`AI suggested: ${origValue}`}>
                                ✎ changed
                              </span>
                            )}
                          </td>
                          <td>{data.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Feedback box — appears only when fields are edited */}
              {fieldsChanged && (
                <div className="step-card step-card-feedback">
                  <h3>Feedback — help the AI learn</h3>
                  <p className="step-hint">
                    {changes.length === 1
                      ? <>You changed <strong>{changes[0].field}</strong> from <code>{changes[0].from}</code> to <code>{changes[0].to}</code>.</>
                      : <>You changed {changes.length} fields: {changes.map((c, i) => (
                          <span key={c.field}>
                            {i > 0 && ', '}
                            <strong>{c.field}</strong> (<code>{c.from}</code> → <code>{c.to}</code>)
                          </span>
                        ))}.</>
                    }
                  </p>
                  <textarea
                    className="feedback-input"
                    value={step2Feedback}
                    onChange={(e) => setStep2Feedback(e.target.value)}
                    placeholder="Explain what & why you adjusted — e.g. 'theme should be emotional_value because the ad highlights trust, not earnings'"
                    rows={3}
                  />
                  <p className="hint">
                    The AI uses this feedback to make better suggestions for future ads.
                  </p>
                </div>
              )}

              <div className="step-card">
                <h3>Step 3 — Archive Check</h3>
                <p>{analysis.step3_archive_check}</p>
              </div>

              <div className="step-card">
                <h3>Step 4 — Confidence</h3>
                <div className="confidence-grid">
                  {Object.entries(analysis.step4_confidence).map(([field, data]) => (
                    <div key={field} className="confidence-item">
                      <span className="field-name">{field}</span>
                      <ConfidenceBadge status={data.status} />
                      {data.note && <span className="confidence-note">{data.note}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="step-card step-card-output">
                <h3>Step 5 — Generated Name</h3>
                <GeneratedName name={analysis.step5_generated_name} />
              </div>

              <div className="analysis-actions">
                <button className="btn-secondary" onClick={onBack}>Back</button>
                <button
                  className="btn-primary"
                  onClick={onResult}
                >
                  Edit & Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratedName({ name }) {
  if (!name) return null;

  const parts = name.split(/(\[[A-Z_]+\])/);
  return (
    <div className="generated-name">
      {parts.map((part, i) =>
        /^\[[A-Z_]+\]$/.test(part)
          ? <span key={i} className="need-help">{part}</span>
          : <span key={i}>{part}</span>
      )}
    </div>
  );
}
