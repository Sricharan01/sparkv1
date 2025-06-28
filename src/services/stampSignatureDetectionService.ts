import { securityService } from './securityService';

interface StampDetectionResult {
  id: string;
  type: 'official_stamp' | 'seal' | 'emblem';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  imageData: string; // base64 encoded stamp image
  location: string; // description of location within document
}

interface SignatureDetectionResult {
  id: string;
  type: 'handwritten_signature' | 'digital_signature';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  imageData: string; // base64 encoded signature image
  location: string; // description of location within document
}

interface DocumentValidationResult {
  stamps: {
    detected: StampDetectionResult[];
    status: 'Present' | 'Absent';
    count: number;
    validationTimestamp: string;
  };
  signatures: {
    detected: SignatureDetectionResult[];
    status: 'Present' | 'Absent';
    count: number;
    validationTimestamp: string;
  };
  overallValidation: {
    isValid: boolean;
    completeness: number; // percentage 0-100
    missingElements: string[];
  };
}

class StampSignatureDetectionService {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  async analyzeDocument(
    imageData: string | File,
    userId: string
  ): Promise<DocumentValidationResult> {
    try {
      // Log analysis start
      securityService.logAction(
        userId,
        'stamp_signature_analysis_start',
        'document',
        'validation_analysis',
        { analysisType: 'stamp_signature_detection' }
      );

      // Convert input to image
      const image = await this.loadImage(imageData);
      
      // Set canvas size to match image
      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.ctx.drawImage(image, 0, 0);

      // Get image data for analysis
      const imgData = this.ctx.getImageData(0, 0, image.width, image.height);

      // Detect stamps
      const stamps = await this.detectStamps(imgData, image);
      
      // Detect signatures
      const signatures = await this.detectSignatures(imgData, image);

      // Create validation result
      const result: DocumentValidationResult = {
        stamps: {
          detected: stamps,
          status: stamps.length > 0 ? 'Present' : 'Absent',
          count: stamps.length,
          validationTimestamp: new Date().toISOString()
        },
        signatures: {
          detected: signatures,
          status: signatures.length > 0 ? 'Present' : 'Absent',
          count: signatures.length,
          validationTimestamp: new Date().toISOString()
        },
        overallValidation: {
          isValid: stamps.length > 0 && signatures.length > 0,
          completeness: this.calculateCompleteness(stamps, signatures),
          missingElements: this.getMissingElements(stamps, signatures)
        }
      };

      // Log successful analysis
      securityService.logAction(
        userId,
        'stamp_signature_analysis_complete',
        'document',
        'validation_analysis',
        {
          stampsDetected: stamps.length,
          signaturesDetected: signatures.length,
          overallValid: result.overallValidation.isValid
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
        'validation_analysis',
        { error: errorMessage }
      );

      throw new Error(`Stamp/Signature analysis failed: ${errorMessage}`);
    }
  }

  private async loadImage(imageData: string | File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      
      if (typeof imageData === 'string') {
        // Base64 string
        img.src = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
      } else {
        // File object
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(imageData);
      }
    });
  }

  private async detectStamps(
    imageData: ImageData,
    originalImage: HTMLImageElement
  ): Promise<StampDetectionResult[]> {
    const stamps: StampDetectionResult[] = [];
    
    try {
      // Convert to grayscale for better edge detection
      const grayData = this.convertToGrayscale(imageData);
      
      // Detect circular/oval shapes (common for stamps)
      const circularRegions = this.detectCircularShapes(grayData);
      
      // Detect rectangular stamps
      const rectangularRegions = this.detectRectangularStamps(grayData);
      
      // Combine and validate regions
      const allRegions = [...circularRegions, ...rectangularRegions];
      
      for (let i = 0; i < allRegions.length; i++) {
        const region = allRegions[i];
        
        // Extract stamp image
        const stampImage = this.extractRegion(originalImage, region.boundingBox);
        
        // Validate if it's actually a stamp
        const confidence = this.validateStamp(region, grayData);
        
        if (confidence > 0.6) { // Threshold for stamp detection
          stamps.push({
            id: `stamp_${Date.now()}_${i}`,
            type: this.classifyStampType(region),
            boundingBox: region.boundingBox,
            confidence,
            imageData: stampImage,
            location: this.describeLocation(region.boundingBox, imageData.width, imageData.height)
          });
        }
      }
      
    } catch (error) {
      console.warn('Stamp detection failed:', error);
    }
    
    return stamps;
  }

  private async detectSignatures(
    imageData: ImageData,
    originalImage: HTMLImageElement
  ): Promise<SignatureDetectionResult[]> {
    const signatures: SignatureDetectionResult[] = [];
    
    try {
      // Convert to grayscale
      const grayData = this.convertToGrayscale(imageData);
      
      // Detect handwritten regions using stroke analysis
      const handwrittenRegions = this.detectHandwrittenRegions(grayData);
      
      for (let i = 0; i < handwrittenRegions.length; i++) {
        const region = handwrittenRegions[i];
        
        // Extract signature image
        const signatureImage = this.extractRegion(originalImage, region.boundingBox);
        
        // Validate if it's actually a signature
        const confidence = this.validateSignature(region, grayData);
        
        if (confidence > 0.7) { // Threshold for signature detection
          signatures.push({
            id: `signature_${Date.now()}_${i}`,
            type: 'handwritten_signature',
            boundingBox: region.boundingBox,
            confidence,
            imageData: signatureImage,
            location: this.describeLocation(region.boundingBox, imageData.width, imageData.height)
          });
        }
      }
      
    } catch (error) {
      console.warn('Signature detection failed:', error);
    }
    
    return signatures;
  }

  private convertToGrayscale(imageData: ImageData): Uint8ClampedArray {
    const grayData = new Uint8ClampedArray(imageData.width * imageData.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }
    
    return grayData;
  }

  private detectCircularShapes(grayData: Uint8ClampedArray): Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    type: 'circular';
  }> {
    // Simplified circular shape detection using edge detection
    const regions: Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      type: 'circular';
    }> = [];
    
    // This is a simplified implementation
    // In production, you would use more sophisticated algorithms like Hough Circle Transform
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Look for circular patterns in different sizes
    const minRadius = 20;
    const maxRadius = Math.min(width, height) / 4;
    
    for (let r = minRadius; r < maxRadius; r += 10) {
      for (let y = r; y < height - r; y += 20) {
        for (let x = r; x < width - r; x += 20) {
          if (this.isCircularRegion(grayData, x, y, r, width)) {
            regions.push({
              boundingBox: {
                x: x - r,
                y: y - r,
                width: r * 2,
                height: r * 2
              },
              type: 'circular'
            });
          }
        }
      }
    }
    
    return regions;
  }

  private detectRectangularStamps(grayData: Uint8ClampedArray): Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    type: 'rectangular';
  }> {
    // Simplified rectangular stamp detection
    const regions: Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      type: 'rectangular';
    }> = [];
    
    // Look for rectangular regions with high edge density
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    const minWidth = 50;
    const minHeight = 30;
    const maxWidth = width / 3;
    const maxHeight = height / 3;
    
    for (let w = minWidth; w < maxWidth; w += 20) {
      for (let h = minHeight; h < maxHeight; h += 20) {
        for (let y = 0; y < height - h; y += 30) {
          for (let x = 0; x < width - w; x += 30) {
            if (this.isRectangularStamp(grayData, x, y, w, h, width)) {
              regions.push({
                boundingBox: { x, y, width: w, height: h },
                type: 'rectangular'
              });
            }
          }
        }
      }
    }
    
    return regions;
  }

  private detectHandwrittenRegions(grayData: Uint8ClampedArray): Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    type: 'handwritten';
  }> {
    // Simplified handwritten region detection
    const regions: Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      type: 'handwritten';
    }> = [];
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Look for regions with handwriting characteristics
    const minWidth = 80;
    const minHeight = 20;
    const maxWidth = width / 2;
    const maxHeight = height / 4;
    
    for (let w = minWidth; w < maxWidth; w += 40) {
      for (let h = minHeight; h < maxHeight; h += 20) {
        for (let y = 0; y < height - h; y += 30) {
          for (let x = 0; x < width - w; x += 40) {
            if (this.isHandwrittenRegion(grayData, x, y, w, h, width)) {
              regions.push({
                boundingBox: { x, y, width: w, height: h },
                type: 'handwritten'
              });
            }
          }
        }
      }
    }
    
    return regions;
  }

  private isCircularRegion(
    grayData: Uint8ClampedArray,
    centerX: number,
    centerY: number,
    radius: number,
    width: number
  ): boolean {
    // Check if the region has circular characteristics
    let edgePoints = 0;
    let totalPoints = 0;
    
    for (let angle = 0; angle < 360; angle += 10) {
      const x = Math.round(centerX + radius * Math.cos(angle * Math.PI / 180));
      const y = Math.round(centerY + radius * Math.sin(angle * Math.PI / 180));
      
      if (x >= 0 && x < width && y >= 0 && y < grayData.length / width) {
        const index = y * width + x;
        if (this.isEdgePixel(grayData, x, y, width)) {
          edgePoints++;
        }
        totalPoints++;
      }
    }
    
    return totalPoints > 0 && (edgePoints / totalPoints) > 0.3;
  }

  private isRectangularStamp(
    grayData: Uint8ClampedArray,
    x: number,
    y: number,
    w: number,
    h: number,
    width: number
  ): boolean {
    // Check for rectangular stamp characteristics
    let edgePixels = 0;
    let totalPixels = 0;
    
    // Check border pixels
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        if (i === 0 || i === w - 1 || j === 0 || j === h - 1) {
          const px = x + i;
          const py = y + j;
          if (px < width && py < grayData.length / width) {
            if (this.isEdgePixel(grayData, px, py, width)) {
              edgePixels++;
            }
            totalPixels++;
          }
        }
      }
    }
    
    return totalPixels > 0 && (edgePixels / totalPixels) > 0.4;
  }

  private isHandwrittenRegion(
    grayData: Uint8ClampedArray,
    x: number,
    y: number,
    w: number,
    h: number,
    width: number
  ): boolean {
    // Check for handwriting characteristics (irregular strokes, varying thickness)
    let strokePixels = 0;
    let totalPixels = 0;
    
    for (let i = 0; i < w; i += 2) {
      for (let j = 0; j < h; j += 2) {
        const px = x + i;
        const py = y + j;
        if (px < width && py < grayData.length / width) {
          const index = py * width + px;
          if (grayData[index] < 128) { // Dark pixels (ink)
            strokePixels++;
          }
          totalPixels++;
        }
      }
    }
    
    const density = strokePixels / totalPixels;
    return density > 0.1 && density < 0.6; // Handwriting has moderate density
  }

  private isEdgePixel(grayData: Uint8ClampedArray, x: number, y: number, width: number): boolean {
    // Simple edge detection using gradient
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= (grayData.length / width) - 1) {
      return false;
    }
    
    const index = y * width + x;
    const current = grayData[index];
    const right = grayData[index + 1];
    const bottom = grayData[index + width];
    
    const gradientX = Math.abs(current - right);
    const gradientY = Math.abs(current - bottom);
    
    return (gradientX + gradientY) > 30; // Threshold for edge detection
  }

  private extractRegion(
    image: HTMLImageElement,
    boundingBox: { x: number; y: number; width: number; height: number }
  ): string {
    // Create a temporary canvas for the region
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCanvas.width = boundingBox.width;
    tempCanvas.height = boundingBox.height;
    
    // Draw the region
    tempCtx.drawImage(
      image,
      boundingBox.x,
      boundingBox.y,
      boundingBox.width,
      boundingBox.height,
      0,
      0,
      boundingBox.width,
      boundingBox.height
    );
    
    return tempCanvas.toDataURL('image/png');
  }

  private validateStamp(region: any, grayData: Uint8ClampedArray): number {
    // Validate if the detected region is actually a stamp
    // This is a simplified validation - in production you'd use more sophisticated methods
    
    let confidence = 0.5; // Base confidence
    
    // Check for circular/oval shape (common in stamps)
    if (region.type === 'circular') {
      confidence += 0.2;
    }
    
    // Check for text density (stamps usually have text)
    const textDensity = this.calculateTextDensity(region.boundingBox, grayData);
    if (textDensity > 0.3) {
      confidence += 0.2;
    }
    
    // Check for border presence
    const hasBorder = this.hasBorder(region.boundingBox, grayData);
    if (hasBorder) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  private validateSignature(region: any, grayData: Uint8ClampedArray): number {
    // Validate if the detected region is actually a signature
    let confidence = 0.6; // Base confidence
    
    // Check for handwriting characteristics
    const strokeVariation = this.calculateStrokeVariation(region.boundingBox, grayData);
    if (strokeVariation > 0.4) {
      confidence += 0.2;
    }
    
    // Check for appropriate size (signatures are usually within certain size ranges)
    const area = region.boundingBox.width * region.boundingBox.height;
    if (area > 1000 && area < 50000) {
      confidence += 0.1;
    }
    
    // Check for ink density
    const inkDensity = this.calculateInkDensity(region.boundingBox, grayData);
    if (inkDensity > 0.1 && inkDensity < 0.5) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  private calculateTextDensity(boundingBox: any, grayData: Uint8ClampedArray): number {
    // Calculate the density of text-like pixels in the region
    let textPixels = 0;
    let totalPixels = 0;
    const width = this.canvas.width;
    
    for (let y = boundingBox.y; y < boundingBox.y + boundingBox.height; y++) {
      for (let x = boundingBox.x; x < boundingBox.x + boundingBox.width; x++) {
        if (x < width && y < grayData.length / width) {
          const index = y * width + x;
          if (grayData[index] < 128) { // Dark pixels
            textPixels++;
          }
          totalPixels++;
        }
      }
    }
    
    return totalPixels > 0 ? textPixels / totalPixels : 0;
  }

  private hasBorder(boundingBox: any, grayData: Uint8ClampedArray): boolean {
    // Check if the region has a border (common in stamps)
    const width = this.canvas.width;
    let borderPixels = 0;
    let borderChecks = 0;
    
    // Check top and bottom borders
    for (let x = boundingBox.x; x < boundingBox.x + boundingBox.width; x++) {
      if (x < width) {
        // Top border
        const topIndex = boundingBox.y * width + x;
        if (topIndex < grayData.length && grayData[topIndex] < 128) {
          borderPixels++;
        }
        borderChecks++;
        
        // Bottom border
        const bottomIndex = (boundingBox.y + boundingBox.height - 1) * width + x;
        if (bottomIndex < grayData.length && grayData[bottomIndex] < 128) {
          borderPixels++;
        }
        borderChecks++;
      }
    }
    
    return borderChecks > 0 && (borderPixels / borderChecks) > 0.3;
  }

  private calculateStrokeVariation(boundingBox: any, grayData: Uint8ClampedArray): number {
    // Calculate variation in stroke thickness (characteristic of handwriting)
    const width = this.canvas.width;
    let variations = 0;
    let measurements = 0;
    
    // Sample stroke thickness at different points
    for (let y = boundingBox.y; y < boundingBox.y + boundingBox.height; y += 5) {
      let strokeWidth = 0;
      let inStroke = false;
      
      for (let x = boundingBox.x; x < boundingBox.x + boundingBox.width; x++) {
        if (x < width && y < grayData.length / width) {
          const index = y * width + x;
          const isDark = grayData[index] < 128;
          
          if (isDark && !inStroke) {
            inStroke = true;
            strokeWidth = 1;
          } else if (isDark && inStroke) {
            strokeWidth++;
          } else if (!isDark && inStroke) {
            inStroke = false;
            if (strokeWidth > 0) {
              variations += strokeWidth;
              measurements++;
            }
          }
        }
      }
    }
    
    return measurements > 0 ? variations / measurements / 10 : 0; // Normalize
  }

  private calculateInkDensity(boundingBox: any, grayData: Uint8ClampedArray): number {
    // Calculate ink density in the signature region
    let inkPixels = 0;
    let totalPixels = 0;
    const width = this.canvas.width;
    
    for (let y = boundingBox.y; y < boundingBox.y + boundingBox.height; y++) {
      for (let x = boundingBox.x; x < boundingBox.x + boundingBox.width; x++) {
        if (x < width && y < grayData.length / width) {
          const index = y * width + x;
          if (grayData[index] < 128) { // Dark pixels (ink)
            inkPixels++;
          }
          totalPixels++;
        }
      }
    }
    
    return totalPixels > 0 ? inkPixels / totalPixels : 0;
  }

  private classifyStampType(region: any): 'official_stamp' | 'seal' | 'emblem' {
    // Classify the type of stamp based on characteristics
    if (region.type === 'circular') {
      return 'official_stamp';
    } else if (region.boundingBox.width > region.boundingBox.height * 1.5) {
      return 'emblem';
    } else {
      return 'seal';
    }
  }

  private describeLocation(
    boundingBox: { x: number; y: number; width: number; height: number },
    imageWidth: number,
    imageHeight: number
  ): string {
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;
    
    const horizontalPos = centerX < imageWidth / 3 ? 'left' : 
                         centerX > (2 * imageWidth) / 3 ? 'right' : 'center';
    
    const verticalPos = centerY < imageHeight / 3 ? 'top' : 
                       centerY > (2 * imageHeight) / 3 ? 'bottom' : 'middle';
    
    return `${verticalPos}-${horizontalPos}`;
  }

  private calculateCompleteness(
    stamps: StampDetectionResult[],
    signatures: SignatureDetectionResult[]
  ): number {
    let completeness = 0;
    
    // Stamps contribute 50% to completeness
    if (stamps.length > 0) {
      completeness += 50;
    }
    
    // Signatures contribute 50% to completeness
    if (signatures.length > 0) {
      completeness += 50;
    }
    
    return completeness;
  }

  private getMissingElements(
    stamps: StampDetectionResult[],
    signatures: SignatureDetectionResult[]
  ): string[] {
    const missing: string[] = [];
    
    if (stamps.length === 0) {
      missing.push('Official stamps or seals');
    }
    
    if (signatures.length === 0) {
      missing.push('Handwritten signatures');
    }
    
    return missing;
  }

  // Public method to get validation summary
  getValidationSummary(result: DocumentValidationResult): string {
    const { stamps, signatures, overallValidation } = result;
    
    let summary = `Document Validation Summary:\n`;
    summary += `• Stamps: ${stamps.status} (${stamps.count} detected)\n`;
    summary += `• Signatures: ${signatures.status} (${signatures.count} detected)\n`;
    summary += `• Overall Completeness: ${overallValidation.completeness}%\n`;
    
    if (overallValidation.missingElements.length > 0) {
      summary += `• Missing Elements: ${overallValidation.missingElements.join(', ')}\n`;
    }
    
    return summary;
  }
}

export const stampSignatureDetectionService = new StampSignatureDetectionService();
export type { StampDetectionResult, SignatureDetectionResult, DocumentValidationResult };