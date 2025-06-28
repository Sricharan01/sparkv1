import React, { useState } from 'react';
import { Brain, FileText, Zap, CheckCircle, AlertCircle, Download, Database, Cpu } from 'lucide-react';
import { aiTemplateAnalysisService, TemplateAnalysisResult } from '../../services/aiTemplateAnalysisService';
import { databaseService, StoredDocument } from '../../services/databaseService';
import { useAuth } from '../../contexts/AuthContext';
import { useDocuments } from '../../contexts/DocumentContext';

export function JSONAnalyzer() {
  const { user } = useAuth();
  const { addDocument } = useDocuments();
  const [jsonInput, setJsonInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<TemplateAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [formattedJSON, setFormattedJSON] = useState<any>(null);

  const handleAnalyzeJSON = async () => {
    if (!jsonInput.trim() || !user) return;

    setIsAnalyzing(true);
    setError('');
    setAnalysisResult(null);
    setFormattedJSON(null);

    try {
      // Parse JSON input
      const jsonData = JSON.parse(jsonInput);

      // Perform AI analysis
      const result = await aiTemplateAnalysisService.analyzeJSONData(jsonData, user.id);
      setAnalysisResult(result);

      // Format according to recommended template
      const formatted = aiTemplateAnalysisService.formatDocumentAsJSON(
        result.recommendedTemplate,
        result.fieldMappings,
        jsonData
      );
      setFormattedJSON(formatted);

    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please check your input.');
      } else {
        setError(err instanceof Error ? err.message : 'Analysis failed');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!formattedJSON || !analysisResult || !user) return;

    try {
      // Create document type based on analysis result
      const documentType = {
        id: analysisResult.recommendedTemplate.toLowerCase().replace(/\s+/g, '_'),
        name: analysisResult.recommendedTemplate,
        category: 'AI Analyzed',
        template: Object.keys(analysisResult.fieldMappings).map(field => ({
          id: field,
          label: field.replace(/([A-Z])/g, ' $1').trim(),
          type: 'text' as const,
          required: false
        })),
        validationRules: []
      };

      // Create stored document
      const storedDocument: StoredDocument = {
        id: `ai_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: documentType,
        templateVersion: 'v1.0',
        tags: [
          'ai-analyzed',
          analysisResult.recommendedTemplate.toLowerCase().replace(/\s+/g, '-'),
          'json-processed',
          `confidence-${Math.round(analysisResult.confidence * 100)}`
        ],
        fields: analysisResult.fieldMappings,
        ocrRawText: JSON.stringify(formattedJSON, null, 2),
        imageUrl: '',
        createdBy: user.id,
        location: user.station,
        status: 'finalized' as const,
        confidence: analysisResult.confidence,
        timestamp: new Date().toISOString(),
        documentData: btoa(JSON.stringify(formattedJSON)),
        extractedImages: [],
        processingMetadata: {
          layoutAnalysis: [],
          tableData: [],
          documentClassification: {
            documentType: analysisResult.recommendedTemplate,
            confidence: analysisResult.confidence,
            language: 'en',
            orientation: 'portrait'
          },
          qualityMetrics: {
            overallQuality: analysisResult.confidence,
            textClarity: 0.95,
            imageQuality: 0,
            layoutComplexity: 0.3,
            ocrConfidence: 0.95
          }
        },
        metadata: {
          processingMethod: 'ai-template-analysis',
          layout: [],
          tables: [],
          documentMetadata: {
            templateMatched: analysisResult.recommendedTemplate,
            templateConfidence: analysisResult.confidence,
            fieldConfidences: {},
            aiProcessed: true,
            analysisReasoning: analysisResult.reasoning
          },
          boundingBoxes: []
        }
      };

      // Save to database
      const documentId = await databaseService.saveDocument(storedDocument);

      // Add to context for immediate UI update
      addDocument({
        type: storedDocument.type,
        templateVersion: storedDocument.templateVersion,
        tags: storedDocument.tags,
        fields: storedDocument.fields,
        ocrRawText: storedDocument.ocrRawText,
        imageUrl: storedDocument.imageUrl,
        createdBy: storedDocument.createdBy,
        location: storedDocument.location,
        status: storedDocument.status,
        confidence: storedDocument.confidence,
        metadata: storedDocument.metadata
      });

      alert(`Document saved successfully! ID: ${documentId}`);

      // Reset form
      setJsonInput('');
      setAnalysisResult(null);
      setFormattedJSON(null);

    } catch (error) {
      console.error('Failed to save document:', error);
      alert('Failed to save document to database. Please try again.');
    }
  };

  const downloadFormattedJSON = () => {
    if (!formattedJSON) return;

    const blob = new Blob([JSON.stringify(formattedJSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${analysisResult?.recommendedTemplate.replace(/\s+/g, '_')}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sampleJSON = {
    "applicantName": "Officer John Smith",
    "employeeId": "EMP001",
    "department": "Traffic Division",
    "leaveType": "Annual Leave",
    "startDate": "2025-02-01",
    "endDate": "2025-02-07",
    "duration": 7,
    "reason": "Family vacation",
    "supervisorName": "Sergeant Jane Doe",
    "applicationDate": "2025-01-20"
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI JSON Template Analyzer</h2>
              <p className="text-sm text-gray-600">
                Analyze JSON data using Azure AI and OpenAI to match against letter templates
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-blue-600">
            <Zap className="h-4 w-4" />
            <span>Azure AI + OpenAI</span>
          </div>
        </div>

        {/* Available Templates Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Available Letter Templates:</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs text-blue-800">
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>Earned Leave Letter</span>
            </div>
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>Medical Leave Letter</span>
            </div>
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>Punishment Letter</span>
            </div>
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>Reward Letter</span>
            </div>
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>Probation Letter</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* JSON Input */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">JSON Input</h3>
              <button
                onClick={() => setJsonInput(JSON.stringify(sampleJSON, null, 2))}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Load Sample
              </button>
            </div>
            
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste your JSON data here..."
              className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />

            <button
              onClick={handleAnalyzeJSON}
              disabled={!jsonInput.trim() || isAnalyzing}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Cpu className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Analyze with AI
                </>
              )}
            </button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              </div>
            )}
          </div>

          {/* Analysis Results */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Analysis Results</h3>
            
            {analysisResult ? (
              <div className="space-y-4">
                {/* Template Match */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Recommended Template: {analysisResult.recommendedTemplate}
                    </span>
                  </div>
                  <div className="text-sm text-green-700">
                    <p><strong>Confidence:</strong> {Math.round(analysisResult.confidence * 100)}%</p>
                    <p className="mt-1"><strong>Reasoning:</strong> {analysisResult.reasoning}</p>
                  </div>
                </div>

                {/* Category Scores */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Template Matching Scores</h4>
                  <div className="space-y-2">
                    {Object.entries(analysisResult.categoryScores)
                      .sort(([,a], [,b]) => b - a)
                      .map(([template, score]) => (
                        <div key={template} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{template}</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${Math.min(score * 100, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-500 w-8">
                              {Math.round(score * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Field Mappings */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Extracted Fields</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {Object.entries(analysisResult.fieldMappings).map(([field, value]) => (
                      <div key={field} className="flex items-start space-x-2 text-xs">
                        <span className="font-medium text-gray-600 min-w-0 flex-shrink-0">
                          {field}:
                        </span>
                        <span className="text-gray-800 break-words">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-2">
                  <button
                    onClick={downloadFormattedJSON}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download JSON
                  </button>
                  <button
                    onClick={handleSaveToDatabase}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Save to Database
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Enter JSON data and click "Analyze with AI"</p>
                  <p className="text-sm text-gray-400 mt-2">
                    AI will analyze and recommend the best template match
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Formatted JSON Output */}
        {formattedJSON && (
          <div className="mt-6 border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Formatted JSON Output</h3>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-green-400 text-sm">
                {JSON.stringify(formattedJSON, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}