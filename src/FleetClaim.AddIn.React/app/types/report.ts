/**
 * FleetClaim Report Types
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RequestStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ReportSource = 'automatic' | 'manual';

export interface GpsPoint {
    latitude: number;
    longitude: number;
    dateTime: string;
    speed?: number;
}

export interface IncidentDetails {
    ruleId?: string;
    ruleName?: string;
    severity?: Severity;
    speedAtEvent?: number;
    maxDecelerationG?: number;
    accelerometerData?: AccelerometerReading[];
}

export interface AccelerometerReading {
    timestamp: string;
    x: number;
    y: number;
    z: number;
}

export interface DriverInfo {
    id?: string;
    name: string;
    firstName?: string;
    lastName?: string;
}

export interface Photo {
    id: string;
    mediaFileId: string;
    fileName: string;
    category: 'damage' | 'scene' | 'other';
    uploadedAt: string;
    thumbnailUrl?: string;
}

export interface DamageAssessment {
    damageLevel?: 'none' | 'minor' | 'moderate' | 'severe' | 'total';
    description?: string;
    estimatedRepairCost?: number;
    isDriveable?: boolean;
}

export interface ThirdPartyInfo {
    otherDriverName?: string;
    otherDriverPhone?: string;
    otherDriverInsurance?: string;
    otherDriverPolicyNumber?: string;
    otherVehicleMake?: string;
    otherVehicleModel?: string;
    otherVehiclePlate?: string;
    otherVehicleColor?: string;
    witnesses?: string;
    policeReportNumber?: string;
    additionalNotes?: string;
}

export interface WeatherData {
    temperature?: number;
    conditions?: string;
    visibility?: string;
    windSpeed?: number;
}

export interface Evidence {
    gpsTrail?: Array<{
        latitude: number;
        longitude: number;
        speedKmh?: number;
        timestamp: string;
    }>;
    photos?: Photo[];
    weatherCondition?: string;
    temperatureCelsius?: number;
    speedAtEventKmh?: number;
    maxSpeedKmh?: number;
    decelerationMps2?: number;
}

export interface IncidentReport {
    id: string;
    // Vehicle - support both naming conventions
    deviceId?: string;
    deviceName?: string;
    vehicleId?: string;
    vehicleName?: string;
    
    // Driver
    driverName?: string;
    driverInfo?: DriverInfo;
    
    // Timing
    occurredAt: string;
    generatedAt: string;
    requestedBy?: string;
    
    // Location
    latitude?: number;
    longitude?: number;
    incidentAddress?: string;
    incidentCity?: string;
    incidentState?: string;
    incidentCountry?: string;
    
    // Incident details
    severity: Severity;
    summary?: string;
    isBaselineReport?: boolean;
    source?: ReportSource;  // 'automatic' (from feed monitoring) or 'manual' (user request)
    incidentDetails?: IncidentDetails;
    
    // Evidence data (from backend)
    evidence?: Evidence;
    
    // Data (flattened for convenience)
    gpsTrail?: GpsPoint[];
    speedData?: Array<{ dateTime: string; speed: number }>;
    photos?: Photo[];
    weather?: WeatherData;
    
    // User input
    notes?: string;
    damageAssessment?: DamageAssessment;
    thirdPartyInfo?: ThirdPartyInfo;
    
    // PDF
    pdfMediaFileId?: string;
    shareToken?: string;
    shareUrl?: string;
    mergedFromSubmissionId?: string;
    mergedAt?: string;
}

export interface ReportRequest {
    id: string;
    deviceId: string;
    deviceName?: string;
    requestedBy: string;
    requestedAt: string;
    fromDate: string;
    toDate: string;
    status: RequestStatus;
    forceReport?: boolean;
    linkedSubmissionId?: string;
    error?: string;
    completedAt?: string;
}

export interface DriverSubmission {
    id: string;
    deviceId: string;
    deviceName?: string;
    driverId?: string;
    driverName?: string;
    incidentTimestamp: string;
    latitude?: number;
    longitude?: number;
    locationAddress?: string;
    description?: string;
    severity?: Severity;
    damageDescription?: string;
    damageLevel?: 'none' | 'minor' | 'moderate' | 'severe' | 'totalLoss';
    vehicleDriveable?: boolean;
    policeReportNumber?: string;
    policeAgency?: string;
    injuriesReported?: boolean;
    injuryDescription?: string;
    notes?: string;
    photos?: Photo[];
    status: 'synced' | 'merged' | 'converted' | 'standalone';
    createdAt: string;
    updatedAt: string;
    submittedAt?: string;
    mergedIntoReportId?: string;
}

export interface AddInDataWrapper<T> {
    type: 'report' | 'reportRequest' | 'config' | 'driverSubmission' | 'workerState';
    payload: T;
    version?: number;
}

export type SubmissionStatus = 'synced' | 'merged' | 'converted' | 'standalone';
