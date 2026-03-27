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
  const [analysisResult, setAnalysisResult] = useState(null);

  function handleAnalyze(data) {
    setUploadData(data);
    setScreen('analysis');
  }

  function handleResult(result) {
    setAnalysisResult(result);
    setScreen('edit');
  }

  function handleReset() {
    setUploadData(null);
    setAnalysisResult(null);
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
            onResult={handleResult}
            onBack={handleReset}
          />
        ) : screen === 'edit' ? (
          <EditScreen
            result={analysisResult}
            onSave={() => {}}
            onBack={handleReset}
          />
        ) : null}
      </main>
    </div>
  );
}
