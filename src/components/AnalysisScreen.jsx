import { useState, useEffect } from 'react';

const STEP_LABELS = [
  'Image Description',
  'Field Classification',
  'Archive Check',
  'Confidence',
  'Output',
];

function ConfidenceBadge({ status }) {
  return status === 'certain'
    ? <span className="badge badge-ok">✅ Certain</span>
    : <span className="badge badge-warn">⚠️ Uncertain</span>;
}

export default function AnalysisScreen({ uploadData, onResult, onBack }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
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
  }, [uploadData]);

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
                <table className="field-table">
                  <thead>
                    <tr><th>Field</th><th>Value</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(analysis.step2_field_classification).map(([field, data]) => (
                      <tr key={field}>
                        <td className="field-name">{field}</td>
                        <td><code>{data.value}</code></td>
                        <td>{data.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                <GeneratedName name={analysis.step5_generated_name} confidence={analysis.step4_confidence} />
              </div>

              <div className="analysis-actions">
                <button className="btn-secondary" onClick={onBack}>Back</button>
                <button
                  className="btn-primary"
                  onClick={() => onResult({
                    analysis,
                    generatedName: analysis.step5_generated_name,
                    imageDescription: analysis.step1_image_description,
                    confidence: analysis.step4_confidence,
                    imagePreview: uploadData.preview,
                  })}
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

function GeneratedName({ name, confidence }) {
  if (!name) return null;

  // Replace [NEED_HELP] with specific field names based on confidence
  let displayName = name;

  // Check which fields are uncertain and replace accordingly
  if (confidence) {
    // If asset_variation is uncertain, replace [NEED_HELP] with [VARIATION_NUMBER]
    if (confidence.asset_variation?.status === 'uncertain') {
      displayName = displayName.replace('[NEED_HELP]', '[VARIATION_NUMBER]');
    }
    // If message is uncertain, replace message part with [MESSAGE]
    if (confidence.message?.status === 'uncertain') {
      const parts = displayName.split('-');
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        if (lastPart !== '[MESSAGE]' && !lastPart.includes('[')) {
          parts[parts.length - 1] = '[MESSAGE]';
          displayName = parts.join('-');
        }
      }
    }
  }

  // Default: replace [NEED_HELP] with [VARIATION_NUMBER]
  if (displayName.includes('[NEED_HELP]')) {
    displayName = displayName.replace('[NEED_HELP]', '[VARIATION_NUMBER]');
  }

  const parts = displayName.split(/(\[[A-Z_]+\])/);
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
