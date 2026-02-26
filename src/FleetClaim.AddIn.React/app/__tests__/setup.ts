import '@testing-library/jest-dom';

// Mock window.geotab
Object.defineProperty(window, 'geotab', {
    value: {
        addin: {}
    },
    writable: true
});

// Mock localStorage
const localStorageMock = {
    store: {} as Record<string, string>,
    getItem: jest.fn((key: string) => localStorageMock.store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
        localStorageMock.store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
        delete localStorageMock.store[key];
    }),
    clear: jest.fn(() => {
        localStorageMock.store = {};
    })
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Mock clipboard
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn()
    },
    writable: true
});

// Reset mocks between tests
beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
});
