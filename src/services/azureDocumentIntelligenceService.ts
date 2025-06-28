import { securityService } from './securityService';
import { DocumentType } from '../types';

interface AzureDocumentResult {
  extractedText: string;
  confidence: number;
  matchedTemplate: DocumentType | null;
  templateMatchConfidence: number;
  extractedFields: Record<string, any>;
  fieldConfidences: Record<string, number>;
  pages: PageResult[];
  tables: TableResult[];
  keyValuePairs: KeyValuePair[];
  entities: EntityResult[];
  processingTime: number;
}

interface PageResult {
  pageNumber: number;
  width: number;
  height: number;
  angle: number;
  unit: string;
  lines: LineResult[];
  words: WordResult[];
}

interface LineResult {
  content: string;
  boundingBox: number[];
  spans: Span[];
}

interface WordResult {
  content: string;
  boundingBox: number[];
  confidence: number;
  span: Span;
}

interface Span {
  offset: number;
  length: number;
}

interface TableResult {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
  boundingRegions: BoundingRegion[];
}

interface TableCell {
  kind: string;
  rowIndex: number;
  columnIndex: number;
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

interface BoundingRegion {
  pageNumber: number;
  boundingBox: number[];
}

interface KeyValuePair {
  key: {
    content: string;
    boundingRegions: BoundingRegion[];
    spans: Span[];
  };
  value: {
    content: string;
    boundingRegions: BoundingRegion[];
    spans: Span[];
  };
  confidence: number;
}

interface EntityResult {
  category: string;
  subCategory?: string;
  content: string;
  boundingRegions: BoundingRegion[];
  confidence: number;
  spans: Span[];
}

class AzureDocumentIntelligenceService {
  private endpoint = 'https://spark-01.cognitiveservices.azure.com/';
  private apiKey = 'DzYSXfu4Bd4xmGOYBd8H5gLlJr1v2L0ltdzimXuLXjpSop2uqEYiJQQJ99BFACYeBjFXJ3w3AAALACOGfoJq';
  private apiVersion = '2023-07-31';

  async processDocument(
    file: File,
    templates: DocumentType[],
    userId: string
  ): Promise<AzureDocumentResult> {
    const startTime = Date.now();

    try {
      // Log processing start
      securityService.logAction(
        userId,
        'azure_document_intelligence_start',
        'document',
        file.name,
        { 
          fileSize: file.size, 
          fileType: file.type,
          templatesCount: templates.length,
          endpoint: this.endpoint
        }
      );

      // Step 1: Analyze document with Azure Document Intelligence
      const analysisResult = await this.analyzeDocument(file);

      // Step 2: Extract text content
      const extractedText = this.extractFullText(analysisResult);

      // Step 3: Find best matching template
      const templateMatch = this.findBestMatchingTemplate(extractedText, analysisResult, templates);

      // Step 4: Extract fields based on matched template
      const fieldExtraction = this.extractFieldsFromTemplate(
        extractedText,
        analysisResult,
        templateMatch.template
      );

      // Step 5: Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(
        analysisResult,
        templateMatch.confidence,
        fieldExtraction.fieldConfidences
      );

      const processingTime = Date.now() - startTime;

      const result: AzureDocumentResult = {
        extractedText,
        confidence: overallConfidence,
        matchedTemplate: templateMatch.template,
        templateMatchConfidence: templateMatch.confidence,
        extractedFields: fieldExtraction.fields,
        fieldConfidences: fieldExtraction.fieldConfidences,
        pages: analysisResult.pages || [],
        tables: analysisResult.tables || [],
        keyValuePairs: analysisResult.keyValuePairs || [],
        entities: this.extractEntities(analysisResult),
        processingTime
      };

      // Log successful processing
      securityService.logAction(
        userId,
        'azure_document_intelligence_complete',
        'document',
        file.name,
        {
          confidence: overallConfidence,
          templateMatched: templateMatch.template?.name,
          templateConfidence: templateMatch.confidence,
          fieldsExtracted: Object.keys(fieldExtraction.fields).length,
          processingTime
        }
      );

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Azure Document Intelligence processing failed';
      
      // Log processing error
      securityService.logAction(
        userId,
        'azure_document_intelligence_error',
        'document',
        file.name,
        { error: errorMessage }
      );

      throw new Error(`Azure Document Intelligence processing failed: ${errorMessage}`);
    }
  }

  private async analyzeDocument(file: File): Promise<any> {
    try {
      // Convert file to base64 for API call
      const base64Data = await this.fileToBase64(file);

      // Use prebuilt-document model for general document analysis
      const analyzeUrl = `${this.endpoint}formrecognizer/documentModels/prebuilt-document:analyze?api-version=${this.apiVersion}`;

      const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64Source: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`Azure API error: ${response.status} ${response.statusText}`);
      }

      // Get operation location for polling
      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) {
        throw new Error('No operation location returned from Azure API');
      }

      // Poll for results
      return await this.pollForResults(operationLocation);

    } catch (error) {
      console.error('Azure Document Intelligence API error:', error);
      throw error;
    }
  }

  private async pollForResults(operationLocation: string): Promise<any> {
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(operationLocation, {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey
          }
        });

        if (!response.ok) {
          throw new Error(`Polling error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (result.status === 'succeeded') {
          return result.analyzeResult;
        } else if (result.status === 'failed') {
          throw new Error(`Document analysis failed: ${result.error?.message || 'Unknown error'}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Document analysis timed out');
  }

  private extractFullText(analysisResult: any): string {
    if (analysisResult.content) {
      return analysisResult.content;
    }

    // Fallback: extract from pages
    if (analysisResult.pages) {
      return analysisResult.pages
        .map((page: any) => 
          page.lines?.map((line: any) => line.content).join('\n') || ''
        )
        .join('\n\n');
    }

    return '';
  }

  private findBestMatchingTemplate(
    extractedText: string,
    analysisResult: any,
    templates: DocumentType[]
  ): { template: DocumentType | null; confidence: number } {
    if (templates.length === 0) {
      return { template: null, confidence: 0 };
    }

    let bestMatch: DocumentType | null = null;
    let bestScore = 0;

    const textLower = extractedText.toLowerCase();
    const keyValuePairs = analysisResult.keyValuePairs || [];

    for (const template of templates) {
      let score = 0;
      let matchedFields = 0;

      // Check template fields against extracted content
      for (const field of template.template) {
        const fieldLabel = field.label.toLowerCase();
        
        // Check if field label appears in text
        if (textLower.includes(fieldLabel)) {
          score += 10;
          matchedFields++;
        }

        // Check key-value pairs for field matches
        for (const kvp of keyValuePairs) {
          const keyContent = kvp.key?.content?.toLowerCase() || '';
          if (keyContent.includes(fieldLabel) || fieldLabel.includes(keyContent)) {
            score += 15;
            matchedFields++;
            break;
          }
        }

        // Pattern-based matching for specific field types
        if (field.type === 'date' && this.containsDatePattern(textLower)) {
          score += 5;
        }
        if (field.type === 'number' && this.containsNumberPattern(textLower)) {
          score += 5;
        }
      }

      // Template-specific keyword matching
      const templateKeywords = this.getTemplateKeywords(template);
      for (const keyword of templateKeywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          score += 20;
        }
      }

      // Calculate confidence as percentage of matched fields
      const fieldMatchRatio = matchedFields / template.template.length;
      const finalScore = score * fieldMatchRatio;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = template;
      }
    }

    // Normalize confidence to 0-1 range
    const confidence = Math.min(bestScore / 100, 1);

    return { template: bestMatch, confidence };
  }

  private extractFieldsFromTemplate(
    extractedText: string,
    analysisResult: any,
    template: DocumentType | null
  ): { fields: Record<string, any>; fieldConfidences: Record<string, number> } {
    const fields: Record<string, any> = {};
    const fieldConfidences: Record<string, number> = {};

    if (!template) {
      return { fields, fieldConfidences };
    }

    const keyValuePairs = analysisResult.keyValuePairs || [];
    const entities = this.extractEntities(analysisResult);

    for (const fieldDef of template.template) {
      const fieldId = fieldDef.id;
      let fieldValue: any = null;
      let confidence = 0;

      // Method 1: Key-value pair matching
      const kvpMatch = this.findKeyValueMatch(fieldDef, keyValuePairs);
      if (kvpMatch) {
        fieldValue = kvpMatch.value;
        confidence = Math.max(confidence, kvpMatch.confidence);
      }

      // Method 2: Entity matching
      const entityMatch = this.findEntityMatch(fieldDef, entities);
      if (entityMatch) {
        if (!fieldValue || entityMatch.confidence > confidence) {
          fieldValue = entityMatch.value;
          confidence = entityMatch.confidence;
        }
      }

      // Method 3: Pattern-based extraction
      const patternMatch = this.extractByPattern(fieldDef, extractedText);
      if (patternMatch) {
        if (!fieldValue || patternMatch.confidence > confidence) {
          fieldValue = patternMatch.value;
          confidence = patternMatch.confidence;
        }
      }

      // Method 4: Contextual extraction
      const contextMatch = this.extractByContext(fieldDef, extractedText);
      if (contextMatch) {
        if (!fieldValue || contextMatch.confidence > confidence) {
          fieldValue = contextMatch.value;
          confidence = contextMatch.confidence;
        }
      }

      // Type conversion and validation
      if (fieldValue) {
        fieldValue = this.convertFieldType(fieldValue, fieldDef.type);
        fields[fieldId] = fieldValue;
        fieldConfidences[fieldId] = confidence;
      } else {
        fieldConfidences[fieldId] = 0;
      }
    }

    return { fields, fieldConfidences };
  }

  private findKeyValueMatch(fieldDef: any, keyValuePairs: KeyValuePair[]): { value: string; confidence: number } | null {
    const fieldLabel = fieldDef.label.toLowerCase();
    
    for (const kvp of keyValuePairs) {
      const keyContent = kvp.key?.content?.toLowerCase() || '';
      const valueContent = kvp.value?.content || '';
      
      if (keyContent.includes(fieldLabel) || fieldLabel.includes(keyContent)) {
        return {
          value: valueContent.trim(),
          confidence: kvp.confidence
        };
      }
    }
    
    return null;
  }

  private findEntityMatch(fieldDef: any, entities: EntityResult[]): { value: string; confidence: number } | null {
    const fieldType = fieldDef.type;
    const fieldLabel = fieldDef.label.toLowerCase();
    
    for (const entity of entities) {
      let isMatch = false;
      
      // Match by entity category
      if (fieldType === 'date' && entity.category === 'DateTime') {
        isMatch = true;
      } else if (fieldLabel.includes('person') || fieldLabel.includes('name')) {
        isMatch = entity.category === 'Person';
      } else if (fieldLabel.includes('organization') || fieldLabel.includes('station')) {
        isMatch = entity.category === 'Organization';
      } else if (fieldLabel.includes('location') || fieldLabel.includes('address')) {
        isMatch = entity.category === 'Location';
      }
      
      if (isMatch) {
        return {
          value: entity.content,
          confidence: entity.confidence
        };
      }
    }
    
    return null;
  }

  private extractByPattern(fieldDef: any, text: string): { value: string; confidence: number } | null {
    const patterns = this.getFieldPatterns(fieldDef);
    
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        return {
          value: match[1] || match[0],
          confidence: pattern.confidence
        };
      }
    }
    
    return null;
  }

  private extractByContext(fieldDef: any, text: string): { value: string; confidence: number } | null {
    const fieldLabel = fieldDef.label.toLowerCase();
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (line.includes(fieldLabel)) {
        // Look for value in same line
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex !== -1) {
          const value = lines[i].substring(colonIndex + 1).trim();
          if (value) {
            return { value, confidence: 0.7 };
          }
        }
        
        // Look for value in next line
        if (i + 1 < lines.length) {
          const nextLineValue = lines[i + 1].trim();
          if (nextLineValue && !nextLineValue.includes(':')) {
            return { value: nextLineValue, confidence: 0.6 };
          }
        }
      }
    }
    
    return null;
  }

  private getFieldPatterns(fieldDef: any): Array<{ regex: RegExp; confidence: number }> {
    const patterns: Array<{ regex: RegExp; confidence: number }> = [];
    
    switch (fieldDef.type) {
      case 'date':
        patterns.push(
          { regex: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g, confidence: 0.9 },
          { regex: /(\d{1,2}\s+\w+\s+\d{4})/g, confidence: 0.8 }
        );
        break;
      case 'number':
        patterns.push(
          { regex: /(\d+)/g, confidence: 0.8 }
        );
        break;
      default:
        // Text patterns based on field label
        const label = fieldDef.label.toLowerCase();
        if (label.includes('name')) {
          patterns.push(
            { regex: /([A-Z][a-z]+\s+[A-Z][a-z]+)/g, confidence: 0.7 }
          );
        }
        break;
    }
    
    return patterns;
  }

  private getTemplateKeywords(template: DocumentType): string[] {
    const keywords: string[] = [];
    
    switch (template.id) {
      case 'transfer':
        keywords.push('transfer', 'posting', 'station', 'officer', 'order');
        break;
      case 'award':
        keywords.push('award', 'certificate', 'recognition', 'medal', 'commendation');
        break;
      case 'complaint':
        keywords.push('complaint', 'grievance', 'disciplinary', 'incident');
        break;
      default:
        // Extract keywords from template name and field labels
        keywords.push(...template.name.toLowerCase().split(' '));
        keywords.push(...template.template.map(f => f.label.toLowerCase()));
        break;
    }
    
    return keywords;
  }

  private extractEntities(analysisResult: any): EntityResult[] {
    // Extract entities from Azure Document Intelligence result
    // This would include persons, organizations, locations, dates, etc.
    return analysisResult.entities || [];
  }

  private convertFieldType(value: string, type: string): any {
    switch (type) {
      case 'number':
        const num = parseFloat(value.replace(/[^\d.-]/g, ''));
        return isNaN(num) ? null : num;
      
      case 'date':
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString().split('T')[0];
      
      default:
        return value.trim();
    }
  }

  private calculateOverallConfidence(
    analysisResult: any,
    templateConfidence: number,
    fieldConfidences: Record<string, number>
  ): number {
    // Base confidence from Azure OCR
    const ocrConfidence = this.getAverageOCRConfidence(analysisResult);
    
    // Average field confidence
    const fieldValues = Object.values(fieldConfidences);
    const avgFieldConfidence = fieldValues.length > 0 
      ? fieldValues.reduce((sum, conf) => sum + conf, 0) / fieldValues.length
      : 0;
    
    // Weighted average
    return (ocrConfidence * 0.3 + templateConfidence * 0.3 + avgFieldConfidence * 0.4);
  }

  private getAverageOCRConfidence(analysisResult: any): number {
    if (analysisResult.pages) {
      let totalConfidence = 0;
      let wordCount = 0;
      
      for (const page of analysisResult.pages) {
        if (page.words) {
          for (const word of page.words) {
            totalConfidence += word.confidence || 0.8;
            wordCount++;
          }
        }
      }
      
      return wordCount > 0 ? totalConfidence / wordCount : 0.8;
    }
    
    return 0.8; // Default confidence
  }

  private containsDatePattern(text: string): boolean {
    return /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(text);
  }

  private containsNumberPattern(text: string): boolean {
    return /\d+/.test(text);
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Public method to check service availability
  async checkServiceHealth(): Promise<boolean> {
    try {
      const healthUrl = `${this.endpoint}formrecognizer/documentModels?api-version=${this.apiVersion}`;
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Azure service health check failed:', error);
      return false;
    }
  }

  // Get supported document models
  async getSupportedModels(): Promise<string[]> {
    try {
      const modelsUrl = `${this.endpoint}formrecognizer/documentModels?api-version=${this.apiVersion}`;
      
      const response = await fetch(modelsUrl, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.value?.map((model: any) => model.modelId) || [];
      }
      
      return ['prebuilt-document', 'prebuilt-layout', 'prebuilt-read'];
    } catch (error) {
      console.error('Failed to get supported models:', error);
      return ['prebuilt-document'];
    }
  }
}

export const azureDocumentIntelligenceService = new AzureDocumentIntelligenceService();
export type { AzureDocumentResult };