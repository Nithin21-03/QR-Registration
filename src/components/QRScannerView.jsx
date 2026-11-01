import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  Search,
  Upload,
  Zap,
  ZapOff,
  AlertCircle,
  Sparkles,
  QrCode,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function QRScannerView({
  scanMode = 'MAIN_ENTRANCE',
  station,
  volunteer,
  onScanResult,
  samplePasses = [],
}) {
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);
  const isFoodMode = scanMode === 'FOOD_COLLECTION';

  // 1. Initialize Cameras & Camera Scanner
  useEffect(() => {
    let isMounted = true;

    async function setupCameras() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer environment / back camera on mobile
          const backCam = devices.find((d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('rear')
          );
          const initialId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(initialId);
          startCamera(initialId);
        } else {
          setCameraError('No camera detected on this device. You can still scan via file upload or manual search.');
        }
      } catch (err) {
        console.warn('Camera access note:', err.message);
        if (isMounted) {
          setCameraError(
            'Camera access requires permission or HTTPS/localhost. You can use file upload or manual entry.'
          );
        }
      }
    }

    setupCameras();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  // 2. Start Scanner with chosen camera
  const startCamera = async (cameraId) => {
    try {
      setCameraError('');
      if (html5QrCodeRef.current) {
        await stopCamera();
      }

      const html5QrCode = new Html5Qrcode('qr-reader-viewport');
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
          handleDetectedCode(decodedText);
        },
        () => {
          // Ignore frame decode misses
        }
      );

      setScannerActive(true);

      // Check for torch capability
      try {
        const track = html5QrCode.getRunningTrackCameraCapabilities();
        if (track && track.torchFeature().isSupported()) {
          setTorchSupported(true);
        }
      } catch (_) {
        setTorchSupported(false);
      }
    } catch (err) {
      console.warn('Failed to start camera:', err);
      setScannerActive(false);
      setCameraError(
        'Could not access camera feed. Please check browser permissions or use manual entry below.'
      );
    }
  };

  // 3. Stop Scanner
  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Camera stop note:', err);
      }
      html5QrCodeRef.current = null;
      setScannerActive(false);
    }
  };

  // 4. Handle QR detection
  const handleDetectedCode = async (decodedText) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      await onScanResult(decodedText);
    } finally {
      // Short 1.5s debounce before next scan to prevent duplicate camera firing
      setTimeout(() => {
        setIsProcessing(false);
      }, 1500);
    }
  };

  // 5. Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const nextState = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
      sound.playClick();
    } catch (err) {
      console.warn('Torch toggle not supported:', err);
    }
  };

  // 6. Flip / Switch Camera
  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    sound.playClick();
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    await startCamera(nextCamera.id);
  };

  // 7. Scan from Image Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playClick();
    try {
      const qrScanner = new Html5Qrcode('qr-reader-temp', false);
      const decodedResult = await qrScanner.scanFile(file, true);
      qrScanner.clear();
      handleDetectedCode(decodedResult);
    } catch (err) {
      sound.playError();
      alert('Could not decode a valid QR code from this image. Please ensure the QR is clear and well-lit.');
    } finally {
      e.target.value = '';
    }
  };

  // 8. Handle Manual Pass ID Search
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    sound.playClick();
    handleDetectedCode(manualInput.trim());
    setManualInput('');
  };

  return (
    <div className="scanner-viewport-card glass">
      {/* Top Header of Scanner */}
      <div className="viewport-header">
        <div className="viewport-badge">
          <QrCode size={16} className={isFoodMode ? 'text-amber' : 'text-cyan'} />
          <span>
            {isFoodMode
              ? 'Food Counter Scan · Single-Meal Token'
              : 'Entrance Gate Scan · Ticket Verification'}
          </span>
        </div>

        <div className="camera-actions">
          {torchSupported && (
            <button
              className={`icon-btn ${torchOn ? 'active' : ''}`}
              onClick={toggleTorch}
              title="Toggle Flashlight Torch"
            >
              {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
            </button>
          )}

          {cameras.length > 1 && (
            <button
              className="icon-btn"
              onClick={handleSwitchCamera}
              title="Switch Camera (Front/Rear)"
            >
              <RefreshCw size={16} />
            </button>
          )}

          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Scan QR from photo / screenshot"
          >
            <Upload size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Camera Video Viewport */}
      <div className="viewport-box">
        <div id="qr-reader-viewport" style={{ width: '100%', height: '100%' }} />
        <div id="qr-reader-temp" style={{ display: 'none' }} />

        {scannerActive && (
          <>
            <div className="scanning-laser" />
            <div className="corner-brackets" />
          </>
        )}

        {/* Fallback Notice if Camera fails or pending */}
        {!scannerActive && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              maxWidth: '380px',
            }}
          >
            <Camera size={44} style={{ opacity: 0.4, color: 'var(--cyan)' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
              {cameraError || 'Initializing Camera Feed...'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(228, 244, 255, 0.6)' }}>
              If camera access is blocked, use the <strong>Upload Photo</strong> button or search via <strong>Ticket ID</strong> below.
            </div>
            {cameras.length > 0 && !scannerActive && (
              <button
                className="btn-primary"
                onClick={() => startCamera(selectedCameraId || cameras[0].id)}
              >
                Retry Camera
              </button>
            )}
          </div>
        )}
      </div>

      {/* Manual Search & Entry Form */}
      <div className="scanner-inputs">
        <form onSubmit={handleManualSubmit} className="manual-entry-form">
          <div className="search-input-wrap">
            <Search size={18} className="search-input-icon" />
            <input
              type="text"
              className="manual-input"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type Pass ID (e.g. ZY-4821-B7E2), USN, Email, or Name..."
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!manualInput.trim()}>
            <span>Verify</span>
            <ArrowRight size={15} />
          </button>
        </form>

        {/* Quick Clickable Test Passes Drawer for instant zero-hassle testing */}
        {samplePasses.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(228, 244, 255, 0.5)',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={12} className="text-cyan" />
              <span>One-Click Test Passes (Simulate QR Scan):</span>
            </div>
            <div className="test-passes-bar">
              {samplePasses.slice(0, 7).map((pass) => (
                <button
                  key={pass.ticket_id}
                  type="button"
                  className="test-pass-pill"
                  onClick={() => {
                    sound.playClick();
                    handleDetectedCode(pass.ticket_id);
                  }}
                  title={`Test scan for ${pass.full_name} (${pass.event_name})`}
                >
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    {pass.ticket_id}
                  </span>
                  <span style={{ color: 'rgba(228, 244, 255, 0.6)' }}>
                    · {pass.full_name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

