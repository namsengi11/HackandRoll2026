import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { useAuth } from '../contexts/AuthContext';
import { supabaseApi } from '../lib/supabaseApi';
import { supabaseDex } from '../lib/supabaseDex';
import { CameraCapture } from '../components/CameraCapture';
import { FineEntrySelect } from '../components/FineEntrySelect';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { LabelSelect } from '../components/LabelSelect';
import { validateImageFile, checkImageDimensions } from '../utils/imageHelpers';
import { isJpegFile } from '../utils/imageToJpeg';
import { sanitizeCopy } from '../utils/sanitizeCopy';
import { Camera, ChevronDown, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { labels, fetchLabels, isLoading } = useStore();
  const [uploading, setUploading] = useState(false);
  const [jpegFile, setJpegFile] = useState<File | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  
  // Coarse -> Fine selection state
  const [step, setStep] = useState<'capture' | 'coarse' | 'fine'>('capture');
  const [coarseLabelId, setCoarseLabelId] = useState<number | null>(null);
  const [coarseConfidence, setCoarseConfidence] = useState<number | null>(null);
  const [fineDexEntryId, setFineDexEntryId] = useState<number | null>(null);
  const [selectedVersion] = useState<string>('v0');
  const [fineEntries, setFineEntries] = useState<any[]>([]);

  const handleCapture = async (file: File) => {
    setError(null);

    if (file.size === 0) {
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl);
      }
      setJpegFile(null);
      setCapturedImageUrl(null);
      setFileSize(null);
      setStep('capture');
      return;
    }

    // Camera already outputs JPEG, but validate
    if (!isJpegFile(file)) {
      setError('Camera capture must output JPEG format');
      return;
    }

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    const dimensionCheck = await checkImageDimensions(file);
    if (!dimensionCheck.valid) {
      toast.warning(dimensionCheck.error || 'Image dimensions may be too small');
    }

    const imageUrl = URL.createObjectURL(file);
    setCapturedImageUrl(imageUrl);
    setJpegFile(file);
    setFileSize(file.size);
    
    // Move to coarse selection after capture
    setStep('coarse');
    // Simulate ML classification (for demo, use first label as default)
    if (labels.length > 0 && !coarseLabelId) {
      setCoarseLabelId(labels[0].id);
      setCoarseConfidence(0.85); // Demo confidence
    }
  };

  const handleCoarseNext = () => {
    if (!coarseLabelId) {
      setError('Please select a category');
      return;
    }
    setStep('fine');
  };

  const handleFineNext = () => {
    if (!fineDexEntryId) {
      setError('Please select a specific entry');
      return;
    }
    setShowConfirmDialog(true);
  };

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  useEffect(() => {
    if (coarseLabelId && step === 'fine') {
      supabaseDex.getDexEntries(selectedVersion, { coarseLabelId }).then(setFineEntries);
    }
  }, [coarseLabelId, step, selectedVersion]);

  const confirmSubmit = async () => {
    if (!jpegFile || !coarseLabelId || !fineDexEntryId || !user) return;

    setUploading(true);
    try {
      await supabaseApi.createSubmission(
        user.id,
        jpegFile,
        coarseLabelId, // Use coarse label as label_id for now
        undefined, // caption
        coarseLabelId,
        coarseConfidence,
        fineDexEntryId,
        null // fine confidence
      );
      toast.success('Added to RareDex!', {
        description: 'Your submission is now in the feed.',
      });
      
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl);
      }
      setJpegFile(null);
      setCapturedImageUrl(null);
      setCoarseLabelId(null);
      setFineDexEntryId(null);
      setFileSize(null);
      setStep('capture');
      setShowConfirmDialog(false);
      
      // Refresh feed and navigate
      setTimeout(() => {
        navigate('/feed');
      }, 1500);
    } catch (err) {
      toast.error('Failed to submit', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const selectedCoarseLabel = labels.find((l) => l.id === coarseLabelId);
  const selectedFineEntry = fineEntries.find((e) => e.id === fineDexEntryId);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        title="Add to RareDex"
        subtitle={sanitizeCopy("Capture an item you've spotted and classify it. Build your collection!")}
      />

      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-center gap-4">
          <div className={`flex items-center gap-2 ${step === 'capture' ? 'text-primary-600' : (step === 'coarse' || step === 'fine') ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'capture' ? 'bg-primary-600 text-white' : (step === 'coarse' || step === 'fine') ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
              {(step === 'coarse' || step === 'fine') ? <CheckCircle2 className="h-5 w-5" /> : '1'}
            </div>
            <span className="font-medium">Capture</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className={`flex items-center gap-2 ${step === 'coarse' ? 'text-primary-600' : step === 'fine' ? 'text-green-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'coarse' ? 'bg-primary-600 text-white' : step === 'fine' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
              {step === 'fine' ? <CheckCircle2 className="h-5 w-5" /> : '2'}
            </div>
            <span className="font-medium">Category</span>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
          <div className={`flex items-center gap-2 ${step === 'fine' ? 'text-primary-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'fine' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
              3
            </div>
            <span className="font-medium">Specific Item</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Capture */}
          {step === 'capture' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary-600" />
                  Take Photo
                </CardTitle>
                <CardDescription>
                  Take a photo with your camera to add to RareDex
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CameraCapture
                  onCapture={handleCapture}
                  capturedImage={capturedImageUrl}
                  disabled={isLoading}
                />

                {jpegFile && fileSize && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <Badge variant="success" className="text-xs">
                      JPEG Optimized
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {formatFileSize(fileSize)}
                    </span>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Coarse Category */}
          {step === 'coarse' && (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Select Category</CardTitle>
                <CardDescription>
                  {coarseConfidence
                    ? `We think this is: ${selectedCoarseLabel?.name || 'Unknown'} (${Math.round(coarseConfidence * 100)}% confidence)`
                    : 'What broad category does this item belong to?'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LabelSelect
                  labels={labels}
                  value={coarseLabelId}
                  onChange={setCoarseLabelId}
                  disabled={isLoading}
                />
                {coarseConfidence && (
                  <div className="text-sm text-gray-600">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCoarseConfidence(null);
                        setCoarseLabelId(null);
                      }}
                    >
                      Change category
                    </Button>
                  </div>
                )}
                <Button
                  onClick={handleCoarseNext}
                  disabled={!coarseLabelId}
                  className="w-full"
                >
                  Next: Choose Specific Item
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Fine Entry */}
          {step === 'fine' && coarseLabelId && (
            <Card>
              <CardHeader>
                <CardTitle>Step 3: Choose Specific Item</CardTitle>
                <CardDescription>
                  Select the specific item from {selectedCoarseLabel?.name || 'this category'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FineEntrySelect
                  coarseLabelId={coarseLabelId}
                  versionId={selectedVersion}
                  value={fineDexEntryId}
                  onChange={setFineDexEntryId}
                  disabled={isLoading}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('coarse')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleFineNext}
                    disabled={!fineDexEntryId}
                    className="flex-1"
                  >
                    Review & Submit
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tips Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tips for Great Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => setShowTips(!showTips)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm text-gray-600">
                  {showTips ? 'Hide tips' : 'Show tips'}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${
                    showTips ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {showTips && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 space-y-3 text-sm text-gray-600"
                >
                  <div className="flex gap-2">
                    <span className="font-medium">✓</span>
                    <span>Use good lighting</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium">✓</span>
                    <span>Keep the item centered</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium">✓</span>
                    <span>Capture unique details</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium">✓</span>
                    <span>Ensure the image is in focus</span>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
            <DialogDescription>
              {sanitizeCopy("Review your submission before adding it to RareDex")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {capturedImageUrl && (
              <div className="relative aspect-video bg-gray-100 rounded-xl overflow-hidden">
                <img
                  src={capturedImageUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">Category:</span>
              <span className="font-semibold text-gray-900">
                {selectedCoarseLabel?.name || 'Not selected'}
              </span>
            </div>
            {selectedFineEntry && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-600">Specific Item:</span>
                <span className="font-semibold text-gray-900">
                  {selectedFineEntry.fine_label}
                </span>
              </div>
            )}
            {fileSize && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-600">Format:</span>
                <Badge variant="success" className="text-xs">
                  JPEG • {formatFileSize(fileSize)}
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmSubmit} disabled={uploading}>
              {isLoading ? 'Submitting...' : 'Confirm & Add to RareDex'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
