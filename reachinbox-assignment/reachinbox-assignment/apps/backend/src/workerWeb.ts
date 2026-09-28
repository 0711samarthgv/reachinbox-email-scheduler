import http from 'node:http';
import './worker';

const PORT = Number(process.env.PORT || 10000);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'bullmq-worker' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BullMQ worker is running');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Worker health server running on port ${PORT}`);
});
