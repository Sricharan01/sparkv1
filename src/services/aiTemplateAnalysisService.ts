import { securityService } from './securityService';
import { azureDocumentIntelligenceService } from './azureDocumentIntelligenceService';

interface TemplateAnalysisResult {
  recommendedTemplate: string;
  confidence: number;
  reasoning: string;
  fieldMappings: Record<string, any>;
  categoryScores: Record<string, number>;
}

interface OpenAIAnalysisResult {
  templateMatch: string;
  confidence: number;
  reasoning: string;
  extractedFields: Record<string, any>;
}

interface AzureTextAnalyticsResult {
  entities: Array<{
    text: string;
    category: string;
    subcategory?: string;
    confidence: number;
  }>;
  keyPhrases: string[];
  sentiment: {
    sentiment: string;
    confidence: number;
  };
}

class AITemplateAnalysisService {
  private openAIApiKey = 'sk-proj-your-openai-key-here'; // Replace with actual key
  private azureTextAnalyticsEndpoint = 'https://spark-text-analytics.cognitiveservices.azure.com/';
  private azureTextAnalyticsKey = 'your-azure-text-analytics-key'; // Replace with actual key

  // Predefined letter templates with their characteristics
  private letterTemplates = {
    'Earned Leave Letter': {
      keywords: ['earned leave', 'annual leave', 'vacation', 'leave application', 'time off', 'absence'],
      patterns: ['leave period', 'from date', 'to date', 'duration', 'reason for leave'],
      entities: ['PERSON', 'DATE', 'ORGANIZATION'],
      structure: {
        applicantName: 'string',
        employeeId: 'string',
        department: 'string',
        leaveType: 'string',
        startDate: 'date',
        endDate: 'date',
        duration: 'number',
        reason: 'string',
        supervisorName: 'string',
        applicationDate: 'date'
      }
    },
    'Medical Leave Letter': {
      keywords: ['medical leave', 'sick leave', 'health', 'medical certificate', 'doctor', 'illness', 'treatment'],
      patterns: ['medical condition', 'doctor recommendation', 'recovery period', 'medical certificate'],
      entities: ['PERSON', 'DATE', 'ORGANIZATION', 'HEALTHCARE'],
      structure: {
        patientName: 'string',
        employeeId: 'string',
        medicalCondition: 'string',
        doctorName: 'string',
        hospitalName: 'string',
        leaveStartDate: 'date',
        leaveEndDate: 'date',
        certificateNumber: 'string',
        treatmentDetails: 'string',
        applicationDate: 'date'
      }
    },
    'Punishment Letter': {
      keywords: ['disciplinary action', 'punishment', 'misconduct', 'violation', 'penalty', 'suspension', 'warning'],
      patterns: ['violation of', 'disciplinary action', 'penalty imposed', 'misconduct on'],
      entities: ['PERSON', 'DATE', 'ORGANIZATION', 'LEGAL'],
      structure: {
        officerName: 'string',
        badgeNumber: 'string',
        rank: 'string',
        violationType: 'string',
        incidentDate: 'date',
        punishmentType: 'string',
        duration: 'string',
        issuingAuthority: 'string',
        effectiveDate: 'date',
        appealRights: 'string'
      }
    },
    'Reward Letter': {
      keywords: ['award', 'recognition', 'commendation', 'excellence', 'achievement', 'honor', 'merit'],
      patterns: ['awarded for', 'recognition of', 'outstanding performance', 'exemplary service'],
      entities: ['PERSON', 'DATE', 'ORGANIZATION', 'ACHIEVEMENT'],
      structure: {
        recipientName: 'string',
        badgeNumber: 'string',
        rank: 'string',
        awardType: 'string',
        achievementDescription: 'string',
        awardDate: 'date',
        issuingAuthority: 'string',
        witnessNames: 'array',
        monetaryValue: 'number',
        ceremonyDetails: 'string'
      }
    },
    'Probation Letter': {
      keywords: ['probation', 'probationary period', 'conditional employment', 'trial period', 'evaluation'],
      patterns: ['probationary period', 'evaluation period', 'conditional status', 'trial employment'],
      entities: ['PERSON', 'DATE', 'ORGANIZATION', 'EMPLOYMENT'],
      structure: {
        employeeName: 'string',
        employeeId: 'string',
        position: 'string',
        probationStartDate: 'date',
        probationEndDate: 'date',
        evaluationCriteria: 'array',
        supervisorName: 'string',
        reviewSchedule: 'string',
        conditions: 'array',
        issuanceDate: 'date'
      }
    }
  };

  async analyzeJSONData(jsonData: any, userId: string): Promise<TemplateAnalysisResult> {
    try {
      // Log analysis start
      securityService.logAction(
        userId,
        'ai_template_analysis_start',
        'template',
        'json_analysis',
        { dataKeys: Object.keys(jsonData), dataSize: JSON.stringify(jsonData).length }
      );

      // Step 1: Azure Text Analytics for field categorization
      const azureAnalysis = await this.performAzureTextAnalysis(jsonData);

      // Step 2: OpenAI API for context understanding
      const openAIAnalysis = await this.performOpenAIAnalysis(jsonData, azureAnalysis);

      // Step 3: Pattern matching against predefined templates
      const patternMatching = this.performPatternMatching(jsonData, azureAnalysis);

      // Step 4: Combine results and determine best match
      const finalResult = this.combineAnalysisResults(
        azureAnalysis,
        openAIAnalysis,
        patternMatching,
        jsonData
      );

      // Log successful analysis
      securityService.logAction(
        userId,
        'ai_template_analysis_complete',
        'template',
        'json_analysis',
        {
          recommendedTemplate: finalResult.recommendedTemplate,
          confidence: finalResult.confidence,
          fieldsAnalyzed: Object.keys(jsonData).length
        }
      );

      return finalResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI template analysis failed';
      
      // Log analysis error
      securityService.logAction(
        userId,
        'ai_template_analysis_error',
        'template',
        'json_analysis',
        { error: errorMessage }
      );

      throw new Error(`AI template analysis failed: ${errorMessage}`);
    }
  }

  private async performAzureTextAnalysis(jsonData: any): Promise<AzureTextAnalyticsResult> {
    try {
      // Convert JSON data to text for analysis
      const textContent = this.extractTextFromJSON(jsonData);

      // Analyze entities
      const entitiesResponse = await fetch(
        `${this.azureTextAnalyticsEndpoint}text/analytics/v3.1/entities/recognition/general`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureTextAnalyticsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documents: [{
              id: '1',
              language: 'en',
              text: textContent
            }]
          })
        }
      );

      // Analyze key phrases
      const keyPhrasesResponse = await fetch(
        `${this.azureTextAnalyticsEndpoint}text/analytics/v3.1/keyPhrases`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureTextAnalyticsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documents: [{
              id: '1',
              language: 'en',
              text: textContent
            }]
          })
        }
      );

      // Analyze sentiment
      const sentimentResponse = await fetch(
        `${this.azureTextAnalyticsEndpoint}text/analytics/v3.1/sentiment`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureTextAnalyticsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documents: [{
              id: '1',
              language: 'en',
              text: textContent
            }]
          })
        }
      );

      const entitiesData = await entitiesResponse.json();
      const keyPhrasesData = await keyPhrasesResponse.json();
      const sentimentData = await sentimentResponse.json();

      return {
        entities: entitiesData.documents[0]?.entities || [],
        keyPhrases: keyPhrasesData.documents[0]?.keyPhrases || [],
        sentiment: sentimentData.documents[0]?.sentiment || { sentiment: 'neutral', confidence: 0.5 }
      };

    } catch (error) {
      console.warn('Azure Text Analytics failed, using fallback analysis:', error);
      return this.performFallbackTextAnalysis(jsonData);
    }
  }

  private async performOpenAIAnalysis(
    jsonData: any,
    azureAnalysis: AzureTextAnalyticsResult
  ): Promise<OpenAIAnalysisResult> {
    try {
      const prompt = this.buildOpenAIPrompt(jsonData, azureAnalysis);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openAIApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{
            role: 'system',
            content: 'You are an expert document classifier specializing in police and administrative documents. Analyze the provided data and determine the most appropriate template.'
          }, {
            role: 'user',
            content: prompt
          }],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      const data = await response.json();
      const analysis = JSON.parse(data.choices[0].message.content);

      return {
        templateMatch: analysis.templateMatch,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        extractedFields: analysis.extractedFields
      };

    } catch (error) {
      console.warn('OpenAI analysis failed, using fallback analysis:', error);
      return this.performFallbackOpenAIAnalysis(jsonData, azureAnalysis);
    }
  }

  private performPatternMatching(
    jsonData: any,
    azureAnalysis: AzureTextAnalyticsResult
  ): Record<string, number> {
    const scores: Record<string, number> = {};
    const textContent = this.extractTextFromJSON(jsonData).toLowerCase();
    const fieldNames = Object.keys(jsonData).map(key => key.toLowerCase());
    const entities = azureAnalysis.entities.map(e => e.category);
    const keyPhrases = azureAnalysis.keyPhrases.map(p => p.toLowerCase());

    for (const [templateName, template] of Object.entries(this.letterTemplates)) {
      let score = 0;

      // Keyword matching
      for (const keyword of template.keywords) {
        if (textContent.includes(keyword.toLowerCase())) {
          score += 20;
        }
      }

      // Pattern matching
      for (const pattern of template.patterns) {
        if (textContent.includes(pattern.toLowerCase())) {
          score += 15;
        }
      }

      // Entity matching
      for (const entityType of template.entities) {
        if (entities.includes(entityType)) {
          score += 10;
        }
      }

      // Field structure matching
      const structureKeys = Object.keys(template.structure).map(k => k.toLowerCase());
      for (const fieldName of fieldNames) {
        for (const structureKey of structureKeys) {
          if (fieldName.includes(structureKey) || structureKey.includes(fieldName)) {
            score += 25;
          }
        }
      }

      // Key phrase matching
      for (const phrase of keyPhrases) {
        for (const keyword of template.keywords) {
          if (phrase.includes(keyword.toLowerCase())) {
            score += 5;
          }
        }
      }

      scores[templateName] = score;
    }

    return scores;
  }

  private combineAnalysisResults(
    azureAnalysis: AzureTextAnalyticsResult,
    openAIAnalysis: OpenAIAnalysisResult,
    patternScores: Record<string, number>,
    jsonData: any
  ): TemplateAnalysisResult {
    // Normalize pattern scores to 0-1 range
    const maxPatternScore = Math.max(...Object.values(patternScores));
    const normalizedPatternScores: Record<string, number> = {};
    
    for (const [template, score] of Object.entries(patternScores)) {
      normalizedPatternScores[template] = maxPatternScore > 0 ? score / maxPatternScore : 0;
    }

    // Combine scores with weights
    const combinedScores: Record<string, number> = {};
    const openAIWeight = 0.4;
    const patternWeight = 0.6;

    for (const templateName of Object.keys(this.letterTemplates)) {
      const openAIScore = openAIAnalysis.templateMatch === templateName ? openAIAnalysis.confidence : 0;
      const patternScore = normalizedPatternScores[templateName] || 0;
      
      combinedScores[templateName] = (openAIScore * openAIWeight) + (patternScore * patternWeight);
    }

    // Find best match
    const bestTemplate = Object.entries(combinedScores).reduce((best, [template, score]) => 
      score > best.score ? { template, score } : best,
      { template: 'Earned Leave Letter', score: 0 }
    );

    // Map fields to template structure
    const templateStructure = this.letterTemplates[bestTemplate.template as keyof typeof this.letterTemplates].structure;
    const fieldMappings = this.mapFieldsToTemplate(jsonData, templateStructure, azureAnalysis);

    return {
      recommendedTemplate: bestTemplate.template,
      confidence: Math.min(bestTemplate.score, 1),
      reasoning: this.generateReasoning(bestTemplate.template, azureAnalysis, openAIAnalysis, patternScores),
      fieldMappings,
      categoryScores: combinedScores
    };
  }

  private mapFieldsToTemplate(
    jsonData: any,
    templateStructure: Record<string, string>,
    azureAnalysis: AzureTextAnalyticsResult
  ): Record<string, any> {
    const mappedFields: Record<string, any> = {};
    const jsonKeys = Object.keys(jsonData).map(k => k.toLowerCase());

    for (const [templateField, fieldType] of Object.entries(templateStructure)) {
      const templateFieldLower = templateField.toLowerCase();
      
      // Direct field name matching
      for (const [jsonKey, jsonValue] of Object.entries(jsonData)) {
        const jsonKeyLower = jsonKey.toLowerCase();
        
        if (jsonKeyLower.includes(templateFieldLower) || templateFieldLower.includes(jsonKeyLower)) {
          mappedFields[templateField] = this.convertValueToType(jsonValue, fieldType);
          break;
        }
      }

      // Entity-based mapping
      if (!mappedFields[templateField]) {
        for (const entity of azureAnalysis.entities) {
          if (this.isEntityRelevantToField(entity, templateField)) {
            mappedFields[templateField] = this.convertValueToType(entity.text, fieldType);
            break;
          }
        }
      }

      // Semantic similarity mapping
      if (!mappedFields[templateField]) {
        const similarField = this.findSimilarField(templateField, jsonKeys);
        if (similarField) {
          const originalKey = Object.keys(jsonData).find(k => k.toLowerCase() === similarField);
          if (originalKey) {
            mappedFields[templateField] = this.convertValueToType(jsonData[originalKey], fieldType);
          }
        }
      }
    }

    return mappedFields;
  }

  private extractTextFromJSON(jsonData: any): string {
    const extractText = (obj: any): string[] => {
      const texts: string[] = [];
      
      for (const [key, value] of Object.entries(obj)) {
        texts.push(key);
        
        if (typeof value === 'string') {
          texts.push(value);
        } else if (typeof value === 'object' && value !== null) {
          texts.push(...extractText(value));
        } else {
          texts.push(String(value));
        }
      }
      
      return texts;
    };

    return extractText(jsonData).join(' ');
  }

  private buildOpenAIPrompt(jsonData: any, azureAnalysis: AzureTextAnalyticsResult): string {
    return `
Analyze the following JSON data and determine which letter template it best matches:

JSON Data:
${JSON.stringify(jsonData, null, 2)}

Azure Text Analytics Results:
- Entities: ${azureAnalysis.entities.map(e => `${e.text} (${e.category})`).join(', ')}
- Key Phrases: ${azureAnalysis.keyPhrases.join(', ')}
- Sentiment: ${azureAnalysis.sentiment.sentiment} (${azureAnalysis.sentiment.confidence})

Available Templates:
1. Earned Leave Letter - For vacation/annual leave requests
2. Medical Leave Letter - For health-related leave requests
3. Punishment Letter - For disciplinary actions and penalties
4. Reward Letter - For awards, recognition, and commendations
5. Probation Letter - For probationary employment periods

Please respond with a JSON object containing:
{
  "templateMatch": "exact template name from the list above",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation of why this template was chosen",
  "extractedFields": {
    "field1": "value1",
    "field2": "value2"
  }
}

Consider field names, values, context, entities, and overall document purpose.
`;
  }

  private performFallbackTextAnalysis(jsonData: any): AzureTextAnalyticsResult {
    const textContent = this.extractTextFromJSON(jsonData);
    
    // Basic entity extraction using patterns
    const entities = [];
    const datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/g;
    const namePattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
    
    const dates = textContent.match(datePattern) || [];
    const names = textContent.match(namePattern) || [];
    
    dates.forEach(date => entities.push({ text: date, category: 'DATE', confidence: 0.8 }));
    names.forEach(name => entities.push({ text: name, category: 'PERSON', confidence: 0.7 }));

    // Basic key phrase extraction
    const words = textContent.toLowerCase().split(/\s+/);
    const keyPhrases = words.filter(word => word.length > 4).slice(0, 10);

    return {
      entities,
      keyPhrases,
      sentiment: { sentiment: 'neutral', confidence: 0.5 }
    };
  }

  private performFallbackOpenAIAnalysis(
    jsonData: any,
    azureAnalysis: AzureTextAnalyticsResult
  ): OpenAIAnalysisResult {
    const textContent = this.extractTextFromJSON(jsonData).toLowerCase();
    
    // Simple keyword-based classification
    let bestMatch = 'Earned Leave Letter';
    let confidence = 0.5;
    
    if (textContent.includes('medical') || textContent.includes('sick') || textContent.includes('health')) {
      bestMatch = 'Medical Leave Letter';
      confidence = 0.8;
    } else if (textContent.includes('punishment') || textContent.includes('disciplinary') || textContent.includes('violation')) {
      bestMatch = 'Punishment Letter';
      confidence = 0.8;
    } else if (textContent.includes('award') || textContent.includes('recognition') || textContent.includes('commendation')) {
      bestMatch = 'Reward Letter';
      confidence = 0.8;
    } else if (textContent.includes('probation') || textContent.includes('trial') || textContent.includes('evaluation')) {
      bestMatch = 'Probation Letter';
      confidence = 0.8;
    }

    return {
      templateMatch: bestMatch,
      confidence,
      reasoning: `Fallback analysis based on keyword matching in document content.`,
      extractedFields: {}
    };
  }

  private convertValueToType(value: any, type: string): any {
    switch (type) {
      case 'date':
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString().split('T')[0];
      case 'number':
        const num = parseFloat(String(value));
        return isNaN(num) ? 0 : num;
      case 'array':
        return Array.isArray(value) ? value : [value];
      default:
        return String(value);
    }
  }

  private isEntityRelevantToField(entity: any, fieldName: string): boolean {
    const fieldLower = fieldName.toLowerCase();
    const entityCategory = entity.category.toLowerCase();
    
    if (fieldLower.includes('name') && entityCategory === 'person') return true;
    if (fieldLower.includes('date') && entityCategory === 'date') return true;
    if (fieldLower.includes('organization') && entityCategory === 'organization') return true;
    if (fieldLower.includes('location') && entityCategory === 'location') return true;
    
    return false;
  }

  private findSimilarField(templateField: string, jsonKeys: string[]): string | null {
    const templateWords = templateField.toLowerCase().split(/(?=[A-Z])/).map(w => w.toLowerCase());
    
    for (const jsonKey of jsonKeys) {
      const jsonWords = jsonKey.split(/[_\s-]/).map(w => w.toLowerCase());
      
      const commonWords = templateWords.filter(tw => 
        jsonWords.some(jw => jw.includes(tw) || tw.includes(jw))
      );
      
      if (commonWords.length > 0) {
        return jsonKey;
      }
    }
    
    return null;
  }

  private generateReasoning(
    selectedTemplate: string,
    azureAnalysis: AzureTextAnalyticsResult,
    openAIAnalysis: OpenAIAnalysisResult,
    patternScores: Record<string, number>
  ): string {
    const reasons = [];
    
    reasons.push(`Selected template: ${selectedTemplate}`);
    
    if (azureAnalysis.entities.length > 0) {
      reasons.push(`Detected entities: ${azureAnalysis.entities.map(e => e.category).join(', ')}`);
    }
    
    if (azureAnalysis.keyPhrases.length > 0) {
      reasons.push(`Key phrases found: ${azureAnalysis.keyPhrases.slice(0, 3).join(', ')}`);
    }
    
    const topPatterns = Object.entries(patternScores)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([template, score]) => `${template}: ${score.toFixed(1)}`);
    
    if (topPatterns.length > 0) {
      reasons.push(`Pattern matching scores: ${topPatterns.join(', ')}`);
    }
    
    if (openAIAnalysis.reasoning) {
      reasons.push(`AI analysis: ${openAIAnalysis.reasoning}`);
    }
    
    return reasons.join('. ');
  }

  // Public method to get template structures for JSON formatting
  getTemplateStructures(): Record<string, any> {
    return this.letterTemplates;
  }

  // Method to format document data according to template structure
  formatDocumentAsJSON(
    templateName: string,
    extractedFields: Record<string, any>,
    originalData?: any
  ): any {
    const template = this.letterTemplates[templateName as keyof typeof this.letterTemplates];
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    const formattedDocument: any = {
      templateType: templateName,
      generatedAt: new Date().toISOString(),
      version: '1.0',
      data: {}
    };

    // Map fields according to template structure
    for (const [fieldName, fieldType] of Object.entries(template.structure)) {
      if (extractedFields[fieldName] !== undefined) {
        formattedDocument.data[fieldName] = this.convertValueToType(extractedFields[fieldName], fieldType);
      } else {
        // Set default values based on type
        switch (fieldType) {
          case 'string':
            formattedDocument.data[fieldName] = '';
            break;
          case 'date':
            formattedDocument.data[fieldName] = null;
            break;
          case 'number':
            formattedDocument.data[fieldName] = 0;
            break;
          case 'array':
            formattedDocument.data[fieldName] = [];
            break;
          default:
            formattedDocument.data[fieldName] = null;
        }
      }
    }

    // Add metadata
    formattedDocument.metadata = {
      originalFields: originalData ? Object.keys(originalData) : [],
      processingMethod: 'ai-template-analysis',
      confidence: 0.85,
      extractedAt: new Date().toISOString()
    };

    return formattedDocument;
  }
}

export const aiTemplateAnalysisService = new AITemplateAnalysisService();
export type { TemplateAnalysisResult };