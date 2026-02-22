import { useState, useEffect, useCallback, useRef } from 'react';
import { listFaces, registerFace, deleteFace, recognizeFace } from '../lib/api';
import type { RegisteredFace, FaceMatch } from '../types';

export function FacesPage() {
  const [faces, setFaces] = useState<RegisteredFace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);

  const fetchFaces = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await listFaces();
      setFaces(data);
    } catch {
      // API may not be available
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaces();
  }, [fetchFaces]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteFace(id);
        setFaces((prev) => prev.filter((f) => f.id !== id));
      } catch (err) {
        console.error('Delete face failed:', err);
      }
    },
    []
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Face Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Register and manage faces for recognition
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTestDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
            </svg>
            Test Recognition
          </button>
          <button
            onClick={() => setShowRegisterDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Register New Face
          </button>
        </div>
      </div>

      {/* Faces Grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-emerald-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : faces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-30">
              <circle cx="12" cy="12" r="10" />
              <circle cx="9" cy="10" r="1.5" fill="currentColor" />
              <circle cx="15" cy="10" r="1.5" fill="currentColor" />
              <path d="M8 15c1 2 7 2 8 0" />
            </svg>
            <p className="text-sm mb-1">No registered faces</p>
            <p className="text-xs text-slate-600">Click "Register New Face" to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {faces.map((face) => (
              <FaceCard
                key={face.id}
                face={face}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Register Dialog */}
      {showRegisterDialog && (
        <RegisterFaceDialog
          onClose={() => setShowRegisterDialog(false)}
          onRegistered={() => {
            setShowRegisterDialog(false);
            fetchFaces();
          }}
        />
      )}

      {/* Test Dialog */}
      {showTestDialog && (
        <TestRecognitionDialog
          onClose={() => setShowTestDialog(false)}
        />
      )}
    </div>
  );
}

// === Face Card ===
function FaceCard({
  face,
  onDelete,
}: {
  face: RegisteredFace;
  onDelete: (id: number) => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors group">
      {/* Face Image */}
      <div className="aspect-square bg-slate-800 flex items-center justify-center relative">
        {face.image_path ? (
          <img
            src={`/api/faces/image/${face.id}`}
            alt={face.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-700 opacity-50">
            <circle cx="12" cy="8" r="4" />
            <path d="M20 21a8 8 0 1 0-16 0" />
          </svg>
        </div>

        {/* Delete button */}
        <button
          onClick={() => setShowConfirm(true)}
          className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="text-sm font-medium text-white truncate">{face.name}</h4>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {new Date(face.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Delete confirmation */}
      {showConfirm && (
        <div className="p-3 border-t border-slate-800 bg-red-950/30">
          <p className="text-xs text-red-400 mb-2">Delete this face?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 px-2 py-1 text-xs text-slate-400 bg-slate-800 rounded-md hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(face.id)}
              className="flex-1 px-2 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-500 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// === Register Face Dialog ===
function RegisterFaceDialog({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [name, setName] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startCam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('Camera access denied');
      }
    };
    startCam();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedUrl(URL.createObjectURL(blob));
        }
      },
      'image/jpeg',
      0.9
    );
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
  }, [capturedUrl]);

  const handleSubmit = useCallback(async () => {
    if (!capturedBlob || !name.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await registerFace(name.trim(), capturedBlob);
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [capturedBlob, name, onRegistered]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">Register New Face</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Camera / Preview */}
          <div className="aspect-video bg-slate-800 rounded-xl overflow-hidden relative">
            {capturedUrl ? (
              <img src={capturedUrl} alt="Captured" className="w-full h-full object-cover" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            )}
            {!capturedUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-32 h-40 border-2 border-dashed border-emerald-400/50 rounded-xl" />
              </div>
            )}
          </div>

          {/* Name Input */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter person's name..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!capturedUrl ? (
              <button
                onClick={handleCapture}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Capture
              </button>
            ) : (
              <>
                <button
                  onClick={handleRetake}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors"
                >
                  Retake
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {isSubmitting ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// === Test Recognition Dialog ===
function TestRecognitionDialog({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [matches, setMatches] = useState<FaceMatch[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedImage(URL.createObjectURL(file));
    setIsProcessing(true);
    setError(null);
    setMatches([]);

    try {
      const result = await recognizeFace(file);
      setMatches(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recognition failed');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">Test Face Recognition</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video bg-slate-800 rounded-xl overflow-hidden cursor-pointer border-2 border-dashed border-slate-700 hover:border-emerald-500/50 transition-colors flex items-center justify-center"
          >
            {selectedImage ? (
              <img src={selectedImage} alt="Test" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-slate-500">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-50">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm">Click to upload an image</p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {isProcessing && (
            <div className="flex items-center justify-center py-4">
              <svg className="animate-spin h-6 w-6 text-emerald-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-2 text-sm text-slate-400">Analyzing...</span>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Results */}
          {matches.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Matches Found
              </h3>
              {matches.map((match, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-lg border border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M20 21a8 8 0 1 0-16 0" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{match.name}</p>
                      <p className="text-[10px] text-slate-500">Face ID: {match.face_id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      match.confidence > 0.8 ? 'text-green-400' :
                      match.confidence > 0.5 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {(match.confidence * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-500">confidence</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isProcessing && selectedImage && matches.length === 0 && !error && (
            <p className="text-sm text-slate-500 text-center py-2">No matches found</p>
          )}
        </div>
      </div>
    </div>
  );
}
