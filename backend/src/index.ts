import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(
  cors({
    origin: [frontendUrl],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// API Routes
app.use('/api', apiRouter);

// Global Error Handler (must be registered last)
app.use(errorHandler);

// Only start the HTTP server when running locally (not on Vercel serverless)
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`[Server] Subtitle Translator Backend listening on http://localhost:${port}`);
  });
}

export default app;

