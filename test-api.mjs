import handler from './api/kis-price.js';

const mockReq = {
  query: { ticker: 'AAPL', type: 'overseas' },
  method: 'GET'
};

const mockRes = {
  status: (code) => {
    console.log('Status:', code);
    return mockRes;
  },
  json: (data) => {
    console.log('JSON Response:', JSON.stringify(data, null, 2));
    return mockRes;
  }
};

try {
  console.log('Testing handler...');
  await handler(mockReq, mockRes);
} catch (e) {
  console.error('Handler crashed:', e);
}
