import { useState, useEffect, useMemo } from 'react';

const CONTENT_TYPES = ['influencer', 'ugc', 'ambassador', 'graphic', 'photo', 'inhouse', 'stock'];
const THEMES = [
  'money_related', 'emotional_value', 'product_feature', 'time_related',
  'emotional_connection', 'practical_support', 'product_features',
];

function getEntryContentType(entry) {
  if (entry.content_type && CONTENT_TYPES.includes(entry.content_type)) return entry.content_type;
  const parts = (entry.approved_name || '').split('-');
  return CONTENT_TYPES.includes(parts[1]) ? parts[1] : null;
}

function getEntryTheme(entry) {
  if (entry.theme && THEMES.includes(entry.theme)) return entry.theme;
  const parts = (entry.approved_name || '').split('-');
  return THEMES.includes(parts[2]) ? parts[2] : null;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ArchiveScreen() {
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null); // null=All | 'not_found' | { ct, theme }
  const [expandedCT, setExpandedCT] = useState({});
  const [search, setSearch] = useState('');
  const [movingIndex, setMovingIndex] = useState(null);
  const [moveValues, setMoveValues] = useState({ content_type: '', theme: '' });

  useEffect(() => { fetchArchive(); }, []);

  async function fetchArchive() {
    setLoading(true);
    try {
      const res = await fetch('/api/archive');
      if (res.ok) setArchive(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleDelete(origIndex) {
    if (!confirm('Delete this entry?')) return;
    try {
      await fetch(`/api/archive/${origIndex}`, { method: 'DELETE' });
      fetchArchive();
    } catch { /* ignore */ }
  }

  async function handleMove() {
    if (!moveValues.content_type) return;
    try {
      await fetch(`/api/archive/${movingIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moveValues),
      });
      setMovingIndex(null);
      fetchArchive();
    } catch { /* ignore */ }
  }

  // Build sidebar folder counts from archive
  const folderData = useMemo(() => {
    const byCT = {};
    let notFound = 0;
    archive.forEach(entry => {
      const ct = getEntryContentType(entry);
      const th = getEntryTheme(entry);
      if (!ct) { notFound++; return; }
      if (!byCT[ct]) byCT[ct] = { total: 0, themes: {} };
      byCT[ct].total++;
      if (th) byCT[ct].themes[th] = (byCT[ct].themes[th] || 0) + 1;
    });
    return { byCT, notFound };
  }, [archive]);

  // Filter entries based on selected folder + search query
  const displayedEntries = useMemo(() => {
    // id comes from the DB (serial) or is injected as array index in local fallback
    let entries = archive.map((e, i) => ({ ...e, id: e.id ?? i }));

    if (selectedFolder === 'not_found') {
      entries = entries.filter(e => !getEntryContentType(e));
    } else if (selectedFolder?.ct) {
      entries = entries.filter(e => {
        const ct = getEntryContentType(e);
        if (ct !== selectedFolder.ct) return false;
        if (selectedFolder.theme) return getEntryTheme(e) === selectedFolder.theme;
        return true;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      entries = entries.filter(e =>
        (e.approved_name || '').toLowerCase().includes(q) ||
        (e.image_description || '').toLowerCase().includes(q)
      );
    }

    return [...entries].reverse(); // newest first
  }, [archive, selectedFolder, search]);

  function selectCT(ct) {
    setSelectedFolder({ ct, theme: null });
    setExpandedCT(prev => ({
      ...prev,
      [ct]: selectedFolder?.ct !== ct ? true : !prev[ct],
    }));
    setSearch('');
  }

  function selectTheme(ct, theme) {
    setSelectedFolder({ ct, theme });
    setSearch('');
  }

  function selectAll() {
    setSelectedFolder(null);
    setSearch('');
  }

  function folderTitle() {
    if (!selectedFolder) return 'All';
    if (selectedFolder === 'not_found') return 'Not found';
    if (selectedFolder.theme) return `${selectedFolder.ct} / ${selectedFolder.theme}`;
    return selectedFolder.ct;
  }

  if (loading) {
    return (
      <div className="archive-layout">
        <div className="loading-indicator"><div className="spinner" /><p>Loading archive…</p></div>
      </div>
    );
  }

  return (
    <div className="archive-layout">

      {/* ── Sidebar ── */}
      <aside className="archive-sidebar">
        <div
          className={`sidebar-row sidebar-all ${!selectedFolder ? 'active' : ''}`}
          onClick={selectAll}
        >
          <span className="sidebar-label">All</span>
          <span className="sidebar-count">{archive.length}</span>
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Content type</div>

        {CONTENT_TYPES.map(ct => {
          const ctData = folderData.byCT[ct];
          const count = ctData?.total || 0;
          const isExpanded = expandedCT[ct];
          const isCTActive = selectedFolder?.ct === ct && !selectedFolder?.theme;

          return (
            <div key={ct}>
              <div
                className={`sidebar-row sidebar-ct ${isCTActive ? 'active' : ''} ${count === 0 ? 'disabled' : ''}`}
                onClick={() => count > 0 && selectCT(ct)}
              >
                <span className={`sidebar-chevron ${isExpanded ? 'open' : ''}`}>›</span>
                <span className="sidebar-label">{ct}</span>
                {count > 0 && <span className="sidebar-count">{count}</span>}
              </div>

              {isExpanded && ctData && Object.entries(ctData.themes).sort().map(([theme, thCount]) => (
                <div
                  key={theme}
                  className={`sidebar-row sidebar-theme-row ${selectedFolder?.ct === ct && selectedFolder?.theme === theme ? 'active' : ''}`}
                  onClick={() => selectTheme(ct, theme)}
                >
                  <span className="sidebar-label">{theme}</span>
                  <span className="sidebar-count">{thCount}</span>
                </div>
              ))}
            </div>
          );
        })}

        {folderData.notFound > 0 && (
          <>
            <div className="sidebar-divider" />
            <div
              className={`sidebar-row sidebar-notfound ${selectedFolder === 'not_found' ? 'active' : ''}`}
              onClick={() => { setSelectedFolder('not_found'); setSearch(''); }}
            >
              <span className="sidebar-label">Not found</span>
              <span className="sidebar-count">{folderData.notFound}</span>
            </div>
          </>
        )}
      </aside>

      {/* ── Main content ── */}
      <div className="archive-main">
        <div className="archive-topbar">
          <div>
            <h2 className="archive-folder-title">{folderTitle()}</h2>
            <p className="archive-count">
              {displayedEntries.length} ad{displayedEntries.length !== 1 ? 's' : ''}
            </p>
          </div>
          <input
            type="text"
            className="archive-search-input"
            placeholder="🔍  Search name or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {displayedEntries.length === 0 ? (
          <div className="empty-state">
            <p>{search ? 'No results for your search.' : 'No ads in this folder.'}</p>
          </div>
        ) : (
          <div className="archive-list">
            {displayedEntries.map(entry => (
              <div key={entry.id} className="archive-entry">
                <div className="entry-thumb">
                  {entry.image_preview
                    ? <img src={entry.image_preview} alt="Ad thumbnail" />
                    : <div className="thumb-empty" />
                  }
                </div>

                <div className="entry-body">
                  <code className="entry-name">{entry.approved_name}</code>
                  <p className="entry-desc">{entry.image_description}</p>
                  {entry.feedback && <p className="entry-feedback">💬 {entry.feedback}</p>}
                </div>

                <div className="entry-meta">
                  <span className="entry-date">{formatDate(entry.saved_at)}</span>
                  <div className="entry-actions">
                    <button
                      className="btn-move"
                      onClick={() => {
                        setMovingIndex(entry.id);
                        setMoveValues({
                          content_type: getEntryContentType(entry) || '',
                          theme: getEntryTheme(entry) || '',
                        });
                      }}
                    >
                      Move
                    </button>
                    <button className="btn-delete" onClick={() => handleDelete(entry.id)}>×</button>
                  </div>
                </div>

                {movingIndex === entry.id && (
                  <div className="move-panel">
                    <select
                      value={moveValues.content_type}
                      onChange={e => setMoveValues(v => ({ ...v, content_type: e.target.value }))}
                    >
                      <option value="">— content type —</option>
                      {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </select>
                    <select
                      value={moveValues.theme}
                      onChange={e => setMoveValues(v => ({ ...v, theme: e.target.value }))}
                    >
                      <option value="">— theme (optional) —</option>
                      {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn-confirm" onClick={handleMove}>Confirm</button>
                    <button className="btn-cancel-sm" onClick={() => setMovingIndex(null)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
