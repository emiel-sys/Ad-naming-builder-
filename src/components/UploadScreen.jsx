import { useState, useRef } from 'react';

// Resize image to max dimension to reduce API token usage
function resizeImage(dataUrl, maxDim = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        // Already small enough
        resolve({ resized: dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
        return;
      }
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const resized = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ resized, base64: resized.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.src = dataUrl;
  });
}

export default function UploadScreen({ onAnalyze }) {
  const [assetType, setAssetType] = useState('static');
  const [preview, setPreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const original = e.target.result;
      setPreview(original); // show original for preview
      // Resize for API to save tokens
      const { base64, mediaType: mt } = await resizeImage(original, 800);
      setImageData(base64);
      setMediaType(mt);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  function handleSubmit() {
    if (!imageData) return;
    onAnalyze({ image_base64: imageData, media_type: mediaType, asset_type: assetType, preview });
  }

  return (
    <div className="upload-screen">
      <h2>Upload Ad Image</h2>

      <div className="asset-type-selector">
        <label>Asset Type</label>
        <div className="btn-group">
          <button
            className={assetType === 'static' ? 'active' : ''}
            onClick={() => setAssetType('static')}
          >
            Static
          </button>
          <button
            className={assetType === 'static_carousel' ? 'active' : ''}
            onClick={() => setAssetType('static_carousel')}
          >
            Static Carousel
          </button>
        </div>
      </div>

      <div
        className={`drop-zone ${dragging ? 'dragging' : ''} ${preview ? 'has-image' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="Ad preview" />
        ) : (
          <div className="drop-text">
            <span className="drop-icon">+</span>
            <p>Drop image here or click to upload</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      <button
        className="btn-primary"
        disabled={!imageData}
        onClick={handleSubmit}
      >
        Analyze Ad
      </button>
    </div>
  );
}
