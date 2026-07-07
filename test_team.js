const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/teams',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.write(JSON.stringify({ nombre: 'Test Team' }));
req.end();
