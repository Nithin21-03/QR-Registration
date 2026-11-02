import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  Search,
  Upload,
  Zap,
  ZapOff,
  QrCode,
  ArrowRight,
  ClipboardPaste,
} from 'lucide-react';
import { sound } from '../utils/audioSynth';

export default function QRScannerView({
  scanMode = 'MAIN_ENTRANCE',
  station,
  volunteer,
  onScanResult,
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

  // 1. Initialize Cameras & Start Mobile Viewport
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
          // If camera enumeration is restricted, try starting with facingMode
          startCamera(null);
        }
      } catch (err) {
        console.warn('Camera setup note, trying direct environment camera:', err.message);
        if (isMounted) {
          startCamera(null);
        }
      }
    }

    setupCameras();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  // 2. Start Scanner with Hardware BarcodeDetector & Full-Frame Decoding
  const startCamera = async (cameraId) => {
    try {
      setCameraError('');
      if (html5QrCodeRef.current) {
        await stopCamera();
      }

      // Initialize with hardware BarcodeDetector and QR format filter
      const html5QrCode = new Html5Qrcode('qr-reader-viewport', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true, // Native OS / GPU acceleration for rapid screen & glare decoding
        },
      });
      html5QrCodeRef.current = html5QrCode;

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: { ideal: 'environment' } };

      const scanConfig = {
        fps: 25, // 25 scans per second for instant trigger
        // Full-frame scanning area: detects QR codes anywhere in the camera feed
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.floor(viewfinderWidth * 0.94),
          height: Math.floor(viewfinderHeight * 0.94),
        }),
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          focusMode: { ideal: 'continuous' },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
      };

      await html5QrCode.start(
        cameraConfig,
        scanConfig,
        (decodedText) => {
          handleDetectedCode(decodedText);
        },
        () => {
          // Ignore non-decoded frames
        }
      );

      setScannerActive(true);

      // Check torch / flashlight support
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
        'Camera permission required. Please allow camera access in browser settings or type the Pass ID below.'
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

  // 4. Handle QR detection with haptic feedback & debounce
  const handleDetectedCode = async (decodedText) => {
    if (isProcessing) return;
    setIsProcessing(true);

    if (navigator.vibrate) {
      navigator.vibrate(60);
    }

    try {
      await onScanResult(decodedText);
    } finally {
      // 1.5s debounce before next scan
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
      console.warn('Torch toggle error:', err);
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
      console.warn('Photo scan error:', err);
      alert('Could not detect a valid QR code in the selected photo. Please ensure it is clear.');
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

  // 9. Quick Paste from Clipboard
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          sound.playClick();
          setManualInput(text.trim());
          handleDetectedCode(text.trim());
        }
      }
    } catch (_) {}
  };

  return (
    <div className="scanner-viewport-card glass">
      {/* Hidden File Input for Gallery QR Scan */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Top Header of Scanner */}
      <div className="viewport-header">
        <div className="viewport-badge">
          <QrCode size={16} className={isFoodMode ? 'text-amber' : 'text-cyan'} />
          <span>
            {isFoodMode ? 'Food Station · Meal Scanner' : 'Entrance Gate · Pass Scanner'}
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
            <div className="scanner-target-hint">
              <span>POINT CAMERA AT ZYNTRA PASS QR</span>
            </div>
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
              placeholder="Pass ID (e.g. ZY-XXXX-XXXX), USN, or Name..."
              aria-label="Search or enter Pass ID"
            />
            {navigator.clipboard && (
              <button
                type="button"
                className="paste-quick-btn"
                onClick={handlePasteClipboard}
                title="Paste from clipboard"
              >
                <ClipboardPaste size={14} />
                <span>Paste</span>
              </button>
            )}
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
      </div>
    </div>
  );
}
