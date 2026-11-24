import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'College portal API is running' });
});

app.listen(port, () => {
  console.log(`College portal API listening at http://localhost:${port}`);
});
