/**
 * FleetClaim Report Types (shared with MyGeotab Add-In)
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
    deviceId?: string;
    deviceName?: string;
    vehicleId?: string;
    vehicleName?: string;
    driverName?: string;
    driverInfo?: DriverInfo;
    occurredAt: string;
    generatedAt: string;
    requestedBy?: string;
    latitude?: number;
    longitude?: number;
    incidentAddress?: string;
    incidentCity?: string;
    incidentState?: string;
    incidentCountry?: string;
    severity: Severity;
    summary?: string;
    isBaselineReport?: boolean;
    source?: ReportSource;
    incidentDetails?: IncidentDetails;
    evidence?: Evidence;
    gpsTrail?: GpsPoint[];
    speedData?: Array<{ dateTime: string; speed: number }>;
    photos?: Photo[];
    weather?: WeatherData;
    notes?: string;
    damageAssessment?: DamageAssessment;
    thirdPartyInfo?: ThirdPartyInfo;
    pdfMediaFileId?: string;
    shareToken?: string;
    shareUrl?: string;
    mergedFromSubmissionId?: string;
    mergedAt?: string;
}

export interface AddInDataWrapper<T> {
    type: 'report' | 'reportRequest' | 'config' | 'driverSubmission';
    payload: T;
    version?: number;
}
