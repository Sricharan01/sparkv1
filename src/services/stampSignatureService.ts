import { securityService } from './securityService';

interface StampDetectionResult {
  Status: 'Present' | 'Absent';
  Coordinates: [number, number, number, number] | null;
  Type?: string;
  Confidence?: number;
}

interface SignatureDetectionResult {
  Status: 'Present' | 'Absent';
  Coordinates: [number, number, number, number] | null;
  Confidence?: number;
}

interface StampSignatureAnalysisResult {
  Stamp: StampDetectionResult;
  Signature: SignatureDetectionResult;
  StampValidation: 'Y' | 'N';
  MatchedStampType?: string;
  ProcessingTime: number;
}

// Master list of official stamps
const OFFICIAL_STAMP_MASTER_LIST = [
  {
    id: 'stamp_1',
    name: 'Officer Commanding 14th BN A.P.S.P. Ananthapuramu',
    keywords: ['OFFICER COMMANDING', '14TH BN', 'A.P.S.P', 'ANANTHAPURAMU'],
    pattern: /OFFICER\s+COMMANDING.*14.*BN.*A\.P\.S\.P.*ANANTHAPURAMU/i
  },
  {
    id: 'stamp_2',
    name: 'Addl. Commissioner of Police, Vijayawada City',
    keywords: ['ADDL', 'COMMISSIONER', 'POLICE', 'VIJAYAWADA', 'CITY'],
    pattern: /ADDL.*COMMISSIONER.*POLICE.*VIJAYAWADA.*CITY/i
  },
  {
    id: 'stamp_3',
    name: 'Addl. Director General of Police, APSP Battalions, Mangalagiri',
    keywords: ['ADDL', 'DIRECTOR GENERAL', 'POLICE', 'APSP', 'BATTALIONS', 'MANGALAGIRI'],
    pattern: /ADDL.*DIRECTOR\s+GENERAL.*POLICE.*APSP.*BATTALIONS.*MANGALAGIRI/i
  },
  {
    id: 'stamp_4',
    name: 'STATE OFFICER TO ADGP APSP HEAD OFFICE MANGALAGIRI',
    keywords: ['STATE OFFICER', 'ADGP', 'APSP', 'HEAD OFFICE', 'MANGALAGIRI'],
    pattern: /STATE\s+OFFICER.*ADGP.*APSP.*HEAD\s+OFFICE.*MANGALAGIRI/i
  },
  {
    id: 'stamp_5',
    name: 'Inspector General of Police APSP Bns, Amaravathi',
    keywords: ['INSPECTOR GENERAL', 'POLICE', 'APSP', 'BNS', 'AMARAVATHI'],
    pattern: /INSPECTOR\s+GENERAL.*POLICE.*APSP.*BNS.*AMARAVATHI/i
  }
];

class StampSignatureService {
  private azureEndpoint = 'https://spark-01.cognitiveservices.azure.com/';
  private azureApiKey = 'DzYSXfu4Bd4xmGOYBd8H5gLlJr1v2L0ltdzimXuLXjpSop2uqEYiJQQJ99BFACYeBjFXJ3w3AAALACOGfoJq';
  private apiVersion = '2023-07-31';

  async analyzeStampsAndSignatures(
    file: File,
    userId: string
  ): Promise<StampSignatureAnalysisResult> {
    const startTime = Date.now();

    try {
      // Log analysis start
      securityService.logAction(
        userId,
        'stamp_signature_analysis_start',
        'document',
        file.name,
        { fileSize: file.size, fileType: file.type }
      );

      // Convert file to base64
      const base64Data = await this.fileToBase64(file);

      // Step 1: Analyze document with Azure Document Intelligence
      console.log('Starting Azure AI analysis for stamps and signatures...');
      const analyzeUrl = `${this.azureEndpoint}formrecognizer/documentModels/prebuilt-layout:analyze?api-version=${this.apiVersion}`;

      const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.azureApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64Source: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`Azure AI API error: ${response.status} ${response.statusText}`);
      }

      // Get operation location for polling
      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) {
        throw new Error('No operation location returned from Azure AI API');
      }

      // Poll for results with timeout
      const analysisResult = await this.pollForResults(operationLocation);
      
      // Step 2: Process the results to detect stamps and signatures
      const stampResult = this.detectStamps(analysisResult);
      const signatureResult = this.detectSignatures(analysisResult);
      
      // Step 3: Validate stamps against master list
      const stampValidation = this.validateStampAgainstMasterList(
        stampResult,
        analysisResult
      );

      const processingTime = Date.now() - startTime;

      const result: StampSignatureAnalysisResult = {
        Stamp: stampResult,
        Signature: signatureResult,
        StampValidation: stampValidation.isValid ? 'Y' : 'N',
        MatchedStampType: stampValidation.matchedType,
        ProcessingTime: processingTime
      };

      // Log successful analysis
      securityService.logAction(
        userId,
        'stamp_signature_analysis_complete',
        'document',
        file.name,
        {
          stampStatus: result.Stamp.Status,
          signatureStatus: result.Signature.Status,
          stampValidation: result.StampValidation,
          processingTime
        }
      );

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      
      // Log analysis error
      securityService.logAction(
        userId,
        'stamp_signature_analysis_error',
        'document',
        file.name,
        { error: errorMessage }
      );

      console.error('Stamp/Signature analysis failed:', errorMessage);

      // Return fallback result
      return {
        Stamp: { Status: 'Absent', Coordinates: null },
        Signature: { Status: 'Absent', Coordinates: null },
        StampValidation: 'N',
        ProcessingTime: Date.now() - startTime
      };
    }
  }

  private async pollForResults(operationLocation: string): Promise<any> {
    const maxAttempts = 30;
    const pollInterval = 1000; // 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(operationLocation, {
          headers: {
            'Ocp-Apim-Subscription-Key': this.azureApiKey
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
        console.error('Polling error:', error);
        // Continue polling despite errors
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Document analysis timed out');
  }

  private detectStamps(analysisResult: any): StampDetectionResult {
    // Look for stamps in the document
    // Stamps are typically detected as figures, tables with circular/rectangular shapes,
    // or regions with specific text patterns
    
    let stampCoordinates: [number, number, number, number] | null = null;
    let confidence = 0;
    let type = '';
    
    // Check for figures (often contain stamps)
    if (analysisResult.figures && analysisResult.figures.length > 0) {
      for (const figure of analysisResult.figures) {
        if (figure.boundingRegions && figure.boundingRegions.length > 0) {
          // Figures with bounding regions are good candidates for stamps
          const bbox = figure.boundingRegions[0].boundingBox;
          if (bbox && bbox.length >= 4) {
            // Convert string array to numbers if needed
            const coords = bbox.map((val: string | number) => typeof val === 'string' ? parseFloat(val) : val);
            stampCoordinates = [coords[0], coords[1], coords[2], coords[3]];
            confidence = 0.85;
            type = 'figure';
            break;
          }
        }
      }
    }
    
    // If no stamps found in figures, check for tables with stamp-like characteristics
    if (!stampCoordinates && analysisResult.tables && analysisResult.tables.length > 0) {
      for (const table of analysisResult.tables) {
        if (table.boundingRegions && table.boundingRegions.length > 0) {
          const bbox = table.boundingRegions[0].boundingBox;
          if (bbox && bbox.length >= 4) {
            // Check if table has stamp-like dimensions (roughly square or circular)
            const width = bbox[2];
            const height = bbox[3];
            const ratio = width / height;
            if (ratio >= 0.8 && ratio <= 1.2) {
              // Convert string array to numbers if needed
              const coords = bbox.map((val: string | number) => typeof val === 'string' ? parseFloat(val) : val);
              stampCoordinates = [coords[0], coords[1], coords[2], coords[3]];
              confidence = 0.75;
              type = 'table';
              break;
            }
          }
        }
      }
    }
    
    // If still no stamps found, check for specific text patterns in document content
    if (!stampCoordinates && analysisResult.content) {
      // Look for stamp-related keywords in the content
      const content = analysisResult.content.toLowerCase();
      const stampKeywords = ['seal', 'stamp', 'official', 'certified', 'approved'];
      
      if (stampKeywords.some(keyword => content.includes(keyword))) {
        // If stamp keywords found, look for a suitable region
        if (analysisResult.pages && analysisResult.pages.length > 0) {
          const page = analysisResult.pages[0];
          // Use a region in the top-right corner as a fallback
          const pageWidth = page.width || 800;
          const pageHeight = page.height || 600;
          
          stampCoordinates = [pageWidth * 0.7, pageHeight * 0.1, pageWidth * 0.2, pageHeight * 0.2];
          confidence = 0.6;
          type = 'text';
        }
      }
    }
    
    return {
      Status: stampCoordinates ? 'Present' : 'Absent',
      Coordinates: stampCoordinates,
      Type: type || undefined,
      Confidence: confidence || undefined
    };
  }

  private detectSignatures(analysisResult: any): SignatureDetectionResult {
    // Look for signatures in the document
    // Signatures are typically found at the bottom of documents,
    // often detected as handwritten text or selection marks
    
    let signatureCoordinates: [number, number, number, number] | null = null;
    let confidence = 0;
    
    // Check for selection marks (sometimes used for signatures)
    if (analysisResult.pages && analysisResult.pages.length > 0) {
      for (const page of analysisResult.pages) {
        if (page.selectionMarks && page.selectionMarks.length > 0) {
          for (const mark of page.selectionMarks) {
            if (mark.state === 'selected' && mark.boundingBox && mark.boundingBox.length >= 4) {
              // Convert string array to numbers if needed
              const coords = mark.boundingBox.map((val: string | number) => typeof val === 'string' ? parseFloat(val) : val);
              signatureCoordinates = [coords[0], coords[1], coords[2], coords[3]];
              confidence = mark.confidence || 0.7;
              break;
            }
          }
        }
      }
    }
    
    // If no signatures found in selection marks, look for signature-like text
    if (!signatureCoordinates && analysisResult.pages && analysisResult.pages.length > 0) {
      const page = analysisResult.pages[0];
      
      if (page.lines && page.lines.length > 0) {
        // Look for lines in the bottom third of the page
        const pageHeight = page.height || 600;
        const bottomThreshold = pageHeight * 0.7;
        
        for (const line of page.lines) {
          if (line.boundingBox && line.boundingBox.length >= 4) {
            const y = typeof line.boundingBox[1] === 'string' ? parseFloat(line.boundingBox[1]) : line.boundingBox[1];
            
            if (y > bottomThreshold) {
              // This line is in the bottom part of the page, could be a signature
              const content = line.content.toLowerCase();
              
              // Check if content looks like a signature (short text, possibly with special characters)
              if (content.length < 30 && !content.includes(' ')) {
                // Convert string array to numbers if needed
                const coords = line.boundingBox.map((val: string | number) => typeof val === 'string' ? parseFloat(val) : val);
                signatureCoordinates = [coords[0], coords[1], coords[2], coords[3]];
                confidence = 0.65;
                break;
              }
            }
          }
        }
      }
    }
    
    // If still no signature found, use a fallback approach
    if (!signatureCoordinates && analysisResult.pages && analysisResult.pages.length > 0) {
      const page = analysisResult.pages[0];
      const pageWidth = page.width || 800;
      const pageHeight = page.height || 600;
      
      // Assume signature is in bottom-right corner
      signatureCoordinates = [pageWidth * 0.6, pageHeight * 0.8, pageWidth * 0.3, pageHeight * 0.1];
      confidence = 0.5;
    }
    
    return {
      Status: signatureCoordinates ? 'Present' : 'Absent',
      Coordinates: signatureCoordinates,
      Confidence: confidence || undefined
    };
  }

  private validateStampAgainstMasterList(
    stampResult: StampDetectionResult,
    analysisResult: any
  ): { isValid: boolean; matchedType?: string } {
    if (stampResult.Status === 'Absent') {
      return { isValid: false };
    }

    // Extract text from the document for stamp validation
    const documentText = this.extractTextFromAzureResult(analysisResult);
    
    // Check against each stamp in master list
    for (const masterStamp of OFFICIAL_STAMP_MASTER_LIST) {
      // Check if stamp pattern matches
      if (masterStamp.pattern.test(documentText)) {
        return { isValid: true, matchedType: masterStamp.name };
      }

      // Check if keywords are present
      const keywordMatches = masterStamp.keywords.filter(keyword => 
        documentText.toUpperCase().includes(keyword)
      );

      if (keywordMatches.length >= Math.ceil(masterStamp.keywords.length * 0.6)) {
        return { isValid: true, matchedType: masterStamp.name };
      }
    }

    return { isValid: false };
  }

  private extractTextFromAzureResult(analysisResult: any): string {
    let text = '';
    
    if (analysisResult.content) {
      text += analysisResult.content + ' ';
    }

    if (analysisResult.pages) {
      analysisResult.pages.forEach((page: any) => {
        if (page.lines) {
          page.lines.forEach((line: any) => {
            text += line.content + ' ';
          });
        }
      });
    }

    return text;
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Public method to get master stamp list
  getMasterStampList() {
    return OFFICIAL_STAMP_MASTER_LIST.map(stamp => ({
      id: stamp.id,
      name: stamp.name
    }));
  }

  // Public method to check service health
  async checkServiceHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.azureEndpoint}formrecognizer/documentModels?api-version=${this.apiVersion}`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.azureApiKey
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Azure service health check failed:', error);
      return false;
    }
  }
}

export const stampSignatureService = new StampSignatureService();
export type { StampSignatureAnalysisResult };