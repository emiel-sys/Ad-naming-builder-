import { useState } from 'react';
import UploadScreen from './components/UploadScreen';
import AnalysisScreen from './components/AnalysisScreen';
import EditScreen from './components/EditScreen';
import ArchiveScreen from './components/ArchiveScreen';
import './App.css';

const TABS = ['Upload', 'Archive'];

export default function App() {
  const [tab, setTab] = useState('Upload');
  const [screen, setScreen] = useState('upload'); // upload | analysis | edit
  const [uploadData, setUploadData] = useState(null);

  // Lifted state — preserved across analysis ↔ edit navigation
  const [analysis, setAnalysis] = useState(null);             // current (possibly edited) analysis
  const [originalAnalysis, setOriginalAnalysis] = useState(null); // unchanged copy from API
  const [step2Feedback, setStep2Feedback] = useState('');     // free-text feedback when fields edited

  function handleAnalyze(data) {
    // Fresh upload — clear any previous analysis state
    setUploadData(data);
    setAnalysis(null);
    setOriginalAnalysis(null);
    setStep2Feedback('');
    setScreen('analysis');
  }

  function handleResult() {
    // User clicked "Edit & Save" — go to edit screen, keep state
    setScreen('edit');
  }

  function handleBackFromEdit() {
    // Return to analysis view, preserving all edits + feedback
    setScreen('analysis');
  }

  function handleReset() {
    setUploadData(null);
    setAnalysis(null);
    setOriginalAnalysis(null);
    setStep2Feedback('');
    setScreen('upload');
  }

  return (
    <div className="app">
      <div className="app-header-wrap">
        <header className="app-header">
          <div className="logo">
            <span className="logo-icon">B</span>
            <h1>Bridge Static Ads Naming Tool</h1>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={`tab ${tab === t ? 'active' : ''}`}
                onClick={() => {
                  setTab(t);
                  if (t === 'Upload') handleReset();
                }}
              >
                {t}
              </button>
            ))}
          </nav>
        </header>
      </div>

      <main className="app-main">
        {tab === 'Archive' ? (
          <ArchiveScreen />
        ) : screen === 'upload' ? (
          <UploadScreen onAnalyze={handleAnalyze} />
        ) : screen === 'analysis' ? (
          <AnalysisScreen
            uploadData={uploadData}
            analysis={analysis}
            setAnalysis={setAnalysis}
            originalAnalysis={originalAnalysis}
            setOriginalAnalysis={setOriginalAnalysis}
            step2Feedback={step2Feedback}
            setStep2Feedback={setStep2Feedback}
            onResult={handleResult}
            onBack={handleReset}
          />
        ) : screen === 'edit' ? (
          <EditScreen
            result={{
              analysis,
              generatedName: analysis?.step5_generated_name,
              imageDescription: analysis?.step1_image_description,
              confidence: analysis?.step4_confidence,
              imagePreview: uploadData?.preview,
              step2Feedback,
            }}
            onSave={handleReset}
            onBack={handleBackFromEdit}
          />
        ) : null}
      </main>
    </div>
  );
}
