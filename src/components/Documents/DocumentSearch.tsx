import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Eye, Calendar, Tag, FileText } from 'lucide-react';
import { documentStorageService } from '../../services/documentStorageService';
import { ProcessedDocument } from '../../types/documentProcessing';
import { useAuth } from '../../contexts/AuthContext';

export function DocumentSearch() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProcessedDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ProcessedDocument | null>(null);
  const [filters, setFilters] = useState({
    fileType: '',
    status: '',
    dateRange: { start: '', end: '' },
    tags: [] as string[],
    minConfidence: 0
  });
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadAvailableTags();
  }, []);

  const loadAvailableTags = async () => {
    try {
      const tags = await documentStorageService.getAllTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const handleSearch = async () => {
    if (!user) return;

    setIsSearching(true);
    try {
      const results = await documentStorageService.searchDocuments(
        searchQuery,
        filters.fileType || filters.status || filters.dateRange.start || filters.tags.length > 0 || filters.minConfidence > 0
          ? filters
          : undefined,
        user.id
      );
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setFilters({
      fileType: '',
      status: '',
      dateRange: { start: '', end: '' },
      tags: [],
      minConfidence: 0
    });
  };

  const exportResults = () => {
    const exportData = searchResults.map(doc => ({
      fileName: doc.originalFileName,
      status: doc.status,
      confidence: doc.confidence,
      uploadDate: doc.uploadedAt,
      extractedFields: doc.extractedData.fields
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `search_results_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'needs_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Interface */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Document Search</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
            {searchResults.length > 0 && (
              <button
                onClick={exportResults}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex space-x-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search documents by content, filename, or extracted data..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File Type
                </label>
                <select
                  value={filters.fileType}
                  onChange={(e) => setFilters(prev => ({ ...prev, fileType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="application/pdf">PDF</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/tiff">TIFF</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="needs_review">Needs Review</option>
                  <option value="failed">Failed</option>
                  <option value="processing">Processing</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Confidence
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={filters.minConfidence}
                  onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">
                  {Math.round(filters.minConfidence * 100)}%
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.dateRange.start}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, start: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.dateRange.end}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: { ...prev.dateRange, end: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <select
                  multiple
                  value={filters.tags}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    tags: Array.from(e.target.selectedOptions, option => option.value)
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  size={3}
                >
                  {availableTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Search Results Summary */}
        {searchResults.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">
              Found {searchResults.length} document{searchResults.length !== 1 ? 's' : ''} 
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          </div>
        )}
      </div>

      {/* Search Results */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Search Results</h3>
        
        {searchResults.length === 0 ? (
          <div className="text-center py-8">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {searchQuery || Object.values(filters).some(f => f && (Array.isArray(f) ? f.length > 0 : true))
                ? 'No documents found matching your search criteria'
                : 'Enter a search query or apply filters to find documents'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {searchResults.map((doc) => (
              <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">{doc.originalFileName}</h4>
                      <p className="text-sm text-gray-500">
                        Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                      {doc.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">
                      {Math.round(doc.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>

                {/* Extracted Fields Preview */}
                {Object.keys(doc.extractedData.fields).length > 0 && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Key Information:</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Object.entries(doc.extractedData.fields).slice(0, 4).map(([key, value]) => (
                        <div key={key} className="text-xs bg-gray-50 p-2 rounded">
                          <span className="font-medium text-gray-600">{key}:</span>
                          <span className="ml-1 text-gray-800">{String(value).substring(0, 50)}...</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <FileText className="h-3 w-3" />
                    <span>{doc.fileType.split('/')[1]?.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(doc.processedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Tag className="h-3 w-3" />
                    <span>{Object.keys(doc.extractedData.fields).length} fields</span>
                  </div>
                  <div>
                    <span>{(doc.fileSize / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                {/* OCR Text Preview */}
                <div className="mb-3">
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {doc.ocrResult.text.substring(0, 200)}...
                  </p>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedDocument(doc)}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View Details
                  </button>
                  <button
                    onClick={() => {
                      const exportData = {
                        metadata: doc.metadata,
                        extractedData: doc.extractedData,
                        ocrResult: { text: doc.ocrResult.text, confidence: doc.ocrResult.confidence }
                      };
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${doc.originalFileName}_data.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Details Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Document Details</h3>
              <button
                onClick={() => setSelectedDocument(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">File Name:</span>
                    <span className="ml-2 text-gray-600">{selectedDocument.originalFileName}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">File Type:</span>
                    <span className="ml-2 text-gray-600">{selectedDocument.fileType}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getStatusColor(selectedDocument.status)}`}>
                      {selectedDocument.status}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Confidence:</span>
                    <span className="ml-2 text-gray-600">{Math.round(selectedDocument.confidence * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Extracted Fields */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">Extracted Fields</h4>
                <div className="space-y-2">
                  {Object.entries(selectedDocument.extractedData.fields).map(([key, value]) => (
                    <div key={key} className="flex items-start space-x-2 text-sm">
                      <span className="font-medium text-gray-700 min-w-0 flex-shrink-0">{key}:</span>
                      <span className="text-gray-600 break-words">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* OCR Text */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">Full OCR Text</h4>
                <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700 max-h-40 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{selectedDocument.ocrResult.text}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}