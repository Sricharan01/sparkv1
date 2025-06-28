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

      // For demo purposes, we'll simulate the analysis
      // In a real implementation, this would call Azure AI Document Intelligence API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate results
      const result = this.simulateResults();
      
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
          processingTime: Date.now() - startTime
        }
      );

      return {
        ...result,
        ProcessingTime: Date.now() - startTime
      };

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

  private simulateResults(): StampSignatureAnalysisResult {
    // Simulate stamp detection (70% chance of finding a stamp)
    const hasStamp = Math.random() < 0.7;
    
    // Simulate signature detection (80% chance of finding a signature)
    const hasSignature = Math.random() < 0.8;
    
    // Simulate stamp validation (60% chance of matching master list if stamp is present)
    const isValidStamp = hasStamp && Math.random() < 0.6;
    
    // Get random stamp type from master list if valid
    const matchedStampType = isValidStamp 
      ? OFFICIAL_STAMP_MASTER_LIST[Math.floor(Math.random() * OFFICIAL_STAMP_MASTER_LIST.length)].name
      : undefined;
    
    return {
      Stamp: {
        Status: hasStamp ? 'Present' : 'Absent',
        Coordinates: hasStamp 
          ? [100, 100, 200, 100] // x, y, width, height
          : null,
        Type: hasStamp ? 'official_stamp' : undefined,
        Confidence: hasStamp ? 0.85 : undefined
      },
      Signature: {
        Status: hasSignature ? 'Present' : 'Absent',
        Coordinates: hasSignature 
          ? [300, 400, 150, 50] // x, y, width, height
          : null,
        Confidence: hasSignature ? 0.78 : undefined
      },
      StampValidation: isValidStamp ? 'Y' : 'N',
      MatchedStampType: matchedStampType,
      ProcessingTime: 0 // Will be updated by the calling function
    };
  }

  // Get the master list of official stamps
  getMasterStampList() {
    return OFFICIAL_STAMP_MASTER_LIST.map(stamp => ({
      id: stamp.id,
      name: stamp.name
    }));
  }

  // Public method to check service health
  async checkServiceHealth(): Promise<boolean> {
    try {
      // In a real implementation, this would check the Azure service
      // For demo purposes, we'll simulate a successful connection
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch (error) {
      console.error('Service health check failed:', error);
      return false;
    }
  }
}

export const stampSignatureService = new StampSignatureService();
export type { StampSignatureAnalysisResult };