import http from 'http';

const data = JSON.stringify({
  id: 'testuser',
  password: 'testpass',
  blogId: 'testblog',
  apiKey: 'testkey'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/settings',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
