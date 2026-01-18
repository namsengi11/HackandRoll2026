import { useRef, useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Camera, AlertCircle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  capturedImage: string | null;
  disabled?: boolean;
}

export function CameraCapture({ onCapture, capturedImage, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);

  useEffect(() => {
    // Cleanup stream on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  // Handle video sizing on load and resize, and ensure it plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    const updateVideoSize = () => {
      if (video.videoWidth && video.videoHeight) {
        // Ensure video fits container
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.objectFit = 'contain';
      }
      // Ensure video is playing
      if (video.paused && video.readyState >= 2) {
        video.play().catch((err) => {
          console.warn('Auto-play prevented, user interaction required:', err);
        });
      }
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        updateVideoSize();
        // Replay after orientation change
        if (video && video.paused && video.srcObject) {
          video.play().catch((err) => console.warn('Play after orientation change failed:', err));
        }
      }, 100);
    };

    const handlePlay = () => {
      console.log('Video started playing');
    };

    const handlePause = () => {
      console.warn('Video was paused, attempting to resume...');
      // Try to resume if paused unexpectedly
      if (video.srcObject && !video.ended) {
        setTimeout(() => {
          video.play().catch((err) => console.warn('Resume failed:', err));
        }, 100);
      }
    };

    video.addEventListener('loadedmetadata', updateVideoSize);
    video.addEventListener('resize', updateVideoSize);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    window.addEventListener('resize', updateVideoSize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Initial sizing and play attempt
    updateVideoSize();

    return () => {
      video.removeEventListener('loadedmetadata', updateVideoSize);
      video.removeEventListener('resize', updateVideoSize);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      window.removeEventListener('resize', updateVideoSize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [stream]);

  const startCamera = async () => {
    setError(null);
    setIsInitializing(true);

    try {
      // Debug logging for production troubleshooting
      const debugInfo = {
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        userAgent: navigator.userAgent,
        isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
      };
      console.log('Camera initialization:', debugInfo);
      
      // Additional check for deployment
      if (window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) {
        console.warn('WARNING: Site is not using HTTPS. Camera access may be blocked.');
      }

      // Check if we're in a secure context (HTTPS required for camera access)
      if (!window.isSecureContext) {
        const protocol = window.location.protocol;
        const errorMsg = `Camera access requires HTTPS. Current protocol: ${protocol}. Please access this site over a secure connection (https://).`;
        console.error('Camera error - Not secure context:', errorMsg);
        setError(errorMsg);
        setIsInitializing(false);
        return;
      }

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'Camera API is not available in this browser. Please use a modern browser with camera support.';
        console.error('Camera error - API not available:', errorMsg);
        setError(errorMsg);
        setIsInitializing(false);
        return;
      }

      // Mobile-friendly constraints - use device capabilities
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const videoConstraints: MediaTrackConstraints = isMobile
        ? {
            facingMode: 'environment', // Prefer back camera on mobile
            // Let the device choose the best resolution for mobile
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        
        // Explicitly play the video (required for mobile browsers)
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Video playing successfully');
            })
            .catch((playError) => {
              console.error('Error playing video:', playError);
              // Autoplay was blocked - show message to user
              setNeedsUserInteraction(true);
              // Try to play again after a short delay
              setTimeout(() => {
                if (video && video.srcObject) {
                  video.play().catch((err) => {
                    console.error('Retry play failed:', err);
                    setNeedsUserInteraction(true);
                  });
                }
              }, 100);
            });
        }
        
        // Wait for video metadata to ensure proper sizing
        video.addEventListener('loadedmetadata', () => {
          if (video) {
            // Force video to fit container
            video.style.width = '100%';
            video.style.height = 'auto';
            video.style.objectFit = 'contain';
            // Ensure it's playing
            if (video.paused) {
              video.play().catch((err) => console.error('Play on loadedmetadata failed:', err));
            }
          }
        }, { once: true });
        
        // Also handle when video is ready to play
        video.addEventListener('loadeddata', () => {
          if (video && video.paused) {
            video.play().catch((err) => console.error('Play on loadeddata failed:', err));
          }
        }, { once: true });
      }
      setIsInitializing(false);
    } catch (err: any) {
      let errorMessage = 'Failed to access camera. Please ensure you have granted camera permissions.';
      
      if (err instanceof Error) {
        // Handle specific error types
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings and try again.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMessage = 'No camera found. Please connect a camera device and try again.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMessage = 'Camera is already in use by another application. Please close other apps using the camera and try again.';
        } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          errorMessage = 'Camera does not support the required settings. Trying with default settings...';
          // Retry with simpler constraints
          try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            setStream(mediaStream);
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
            setIsInitializing(false);
            return;
          } catch (retryErr) {
            errorMessage = err.message || errorMessage;
          }
        } else if (err.name === 'SecurityError') {
          errorMessage = 'Camera access blocked for security reasons. Please ensure you are using HTTPS.';
        } else {
          errorMessage = err.message || errorMessage;
        }
      }
      
      console.error('Camera error:', {
        error: err,
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        errorMessage,
      });
      setError(errorMessage);
      setIsInitializing(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0);

    // Convert canvas to blob, then to File
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          onCapture(file);
          stopCamera();
        }
      },
      'image/jpeg',
      0.85
    );
  };

  const retakePhoto = async () => {
    // Stop any existing stream first
    stopCamera();
    // Clear captured image
    onCapture(new File([], '')); 
    // Small delay to ensure state updates before restarting camera
    await new Promise((resolve) => setTimeout(resolve, 100));
    await startCamera();
  };

  // Auto-start camera when component mounts (if not disabled and no captured image)
  useEffect(() => {
    if (!disabled && !capturedImage && !stream && !isInitializing) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  if (capturedImage) {
    return (
      <div className="space-y-4">
        <div 
          className="relative w-full bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center"
          style={{
            maxHeight: 'calc(100vh - 300px)',
            minHeight: '250px',
          }}
        >
          <img
            src={capturedImage}
            alt="Captured photo"
            className="w-full h-auto"
            style={{
              objectFit: 'contain',
              maxHeight: 'calc(100vh - 300px)',
              maxWidth: '100%',
            }}
          />
        </div>
        <button
          onClick={retakePhoto}
          disabled={disabled}
          className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Retake Photo
        </button>
      </div>
    );
  }

  if (error) {
    const isHttpsError = error.includes('HTTPS') || error.includes('secure connection');
    const isPermissionError = error.includes('permission') || error.includes('denied');
    
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <div>
              <div className="font-medium text-red-700 mb-2">Camera Access Required</div>
              <div className="text-sm text-red-600 mb-4">{error}</div>
              {isHttpsError && (
                <div className="text-xs text-gray-500 mt-2 p-3 bg-gray-50 rounded">
                  <strong>Note:</strong> Modern browsers require HTTPS for camera access. 
                  If you're seeing this on a deployed site, contact the site administrator to ensure HTTPS is enabled.
                </div>
              )}
              {isPermissionError && (
                <div className="text-xs text-gray-500 mt-2 p-3 bg-gray-50 rounded">
                  <strong>How to fix:</strong> Look for a camera icon in your browser's address bar, 
                  or go to your browser settings to allow camera access for this site.
                </div>
              )}
            </div>
            <Button
              onClick={startCamera}
              disabled={disabled || isInitializing}
            >
              {isInitializing ? 'Initializing...' : 'Try Again'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stream && !isInitializing) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-primary-100">
                <Camera className="h-8 w-8 text-primary-600" />
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-2">Camera Required</div>
              <div className="text-sm text-gray-500 mb-4">
                You must take a photo using your device camera
              </div>
            </div>
            <Button
              onClick={startCamera}
              disabled={disabled || isInitializing}
            >
              {isInitializing ? 'Starting Camera...' : 'Open Camera'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div 
        className="relative w-full bg-black rounded-lg overflow-hidden flex items-center justify-center"
        style={{ 
          maxHeight: 'calc(100vh - 300px)',
          minHeight: '250px',
          height: 'auto',
        }}
      >
        {isInitializing ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ minHeight: '250px' }}>
            <div className="text-center text-white">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
              <div className="text-sm">Starting camera...</div>
            </div>
          </div>
        ) : (
          <div className="relative w-full">
            {needsUserInteraction && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
                <div className="text-center text-white p-4">
                  <div className="text-lg font-medium mb-2">Tap to Start Camera</div>
                  <div className="text-sm opacity-90">Your browser requires interaction to start the camera</div>
                </div>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full"
              style={{
                objectFit: 'contain',
                maxHeight: 'calc(100vh - 300px)',
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
                cursor: needsUserInteraction ? 'pointer' : 'default',
              }}
              onClick={async (e) => {
                // Allow user to tap to play if autoplay was blocked
                const video = e.currentTarget;
                if (video.paused && video.srcObject) {
                  try {
                    await video.play();
                    setNeedsUserInteraction(false);
                    console.log('Video started via user interaction');
                  } catch (err) {
                    console.error('Manual play failed:', err);
                    setError('Unable to play video. Please check camera permissions and try again.');
                  }
                }
              }}
            />
          </div>
        )}
      </div>
      {needsUserInteraction && stream && !isInitializing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2">
          <p className="text-sm text-yellow-800 text-center">
            Tap the video above to start the camera, then capture your photo.
          </p>
        </div>
      )}
      {stream && !isInitializing && (
        <Button
          onClick={capturePhoto}
          disabled={disabled}
          className="w-full"
          size="lg"
        >
          <Camera className="h-5 w-5 mr-2" />
          Capture Photo
        </Button>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
