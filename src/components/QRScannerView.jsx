import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  Search,
  Upload,
  Zap,
  ZapOff,
  Sparkles,
  QrCode,
  ArrowRight,
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
          // Prefer environment / rear camera on mobile
          const backCam = devices.find((d) => {
            const l = d.label.toLowerCase();
            return l.includes('back') || l.includes('environment') || l.includes('rear');
          });
          const initialId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(initialId);
          startCamera(initialId);
        } else {
          setCameraError('No camera detected. You can scan via photo upload or manual search.');
        }
      } catch (err) {
        console.warn('Camera setup note:', err.message);
        if (isMounted) {
          setCameraError(
            'Camera access requires permission or HTTPS/localhost. You can use photo upload or manual search.'
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

      // Responsive QR scan box optimized for all mobile screen dimensions
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.72);
          return {
            width: Math.max(180, Math.min(size, 260)),
            height: Math.max(180, Math.min(size, 260)),
          };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
          handleDetectedCode(decodedText);
        },
        () => {
          // Ignore periodic frame decode misses
        }
      );

      setScannerActive(true);

      // Check for torch / flashlight capability on mobile device
      try {
        const track = html5QrCode.getRunningTrackCameraCapabilities();
        if (track && track.torchFeature().isSupported()) {
          setTorchSupported(true);
        }
      } catch (_) {
        setTorchSupported(false);
      }
    } catch (err) {
      console.warn('Camera start error:', err);
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

  // 4. Handle QR detection with debounce
  const handleDetectedCode = async (decodedText) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      await onScanResult(decodedText);
    } finally {
      // 1.5s debounce before next scan to prevent duplicate camera firing
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
      alert('Could not decode a valid QR code from this photo. Please ensure the QR code is clear and not blurry.');
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
            {isFoodMode ? 'Food Station Scan · Meal Token' : 'Entrance Gate Scan · Ticket Verification'}
          </span>
        </div>

        <div className="camera-actions">
          {torchSupported && (
            <button
              type="button"
              className={`icon-btn ${torchOn ? 'active' : ''}`}
              onClick={toggleTorch}
              title="Toggle Flashlight Torch"
              aria-label="Flashlight Torch"
            >
              {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
            </button>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              className="icon-btn"
              onClick={handleSwitchCamera}
              title="Switch Camera (Front/Rear)"
              aria-label="Flip Camera"
            >
              <RefreshCw size={16} />
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Scan QR from gallery photo or screenshot"
            aria-label="Upload Photo"
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
          <div className="camera-fallback-msg">
            <Camera size={44} style={{ opacity: 0.4, color: 'var(--cyan)' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
              {cameraError || 'Initializing Camera Feed...'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(228, 244, 255, 0.6)', lineHeight: 1.4 }}>
              If camera access is blocked, tap <strong>Upload Photo</strong> above or type the <strong>Pass ID</strong> below.
            </div>
            {cameras.length > 0 && !scannerActive && (
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: '4px' }}
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
              placeholder="Pass ID (ZY-...), USN, or Name..."
              aria-label="Search or enter Pass ID"
            />
          </div>
          <button
            type="submit"
            className="btn-primary manual-verify-btn"
            disabled={!manualInput.trim()}
          >
            <span>Verify</span>
            <ArrowRight size={15} />
          </button>
        </form>

        {/* Quick Clickable Test Passes Drawer for instant mobile testing */}
        {samplePasses.length > 0 && (
          <div className="test-passes-wrapper">
            <div className="test-passes-label">
              <Sparkles size={12} className="text-cyan" />
              <span>Tap Sample Pass to Simulate Scan:</span>
            </div>
            <div className="test-passes-bar">
              {samplePasses.slice(0, 8).map((pass) => (
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
                  <span className="pill-id">{pass.ticket_id}</span>
                  <span className="pill-name">· {pass.full_name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
