import { ProcessedDocument } from '../types/documentProcessing';
import { securityService } from './securityService';

interface StorageIndex {
  id: string;
  fileName: string;
  fileType: string;
  extractedFields: string[];
  tags: string[];
  uploadDate: string;
  confidence: number;
  status: string;
  searchableText: string;
}

interface BackupRecord {
  id: string;
  documentId: string;
  backupDate: string;
  backupType: 'full' | 'incremental';
  location: string;
  checksum: string;
}

class DocumentStorageService {
  private documents: Map<string, ProcessedDocument> = new Map();
  private searchIndex: Map<string, StorageIndex> = new Map();
  private backupRecords: Map<string, BackupRecord> = new Map();
  private tags: Map<string, Set<string>> = new Map(); // tag -> document IDs

  async storeDocument(document: ProcessedDocument, userId: string): Promise<string> {
    try {
      // Encrypt sensitive data
      const encryptedDocument = this.encryptSensitiveFields(document);
      
      // Store document
      this.documents.set(document.id, encryptedDocument);
      
      // Create search index entry
      const indexEntry: StorageIndex = {
        id: document.id,
        fileName: document.originalFileName,
        fileType: document.fileType,
        extractedFields: Object.keys(document.extractedData.fields),
        tags: this.extractTags(document),
        uploadDate: document.uploadedAt,
        confidence: document.confidence,
        status: document.status,
        searchableText: this.createSearchableText(document)
      };
      
      this.searchIndex.set(document.id, indexEntry);
      
      // Update tag index
      this.updateTagIndex(document.id, indexEntry.tags);
      
      // Create backup
      await this.createBackup(document.id, 'full');
      
      // Log storage action
      securityService.logAction(
        userId,
        'document_stored',
        'document',
        document.id,
        {
          fileName: document.originalFileName,
          fileSize: document.fileSize,
          confidence: document.confidence
        }
      );
      
      return document.id;
    } catch (error) {
      securityService.logAction(
        userId,
        'document_storage_error',
        'document',
        document.id,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw error;
    }
  }

  async retrieveDocument(documentId: string, userId: string): Promise<ProcessedDocument | null> {
    try {
      const document = this.documents.get(documentId);
      if (!document) return null;
      
      // Decrypt sensitive fields
      const decryptedDocument = this.decryptSensitiveFields(document);
      
      // Log retrieval action
      securityService.logAction(
        userId,
        'document_retrieved',
        'document',
        documentId,
        { fileName: decryptedDocument.originalFileName }
      );
      
      return decryptedDocument;
    } catch (error) {
      securityService.logAction(
        userId,
        'document_retrieval_error',
        'document',
        documentId,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw error;
    }
  }

  async searchDocuments(
    query: string,
    filters?: {
      fileType?: string;
      status?: string;
      dateRange?: { start: string; end: string };
      tags?: string[];
      minConfidence?: number;
    },
    userId?: string
  ): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];
    const searchTerm = query.toLowerCase();
    
    for (const [documentId, indexEntry] of this.searchIndex.entries()) {
      let matches = false;
      
      // Text search
      if (!query || indexEntry.searchableText.toLowerCase().includes(searchTerm)) {
        matches = true;
      }
      
      // Apply filters
      if (matches && filters) {
        if (filters.fileType && indexEntry.fileType !== filters.fileType) {
          matches = false;
        }
        
        if (filters.status && indexEntry.status !== filters.status) {
          matches = false;
        }
        
        if (filters.minConfidence && indexEntry.confidence < filters.minConfidence) {
          matches = false;
        }
        
        if (filters.dateRange) {
          const docDate = new Date(indexEntry.uploadDate);
          const startDate = new Date(filters.dateRange.start);
          const endDate = new Date(filters.dateRange.end);
          if (docDate < startDate || docDate > endDate) {
            matches = false;
          }
        }
        
        if (filters.tags && filters.tags.length > 0) {
          const hasMatchingTag = filters.tags.some(tag => 
            indexEntry.tags.includes(tag)
          );
          if (!hasMatchingTag) {
            matches = false;
          }
        }
      }
      
      if (matches) {
        const document = this.documents.get(documentId);
        if (document) {
          results.push(this.decryptSensitiveFields(document));
        }
      }
    }
    
    // Log search action
    if (userId) {
      securityService.logAction(
        userId,
        'document_search',
        'document',
        'search_query',
        { query, resultsCount: results.length, filters }
      );
    }
    
    return results.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  async updateDocument(
    documentId: string,
    updates: Partial<ProcessedDocument>,
    userId: string
  ): Promise<boolean> {
    try {
      const existingDocument = this.documents.get(documentId);
      if (!existingDocument) return false;
      
      const updatedDocument = { ...existingDocument, ...updates };
      
      // Encrypt and store
      const encryptedDocument = this.encryptSensitiveFields(updatedDocument);
      this.documents.set(documentId, encryptedDocument);
      
      // Update search index
      const indexEntry = this.searchIndex.get(documentId);
      if (indexEntry) {
        indexEntry.extractedFields = Object.keys(updatedDocument.extractedData.fields);
        indexEntry.tags = this.extractTags(updatedDocument);
        indexEntry.confidence = updatedDocument.confidence;
        indexEntry.status = updatedDocument.status;
        indexEntry.searchableText = this.createSearchableText(updatedDocument);
        
        this.updateTagIndex(documentId, indexEntry.tags);
      }
      
      // Create incremental backup
      await this.createBackup(documentId, 'incremental');
      
      // Log update action
      securityService.logAction(
        userId,
        'document_updated',
        'document',
        documentId,
        { updatedFields: Object.keys(updates) }
      );
      
      return true;
    } catch (error) {
      securityService.logAction(
        userId,
        'document_update_error',
        'document',
        documentId,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw error;
    }
  }

  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const document = this.documents.get(documentId);
      if (!document) return false;
      
      // Remove from storage
      this.documents.delete(documentId);
      
      // Remove from search index
      const indexEntry = this.searchIndex.get(documentId);
      if (indexEntry) {
        this.searchIndex.delete(documentId);
        
        // Update tag index
        for (const tag of indexEntry.tags) {
          const tagDocuments = this.tags.get(tag);
          if (tagDocuments) {
            tagDocuments.delete(documentId);
            if (tagDocuments.size === 0) {
              this.tags.delete(tag);
            }
          }
        }
      }
      
      // Log deletion action
      securityService.logAction(
        userId,
        'document_deleted',
        'document',
        documentId,
        { fileName: document.originalFileName }
      );
      
      return true;
    } catch (error) {
      securityService.logAction(
        userId,
        'document_deletion_error',
        'document',
        documentId,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw error;
    }
  }

  async getDocumentsByTag(tag: string): Promise<ProcessedDocument[]> {
    const documentIds = this.tags.get(tag) || new Set();
    const documents: ProcessedDocument[] = [];
    
    for (const documentId of documentIds) {
      const document = this.documents.get(documentId);
      if (document) {
        documents.push(this.decryptSensitiveFields(document));
      }
    }
    
    return documents;
  }

  async getAllTags(): Promise<string[]> {
    return Array.from(this.tags.keys()).sort();
  }

  async getStorageStatistics(): Promise<{
    totalDocuments: number;
    totalSize: number;
    documentsByType: Record<string, number>;
    documentsByStatus: Record<string, number>;
    averageConfidence: number;
  }> {
    const documents = Array.from(this.documents.values());
    
    const stats = {
      totalDocuments: documents.length,
      totalSize: documents.reduce((sum, doc) => sum + doc.fileSize, 0),
      documentsByType: {} as Record<string, number>,
      documentsByStatus: {} as Record<string, number>,
      averageConfidence: 0
    };
    
    documents.forEach(doc => {
      // Count by type
      stats.documentsByType[doc.fileType] = (stats.documentsByType[doc.fileType] || 0) + 1;
      
      // Count by status
      stats.documentsByStatus[doc.status] = (stats.documentsByStatus[doc.status] || 0) + 1;
    });
    
    // Calculate average confidence
    if (documents.length > 0) {
      stats.averageConfidence = documents.reduce((sum, doc) => sum + doc.confidence, 0) / documents.length;
    }
    
    return stats;
  }

  private encryptSensitiveFields(document: ProcessedDocument): ProcessedDocument {
    const encryptedDocument = { ...document };
    
    // Encrypt extracted field values that might contain sensitive information
    const sensitiveFields = ['name', 'address', 'phone', 'email', 'id', 'ssn'];
    
    for (const [fieldName, value] of Object.entries(encryptedDocument.extractedData.fields)) {
      if (sensitiveFields.some(sf => fieldName.toLowerCase().includes(sf))) {
        if (typeof value === 'string') {
          encryptedDocument.extractedData.fields[fieldName] = securityService.encrypt(value);
        }
      }
    }
    
    return encryptedDocument;
  }

  private decryptSensitiveFields(document: ProcessedDocument): ProcessedDocument {
    const decryptedDocument = { ...document };
    
    // Decrypt extracted field values
    const sensitiveFields = ['name', 'address', 'phone', 'email', 'id', 'ssn'];
    
    for (const [fieldName, value] of Object.entries(decryptedDocument.extractedData.fields)) {
      if (sensitiveFields.some(sf => fieldName.toLowerCase().includes(sf))) {
        if (typeof value === 'string') {
          try {
            decryptedDocument.extractedData.fields[fieldName] = securityService.decrypt(value);
          } catch (error) {
            // If decryption fails, assume it's not encrypted
            console.warn(`Failed to decrypt field ${fieldName}:`, error);
          }
        }
      }
    }
    
    return decryptedDocument;
  }

  private extractTags(document: ProcessedDocument): string[] {
    const tags: string[] = [];
    
    // Add file type as tag
    tags.push(document.fileType.split('/')[1] || document.fileType);
    
    // Add status as tag
    tags.push(document.status);
    
    // Add extracted field names as tags
    tags.push(...Object.keys(document.extractedData.fields));
    
    // Add metadata-based tags
    if (document.metadata.documentType) {
      tags.push(document.metadata.documentType);
    }
    
    if (document.metadata.language) {
      tags.push(document.metadata.language);
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private createSearchableText(document: ProcessedDocument): string {
    const searchableText: string[] = [];
    
    // Add filename
    searchableText.push(document.originalFileName);
    
    // Add OCR text
    searchableText.push(document.ocrResult.text);
    
    // Add extracted field values
    Object.values(document.extractedData.fields).forEach(value => {
      if (typeof value === 'string') {
        searchableText.push(value);
      } else {
        searchableText.push(String(value));
      }
    });
    
    // Add metadata
    if (document.metadata.title) searchableText.push(document.metadata.title);
    if (document.metadata.author) searchableText.push(document.metadata.author);
    if (document.metadata.subject) searchableText.push(document.metadata.subject);
    if (document.metadata.keywords) searchableText.push(...document.metadata.keywords);
    
    return searchableText.join(' ').toLowerCase();
  }

  private updateTagIndex(documentId: string, tags: string[]): void {
    // Remove document from old tags
    for (const [tag, documentIds] of this.tags.entries()) {
      documentIds.delete(documentId);
      if (documentIds.size === 0) {
        this.tags.delete(tag);
      }
    }
    
    // Add document to new tags
    for (const tag of tags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(documentId);
    }
  }

  private async createBackup(documentId: string, backupType: 'full' | 'incremental'): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) return;
    
    const backupId = this.generateId('backup');
    const backupRecord: BackupRecord = {
      id: backupId,
      documentId,
      backupDate: new Date().toISOString(),
      backupType,
      location: `backup/${backupType}/${documentId}`,
      checksum: this.calculateChecksum(document)
    };
    
    this.backupRecords.set(backupId, backupRecord);
    
    // In production, this would actually store the backup to a secure location
    console.log(`Created ${backupType} backup for document ${documentId}`);
  }

  private calculateChecksum(document: ProcessedDocument): string {
    // Simple checksum calculation - in production, use a proper hash function
    const documentString = JSON.stringify(document);
    let hash = 0;
    for (let i = 0; i < documentString.length; i++) {
      const char = documentString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Backup and recovery methods
  async restoreFromBackup(backupId: string, userId: string): Promise<boolean> {
    try {
      const backupRecord = this.backupRecords.get(backupId);
      if (!backupRecord) return false;
      
      // In production, this would restore from actual backup storage
      securityService.logAction(
        userId,
        'document_restored',
        'document',
        backupRecord.documentId,
        { backupId, backupDate: backupRecord.backupDate }
      );
      
      return true;
    } catch (error) {
      securityService.logAction(
        userId,
        'document_restore_error',
        'document',
        backupId,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      return false;
    }
  }

  async getBackupHistory(documentId: string): Promise<BackupRecord[]> {
    return Array.from(this.backupRecords.values())
      .filter(backup => backup.documentId === documentId)
      .sort((a, b) => new Date(b.backupDate).getTime() - new Date(a.backupDate).getTime());
  }
}

export const documentStorageService = new DocumentStorageService();