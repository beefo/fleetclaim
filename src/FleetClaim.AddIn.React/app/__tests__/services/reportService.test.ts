import { loadReports, loadRequests, submitReportRequest } from '@/services/reportService';
import { GeotabApi, IncidentReport, ReportRequest } from '@/types';

describe('reportService', () => {
    const createMockApi = (addInDataResponse: any[] = []): GeotabApi => ({
        call: jest.fn((method, params, success, error) => {
            if (method === 'Get' && (params as any).typeName === 'AddInData') {
                if (success) success(addInDataResponse);
                return Promise.resolve(addInDataResponse);
            }
            if (method === 'Add') {
                const result = 'new_aid_123';
                if (success) success(result);
                return Promise.resolve(result);
            }
            if (success) success(null);
            return Promise.resolve(null);
        }),
        multiCall: jest.fn(() => Promise.resolve([])),
        getSession: jest.fn()
    });
    
    describe('loadReports', () => {
        it('should parse reports from AddInData', async () => {
            const mockReport: IncidentReport = {
                id: 'rpt_001',
                deviceId: 'b1',
                deviceName: 'Test Vehicle',
                occurredAt: new Date().toISOString(),
                generatedAt: new Date().toISOString(),
                latitude: 43.45,
                longitude: -79.68,
                severity: 'high'
            };
            
            const mockApi = createMockApi([
                {
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({
                        type: 'report',
                        payload: mockReport
                    })
                }
            ]);
            
            const result = await loadReports(mockApi);
            
            expect(result).toHaveLength(1);
            expect(result[0].report.id).toBe('rpt_001');
            expect(result[0].addInDataId).toBe('aid_001');
        });
        
        it('should filter out non-report items', async () => {
            const mockApi = createMockApi([
                {
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({
                        type: 'reportRequest',
                        payload: { id: 'req_001' }
                    })
                },
                {
                    id: 'aid_002',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({
                        type: 'report',
                        payload: {
                            id: 'rpt_001',
                            deviceId: 'b1',
                            deviceName: 'Test',
                            occurredAt: new Date().toISOString(),
                            generatedAt: new Date().toISOString(),
                            latitude: 43,
                            longitude: -79,
                            severity: 'low'
                        }
                    })
                }
            ]);
            
            const result = await loadReports(mockApi);
            
            expect(result).toHaveLength(1);
            expect(result[0].report.id).toBe('rpt_001');
        });
        
        it('should handle malformed data gracefully', async () => {
            const mockApi = createMockApi([
                {
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: 'not valid json {'
                },
                {
                    id: 'aid_002',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({
                        type: 'report',
                        payload: {
                            id: 'rpt_001',
                            deviceId: 'b1',
                            deviceName: 'Test',
                            occurredAt: new Date().toISOString(),
                            generatedAt: new Date().toISOString(),
                            latitude: 43,
                            longitude: -79,
                            severity: 'low'
                        }
                    })
                }
            ]);
            
            const result = await loadReports(mockApi);
            
            // Should only return the valid one
            expect(result).toHaveLength(1);
        });
    });
    
    describe('loadRequests', () => {
        it('should parse requests from AddInData', async () => {
            const mockRequest: ReportRequest = {
                id: 'req_001',
                deviceId: 'b1',
                deviceName: 'Test Vehicle',
                requestedBy: 'user@test.com',
                requestedAt: new Date().toISOString(),
                rangeStart: new Date().toISOString(),
                rangeEnd: new Date().toISOString(),
                status: 'pending'
            };
            
            const mockApi = createMockApi([
                {
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({
                        type: 'reportRequest',
                        payload: mockRequest
                    })
                }
            ]);
            
            const result = await loadRequests(mockApi);
            
            expect(result).toHaveLength(1);
            expect(result[0].request.id).toBe('req_001');
            expect(result[0].request.status).toBe('pending');
        });
    });
    
    describe('submitReportRequest', () => {
        it('should create a new request with pending status', async () => {
            const mockApi = createMockApi([]);
            
            const result = await submitReportRequest(mockApi, {
                deviceId: 'b1',
                deviceName: 'Test Vehicle',
                requestedBy: 'user@test.com',
                rangeStart: new Date().toISOString(),
                rangeEnd: new Date().toISOString()
            });
            
            expect(result).toBe('new_aid_123');
            expect(mockApi.call).toHaveBeenCalledWith(
                'Add',
                expect.objectContaining({
                    typeName: 'AddInData'
                }),
                expect.any(Function),
                expect.any(Function)
            );
        });
    });
});
