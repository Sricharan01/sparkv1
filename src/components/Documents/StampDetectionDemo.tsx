import React, { useState, useRef, useEffect } from 'react';
import { Stamp, PenTool, Upload, Download, Eye, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// Sample stamp and signature detection results for demonstration
const sampleStamps = [
  {
    id: 'stamp_1',
    type: 'official_stamp',
    boundingBox: { x: 100, y: 150, width: 120, height: 120 },
    confidence: 0.92,
    imageData: 'https://i.ibb.co/Qj1bBYF/official-stamp-sample.png',
    location: 'bottom-right'
  },
  {
    id: 'stamp_2',
    type: 'seal',
    boundingBox: { x: 350, y: 200, width: 100, height: 100 },
    confidence: 0.85,
    imageData: 'https://i.ibb.co/Qj1bBYF/official-stamp-sample.png',
    location: 'middle-right'
  }
];

const sampleSignatures = [
  {
    id: 'signature_1',
    type: 'handwritten_signature',
    boundingBox: { x: 200, y: 400, width: 150, height: 50 },
    confidence: 0.88,
    imageData: 'https://i.ibb.co/Qj1bBYF/official-stamp-sample.png',
    location: 'bottom-left'
  }
];

export function StampDetectionDemo() {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedStamp, setSelectedStamp] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showResults && canvasRef.current) {
      drawDemoResults();
    }
  }, [showResults]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowResults(false);
    }
  };

  const handleAnalyze = () => {
    if (!selectedFile) return;
    
    setIsAnalyzing(true);
    
    // Simulate analysis delay
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowResults(true);
    }, 2000);
  };

  const drawDemoResults = () => {
    if (!canvasRef.current || !previewUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    const img = new Image();
    img.onload = () => {
      // Set canvas dimensions to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image
      ctx.drawImage(img, 0, 0);
      
      // Draw stamp bounding boxes
      sampleStamps.forEach((stamp, index) => {
        ctx.strokeStyle = '#10B981'; // Green for stamps
        ctx.lineWidth = 3;
        ctx.strokeRect(
          stamp.boundingBox.x,
          stamp.boundingBox.y,
          stamp.boundingBox.width,
          stamp.boundingBox.height
        );
        
        // Label
        ctx.fillStyle = '#10B981';
        ctx.fillRect(stamp.boundingBox.x, stamp.boundingBox.y - 25, 80, 25);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`Stamp ${index + 1}`, stamp.boundingBox.x + 5, stamp.boundingBox.y - 8);
      });
      
      // Draw signature bounding boxes
      sampleSignatures.forEach((signature, index) => {
        ctx.strokeStyle = '#3B82F6'; // Blue for signatures
        ctx.lineWidth = 3;
        ctx.strokeRect(
          signature.boundingBox.x,
          signature.boundingBox.y,
          signature.boundingBox.width,
          signature.boundingBox.height
        );
        
        // Label
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(signature.boundingBox.x, signature.boundingBox.y - 25, 100, 25);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`Signature ${index + 1}`, signature.boundingBox.x + 5, signature.boundingBox.y - 8);
      });
    };
    
    img.src = previewUrl;
  };

  const downloadStampImage = (stampId: string) => {
    const stamp = sampleStamps.find(s => s.id === stampId);
    if (!stamp) return;
    
    const link = document.createElement('a');
    link.href = stamp.imageData;
    link.download = `stamp_${stamp.id}.png`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Stamp className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Stamp & Signature Detection Demo</h3>
              <p className="text-sm text-gray-600">
                Upload a document to see stamp and signature detection in action
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Upload className="h-4 w-4 mr-2" />
              Select File
            </button>
            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || isAnalyzing}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Analyze Document
                </>
              )}
            </button>
          </div>
        </div>

        {/* File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Document Preview */}
        {previewUrl && (
          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-900 mb-3">Document Preview</h4>
            <div className="border rounded-lg overflow-hidden">
              {showResults ? (
                <canvas
                  ref={canvasRef}
                  className="max-w-full h-auto"
                  style={{ maxHeight: '600px' }}
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="Document preview"
                  className="max-w-full h-auto"
                  style={{ maxHeight: '600px' }}
                />
              )}
            </div>
          </div>
        )}

        {/* Results Section */}
        {showResults && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Stamps */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                <Stamp className="h-5 w-5 mr-2 text-green-600" />
                Detected Stamps ({sampleStamps.length})
              </h4>
              
              <div className="space-y-3">
                {sampleStamps.map((stamp, index) => (
                  <div
                    key={stamp.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedStamp === stamp.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedStamp(selectedStamp === stamp.id ? null : stamp.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            Stamp {index + 1}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {stamp.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>Location: {stamp.location}</div>
                          <div>Confidence: {Math.round(stamp.confidence * 100)}%</div>
                          <div>Size: {stamp.boundingBox.width}×{stamp.boundingBox.height}</div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadStampImage(stamp.id);
                        }}
                        className="p-1 text-gray-600 hover:text-gray-800"
                        title="Download stamp image"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {selectedStamp === stamp.id && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <img
                          src={stamp.imageData}
                          alt={`Stamp ${index + 1}`}
                          className="max-w-full h-auto border rounded"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Signatures */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                <PenTool className="h-5 w-5 mr-2 text-blue-600" />
                Detected Signatures ({sampleSignatures.length})
              </h4>
              
              <div className="space-y-3">
                {sampleSignatures.map((signature, index) => (
                  <div
                    key={signature.id}
                    className="border rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            Signature {index + 1}
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {signature.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>Location: {signature.location}</div>
                          <div>Confidence: {Math.round(signature.confidence * 100)}%</div>
                          <div>Size: {signature.boundingBox.width}×{signature.boundingBox.height}</div>
                        </div>
                      </div>
                      <button
                        className="p-1 text-gray-600 hover:text-gray-800"
                        title="Download signature image"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Validation Summary */}
        {showResults && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="text-md font-medium text-blue-900">Document Validation Summary</h4>
                <div className="mt-2 text-sm text-blue-800">
                  <p>• <strong>Stamps:</strong> Present (2 detected)</p>
                  <p>• <strong>Signatures:</strong> Present (1 detected)</p>
                  <p>• <strong>Overall Completeness:</strong> 100%</p>
                  <p>• <strong>Validation Status:</strong> Valid Document</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}