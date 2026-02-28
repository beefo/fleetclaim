import { loadReports, loadRequests, submitReportRequest, downloadPdf, downloadPdfSimple, sendReportEmail, deleteReport, deleteRequest } from '@/services/reportService';
import { GeotabApi, IncidentReport, ReportRequest } from '@/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

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
                fromDate: new Date().toISOString(),
                toDate: new Date().toISOString(),
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
                fromDate: new Date().toISOString(),
                toDate: new Date().toISOString()
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

    describe('downloadPdf', () => {
        const mockCredentials = {
            database: 'test_db',
            userName: 'test@example.com',
            sessionId: 'session-123',
            server: 'my.geotab.com'
        };

        beforeEach(() => {
            mockFetch.mockReset();
            // Mock document.body.appendChild/removeChild
            document.body.appendChild = jest.fn();
            document.body.removeChild = jest.fn();
        });

        it('should POST to /api/pdf with credentials', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(new Blob(['pdf content'], { type: 'application/pdf' }))
            });

            // Mock link click
            const mockClick = jest.fn();
            jest.spyOn(document, 'createElement').mockReturnValueOnce({
                href: '',
                download: '',
                click: mockClick
            } as any);

            await downloadPdf('rpt_001', mockCredentials);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/pdf'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: expect.stringContaining('rpt_001')
                })
            );
        });

        it('should throw on 401 response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            await expect(downloadPdf('rpt_001', mockCredentials)).rejects.toThrow('Session expired');
        });

        it('should throw on other error responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            await expect(downloadPdf('rpt_001', mockCredentials)).rejects.toThrow('Failed to download PDF: 500');
        });
    });

    describe('downloadPdfSimple', () => {
        beforeEach(() => {
            mockFetch.mockReset();
            document.body.appendChild = jest.fn();
            document.body.removeChild = jest.fn();
        });

        it('should GET from /api/pdf/{database}/{reportId} with userName', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                blob: () => Promise.resolve(new Blob(['pdf content'], { type: 'application/pdf' }))
            });

            const mockClick = jest.fn();
            jest.spyOn(document, 'createElement').mockReturnValueOnce({
                href: '',
                download: '',
                click: mockClick
            } as any);

            await downloadPdfSimple('test_db', 'rpt_001', 'user@test.com');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringMatching(/\/api\/pdf\/test_db\/rpt_001\?userName=/),
                expect.objectContaining({ method: 'GET' })
            );
        });

        it('should throw on 404 response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            await expect(downloadPdfSimple('test_db', 'rpt_001', 'user@test.com')).rejects.toThrow('Report not found');
        });
    });

    describe('sendReportEmail', () => {
        const mockCredentials = {
            database: 'test_db',
            userName: 'test@example.com',
            sessionId: 'session-123'
        };

        beforeEach(() => {
            mockFetch.mockReset();
        });

        it('should POST to /api/email with credentials and email', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true });

            await sendReportEmail('rpt_001', 'recipient@test.com', mockCredentials, 'Hello!');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/email'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('recipient@test.com')
                })
            );
        });

        it('should throw on 401 response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            await expect(sendReportEmail('rpt_001', 'test@test.com', mockCredentials)).rejects.toThrow('Session expired');
        });

        it('should throw with error message from response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: 'Invalid email address' })
            });

            await expect(sendReportEmail('rpt_001', 'bad-email', mockCredentials)).rejects.toThrow('Invalid email address');
        });
    });

    describe('deleteReport', () => {
        it('should call api.call with Remove method', async () => {
            const mockApi = createMockApi([]);
            (mockApi.call as jest.Mock).mockImplementation((method, params, resolve, reject) => {
                if (method === 'Remove') {
                    resolve();
                }
            });

            await deleteReport(mockApi, 'aid_001');

            expect(mockApi.call).toHaveBeenCalledWith(
                'Remove',
                expect.objectContaining({
                    typeName: 'AddInData'
                }),
                expect.any(Function),
                expect.any(Function)
            );
        });
    });

    describe('deleteRequest', () => {
        it('should call api.call with Remove method', async () => {
            const mockApi = createMockApi([]);
            (mockApi.call as jest.Mock).mockImplementation((method, params, resolve, reject) => {
                if (method === 'Remove') {
                    resolve();
                }
            });

            await deleteRequest(mockApi, 'aid_001');

            expect(mockApi.call).toHaveBeenCalledWith(
                'Remove',
                expect.objectContaining({
                    typeName: 'AddInData'
                }),
                expect.any(Function),
                expect.any(Function)
            );
        });
    });
});
