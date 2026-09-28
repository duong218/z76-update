const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const makeRequest = (i) => {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.write(JSON.stringify({ username: 'admin', password: 'wrongpassword' }));
    req.end();
  });
};

(async () => {
  console.log('Testing in current environment...');
  for (let i = 1; i <= 6; i++) {
    const result = await makeRequest(i);
    console.log(`Attempt ${i}: [${result.status}] ${result.data.message}`);
  }
})();
