import express from 'express';
import { google } from 'googleapis';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
app.use(express.json());

// In-memory store for task progress
const tasks: Record<string, {
  status: 'pending' | 'downloading' | 'uploading' | 'done' | 'error';
  progress: number;
  total: number;
  bytes: number;
  error?: string;
  fileId?: string;
}> = {};

// SSE clients
const sseClients: Record<string, express.Response[]> = {};

function broadcastProgress(taskId: string) {
  const clients = sseClients[taskId];
  if (clients) {
    const task = tasks[taskId];
    const data = `data: ${JSON.stringify(task)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  }
}

app.post('/api/download', async (req, res) => {
  const { url, filename, accessToken } = req.body;
  if (!url || !accessToken) {
    return res.status(400).json({ error: 'Missing url or accessToken' });
  }

  const taskId = uuidv4();
  tasks[taskId] = { status: 'pending', progress: 0, total: 0, bytes: 0 };

  // Return taskId immediately
  res.json({ taskId });

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    tasks[taskId].status = 'downloading';
    broadcastProgress(taskId);

    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream'
    });

    const totalStr = response.headers['content-length'];
    const total = totalStr ? parseInt(totalStr, 10) : 0;
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    
    let finalFilename = filename;
    if (!finalFilename) {
      try {
        const urlObj = new URL(url);
        finalFilename = path.basename(urlObj.pathname);
      } catch (e) {
        // Ignore parsing errors
      }
      if (!finalFilename) finalFilename = 'downloaded_file';
    }

    tasks[taskId].total = total;
    tasks[taskId].status = 'uploading';
    broadcastProgress(taskId);

    response.data.on('data', (chunk: Buffer) => {
      tasks[taskId].bytes += chunk.length;
      if (total > 0) {
        tasks[taskId].progress = Math.round((tasks[taskId].bytes / total) * 100);
      }
      broadcastProgress(taskId);
    });

    const driveRes = await drive.files.create({
      requestBody: {
        name: finalFilename,
      },
      media: {
        mimeType: contentType,
        body: response.data,
      },
      fields: 'id'
    });

    tasks[taskId].status = 'done';
    tasks[taskId].fileId = driveRes.data.id || undefined;
    tasks[taskId].progress = 100;
    broadcastProgress(taskId);

  } catch (error: any) {
    console.error('Download/Upload error:', error);
    tasks[taskId].status = 'error';
    tasks[taskId].error = error.message;
    broadcastProgress(taskId);
  }
});

app.get('/api/progress/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); 

  if (!sseClients[taskId]) {
    sseClients[taskId] = [];
  }
  sseClients[taskId].push(res);

  if (tasks[taskId]) {
    res.write(`data: ${JSON.stringify(tasks[taskId])}\n\n`);
  }

  req.on('close', () => {
    if (sseClients[taskId]) {
      sseClients[taskId] = sseClients[taskId].filter(client => client !== res);
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:3000`);
  });
}

startServer();
