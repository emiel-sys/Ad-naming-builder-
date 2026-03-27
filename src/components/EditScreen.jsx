import { useState } from 'react';

export default function EditScreen({ result, onSave, onBack }) {
  const [name, setName] = useState(result.generatedName);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const nameChanged = name !== result.generatedName;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_description: result.imageDescription,
          generated_name: result.generatedName,
          approved_name: name,
          feedback: feedback.trim() || null,
          image_preview: result.imagePreview,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
    } catch (err) {
      alert('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderPreview() {
    const parts = name.split(/(\[[A-Z_]+\])/);
    return parts.map((part, i) =>
      /^\[[A-Z_]+\]$/.test(part)
        ? <span key={i} className="need-help">{part}</span>
        : <span key={i}>{part}</span>
    );
  }

  if (saved) {
    return (
      <div className="edit-screen">
        <div className="save-success">
          <div className="success-icon">✓</div>
          <h2>Saved to Archive</h2>
          <div className="generated-name">{renderPreview()}</div>
          <div className="success-actions">
            <button className="btn-primary" onClick={onBack}>
              Analyze Another Ad
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-screen">
      <h2>Edit & Save</h2>

      <div className="edit-section">
        <label>Image Description (from analysis)</label>
        <p className="description-text">{result.imageDescription}</p>
      </div>

      <div className="edit-section">
        <label>Generated Name</label>
        <div className="name-preview">{renderPreview()}</div>
      </div>

      <div className="edit-section">
        <label htmlFor="name-input">Edit Name</label>
        <input
          id="name-input"
          type="text"
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
        <p className="hint">
          Replace placeholders like <span className="need-help">[VARIATION_NUMBER]</span> or <span className="need-help">[MESSAGE]</span> with actual values before saving.
        </p>
      </div>

      {nameChanged && (
        <div className="edit-section">
          <label htmlFor="feedback-input">Feedback (why did you change the name?)</label>
          <textarea
            id="feedback-input"
            className="feedback-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. 'Changed theme from money_related to emotional_value because the ad focuses on trust, not earnings'"
            rows={3}
          />
          <p className="hint">
            This feedback helps the tool learn and make better suggestions for future ads.
          </p>
        </div>
      )}

      <div className="edit-actions">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button
          className="btn-primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save to Archive'}
        </button>
      </div>
    </div>
  );
}
