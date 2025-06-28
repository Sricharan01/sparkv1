import React, { useState, useRef } from 'react';
import { 
  Stamp, 
  PenTool, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Eye, 
  Download,
  MapPin,
  Image as ImageIcon
} from 'lucide-react';
import { stampSignatureDetectionService, DocumentValidationResult } from '../../services/stampSignatureDetectionService';
import { useAuth } from '../../contexts/AuthContext';

interface StampSignatureValidatorProps {
  documentImage: string | File;
  onValidationComplete: (result: DocumentValidationResult) => void;
  className?: string;
}

export function StampSignatureValidator({ 
  documentImage, 
  onValidationComplete, 
  className = '' 
}: StampSignatureValidatorProps) {
  const { user } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [validationResult, setValidationResult] = useState<DocumentValidationResult | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<string | null>(null);
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleAnalyze = async () => {
    if (!user || !documentImage) return;

    setIsAnalyzing(true);
    try {
      const result = await stampSignatureDetectionService.analyzeDocument(documentImage, user.id);
      setValidationResult(result);
      onValidationComplete(result);
      
      // Draw bounding boxes on canvas
      await drawBoundingBoxes(result);
    } catch (error) {
      console.error('Validation failed:', error);
      alert('Validation failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const drawBoundingBoxes = async (result: DocumentValidationResult) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Load and draw the original image
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Draw stamp bounding boxes
      result.stamps.detected.forEach((stamp, index) => {
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
      result.signatures.detected.forEach((signature, index) => {
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
    
    if (typeof documentImage === 'string') {
      img.src = documentImage;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(documentImage);
    }
  };

  const downloadStampImage = (stamp: any) => {
    const link = document.createElement('a');
    link.href = stamp.imageData;
    link.download = `stamp_${stamp.id}.png`;
    link.click();
  };

  const downloadSignatureImage = (signature: any) => {
    const link = document.createElement('a');
    link.href = signature.imageData;
    link.download = `signature_${signature.id}.png`;
    link.click();
  };

  const getStatusIcon = (status: 'Present' | 'Absent') => {
    return status === 'Present' ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600" />
    );
  };

  const getStatusColor = (status: 'Present' | 'Absent') => {
    return status === 'Present' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Validation Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Stamp className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Stamp & Signature Validation</h3>
              <p className="text-sm text-gray-600">
                Automatically detect and validate document stamps and signatures
              </p>
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !documentImage}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Validate Document
              </>
            )}
          </button>
        </div>

        {/* Validation Results Summary */}
        {validationResult && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Stamp className="h-8 w-8 text-green-600" />
                <div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(validationResult.stamps.status)}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(validationResult.stamps.status)}`}>
                      {validationResult.stamps.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    Stamps: {validationResult.stamps.count} detected
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <PenTool className="h-8 w-8 text-blue-600" />
                <div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(validationResult.signatures.status)}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(validationResult.signatures.status)}`}>
                      {validationResult.signatures.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    Signatures: {validationResult.signatures.count} detected
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                {validationResult.overallValidation.isValid ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Completeness: {validationResult.overallValidation.completeness}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {validationResult.overallValidation.isValid ? 'Valid Document' : 'Incomplete'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Missing Elements Warning */}
        {validationResult && validationResult.overallValidation.missingElements.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Missing Elements:</p>
                <p className="text-sm text-yellow-700">
                  {validationResult.overallValidation.missingElements.join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Document Canvas with Bounding Boxes */}
      {validationResult && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-gray-900">Document Analysis</h4>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto"
              style={{ maxHeight: '600px' }}
            />
          </div>
        </div>
      )}

      {/* Detailed Results */}
      {validationResult && showDetails && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stamps Details */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Stamp className="h-5 w-5 mr-2 text-green-600" />
              Detected Stamps ({validationResult.stamps.count})
            </h4>
            
            {validationResult.stamps.detected.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No stamps detected</p>
            ) : (
              <div className="space-y-4">
                {validationResult.stamps.detected.map((stamp, index) => (
                  <div
                    key={stamp.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedStamp === stamp.id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedStamp(selectedStamp === stamp.id ? null : stamp.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            Stamp {index + 1}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {stamp.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {stamp.location}
                          </div>
                          <div>
                            Confidence: {Math.round(stamp.confidence * 100)}%
                          </div>
                          <div>
                            Size: {stamp.boundingBox.width}×{stamp.boundingBox.height}
                          </div>
                          <div>
                            Position: ({stamp.boundingBox.x}, {stamp.boundingBox.y})
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadStampImage(stamp);
                          }}
                          className="p-1 text-gray-600 hover:text-gray-800"
                          title="Download stamp image"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {selectedStamp === stamp.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
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
            )}
          </div>

          {/* Signatures Details */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <PenTool className="h-5 w-5 mr-2 text-blue-600" />
              Detected Signatures ({validationResult.signatures.count})
            </h4>
            
            {validationResult.signatures.detected.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No signatures detected</p>
            ) : (
              <div className="space-y-4">
                {validationResult.signatures.detected.map((signature, index) => (
                  <div
                    key={signature.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedSignature === signature.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedSignature(selectedSignature === signature.id ? null : signature.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            Signature {index + 1}
                          </span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {signature.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {signature.location}
                          </div>
                          <div>
                            Confidence: {Math.round(signature.confidence * 100)}%
                          </div>
                          <div>
                            Size: {signature.boundingBox.width}×{signature.boundingBox.height}
                          </div>
                          <div>
                            Position: ({signature.boundingBox.x}, {signature.boundingBox.y})
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadSignatureImage(signature);
                          }}
                          className="p-1 text-gray-600 hover:text-gray-800"
                          title="Download signature image"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {selectedSignature === signature.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <img
                          src={signature.imageData}
                          alt={`Signature ${index + 1}`}
                          className="max-w-full h-auto border rounded"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}