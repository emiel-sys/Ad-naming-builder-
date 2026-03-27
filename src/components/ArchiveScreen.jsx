import { useState, useEffect } from 'react';

export default function ArchiveScreen() {
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArchive();
  }, []);

  async function fetchArchive() {
    try {
      const res = await fetch('/api/archive');
      if (res.ok) {
        setArchive(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(index) {
    if (!confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/archive/${index}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchArchive();
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="archive-screen"><p>Loading archive...</p></div>;
  }

  return (
    <div className="archive-screen">
      <h2>Archive</h2>
      <p className="archive-count">{archive.length} saved ad{archive.length !== 1 ? 's' : ''}</p>

      {archive.length === 0 ? (
        <div className="empty-state">
          <p>No ads saved yet. Analyze an ad to get started.</p>
        </div>
      ) : (
        <div className="archive-table-wrap">
          <table className="archive-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Preview</th>
                <th>Approved Name</th>
                <th>Feedback</th>
                <th>Image Description</th>
                <th>Saved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {archive.map((entry, i) => (
                <tr key={i}>
                  <td className="row-num">{i + 1}</td>
                  <td className="thumb-cell">
                    {entry.image_preview ? (
                      <img src={entry.image_preview} alt="Ad thumbnail" className="archive-thumb" />
                    ) : (
                      <div className="archive-thumb-empty">—</div>
                    )}
                  </td>
                  <td className="name-cell">
                    <code>{entry.approved_name}</code>
                  </td>
                  <td className="feedback-cell">
                    {entry.feedback ? (
                      <span className="feedback-text">{entry.feedback}</span>
                    ) : (
                      <span className="no-feedback">—</span>
                    )}
                  </td>
                  <td className="desc-cell">{entry.image_description}</td>
                  <td className="date-cell">
                    {entry.saved_at
                      ? new Date(entry.saved_at).toLocaleDateString('en-US', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(i)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
