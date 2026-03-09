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
    }),
    get length() {
        return Object.keys(localStorageMock.store).length;
    },
    key: jest.fn((index: number) => {
        return Object.keys(localStorageMock.store)[index] || null;
    })
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Mock IndexedDB (basic stub)
const indexedDBMock = {
    open: jest.fn().mockReturnValue({
        result: {
            objectStoreNames: { contains: () => false },
            createObjectStore: jest.fn(),
            transaction: jest.fn().mockReturnValue({
                objectStore: jest.fn().mockReturnValue({
                    put: jest.fn(),
                    get: jest.fn().mockReturnValue({ onsuccess: null, onerror: null, result: null }),
                    delete: jest.fn()
                }),
                oncomplete: null,
                onerror: null
            })
        },
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
    })
};

Object.defineProperty(window, 'indexedDB', {
    value: indexedDBMock,
    writable: true
});

// Reset mocks between tests
beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
});
