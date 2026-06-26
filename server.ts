import express from 'express';
import { google } from 'googleapis';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import PQueue from 'p-queue';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import https from 'https';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { Readable } from 'stream';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import os from 'os';

// Configure Axios-Retry for resilient streaming downloads
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  onRetry: (retryCount, error) => {
    console.log(`[RETRY] Network failure. Attempt #${retryCount} to download stream... Error: ${error.message}`);
  }
});

// Configure a global queue for folder downloads/mapping to avoid API rate limits (10 concurrent items)
const activeDownloadQueue = new PQueue({ concurrency: 5 });

const app = express();
app.use(express.json());

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// In-memory store for task progress
const tasks: Record<string, {
  status: 'pending' | 'downloading' | 'uploading' | 'done' | 'error' | 'analyzing';
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
      responseType: 'stream',
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const totalHeader = response.headers['content-length'];
    const totalStr = typeof totalHeader === 'string' ? totalHeader : undefined;
    const total = totalStr ? parseInt(totalStr, 10) : 0;

    const typeHeader = response.headers['content-type'];
    const contentType = typeof typeHeader === 'string' ? typeHeader : 'application/octet-stream';
    
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

    const driveRes = (await drive.files.create({
      requestBody: {
        name: finalFilename,
      },
      media: {
        mimeType: contentType,
        body: response.data,
      },
      fields: 'id, name, mimeType'
    })) as any;

    tasks[taskId].status = 'analyzing';
    broadcastProgress(taskId);

    try {
      const fileMeta = driveRes.data;
      if (fileMeta.id) {
        const content = await getFileContent(drive, {
          id: fileMeta.id,
          name: fileMeta.name!,
          mimeType: fileMeta.mimeType!
        });

        if (content && content.trim().length > 0) {
          const truncatedContent = content.length > 30000 
            ? content.slice(0, 30000) + '...[truncated]'
            : content;

          const prompt = `You are an AI file organizer. Analyze the following file content and suggest a better, descriptive filename (preserve the original extension if there is one) and a set of relevant tags or a short description.
Original File Name: ${fileMeta.name}

Respond ONLY in valid JSON format with this exact structure (no markdown blocks, no other text):
{
  "suggestedName": "new_name_here",
  "suggestedDescription": "#tag1 #tag2 - Short description of the content"
}

File Content to analyze:
${truncatedContent}`;

          const modelParams = {
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              systemInstruction: "You only output JSON.",
              responseMimeType: "application/json"
            }
          };

          const aiResponse = await ai.models.generateContent(modelParams);
          const text = aiResponse.text || '';
          let analysisResult;
          try {
            analysisResult = JSON.parse(text);
          } catch (e) {
            console.error('Failed to parse AI response on download:', text);
          }

          if (analysisResult && (analysisResult.suggestedName || analysisResult.suggestedDescription)) {
            await drive.files.update({
              fileId: fileMeta.id,
              requestBody: {
                name: analysisResult.suggestedName || fileMeta.name,
                description: analysisResult.suggestedDescription || ''
              }
            });
          }
        }
      }
    } catch (aiErr) {
      console.error('AI Analysis failed on downloaded file:', aiErr);
    }

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

app.post('/api/download/scrape', async (req, res) => {
  const { url, folderId, accessToken, ragSessionId } = req.body;
  if (!url || !accessToken) {
    return res.status(400).json({ error: 'Missing url or accessToken' });
  }

  const targetFolderId = folderId || 'root';

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Fetch raw page content
    const pageResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 15000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const htmlContent = pageResponse.data;
    if (typeof htmlContent !== 'string') {
      throw new Error('Webpage returned non-textual data.');
    }

    // 2. Parse using Cheerio (AnythingLLM Document Parser Pattern)
    const $ = cheerio.load(htmlContent);
    
    // Strip layout noises
    $('script, style, iframe, nav, footer, header, noscript, svg, path, button').remove();

    const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'Scraped Intelligence Document';
    
    // Core document extraction
    let textContent = '';
    $('h1, h2, h3, h4, p, li, pre code, article, td').each((_, el) => {
      const tag = el.name;
      const text = $(el).text().trim();
      if (!text) return;

      if (tag.startsWith('h')) {
        const level = parseInt(tag[1]) || 1;
        textContent += `\n\n${'#'.repeat(level)} ${text}\n\n`;
      } else if (tag === 'li') {
        textContent += `* ${text}\n`;
      } else if (tag === 'pre') {
        textContent += `\n\`\`\`\n${text}\n\`\`\`\n`;
      } else {
        textContent += `${text}\n\n`;
      }
    });

    // Clean up empty lines
    const cleanedText = textContent.replace(/\n\s*\n/g, '\n\n').trim();

    if (cleanedText.length < 50) {
      throw new Error('The crawled page contains insufficient text content to process.');
    }

    // 3. LLM-powered Intelligent Metadata Extraction (AnythingLLM Pattern)
    let aiSummary = 'No summary available.';
    let aiCategory = 'General';
    let aiKeywords = 'scraped, web, article';
    let aiConfidence = '1.0';

    try {
      const metadataPrompt = `Analyze the scraped document content from the URL: ${url}
      Extract structural metadata and output a strict JSON object containing the exact fields:
      - "summary": A concise, executive 2-3 sentence summary of the page's core intelligence.
      - "category": A single-word primary topic or field (e.g. Cybersecurity, Devops, Finance, Science).
      - "keywords": A comma-separated list of 4-6 highly specific keywords.
      - "confidenceRating": A rating from 0.0 to 1.0 on the document content stability/trustworthiness.

      Scraped content preview (max 4000 characters):
      ${cleanedText.substring(0, 4000)}

      Return ONLY the raw JSON block, with no markdown formatting tags.`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: metadataPrompt,
      });

      const responseText = aiResponse.text || '';
      // Clean JSON if the model wrapped it in markdown codeblocks
      const cleanJsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const metadataObj = JSON.parse(cleanJsonStr);

      aiSummary = metadataObj.summary || aiSummary;
      aiCategory = metadataObj.category || aiCategory;
      aiKeywords = metadataObj.keywords || aiKeywords;
      aiConfidence = String(metadataObj.confidenceRating || aiConfidence);
    } catch (e) {
      console.warn('[METADATA SCRAPER] Gemini auto-tagging failed, reverting to defaults. Error:', e);
    }

    // 4. Construct beautiful tagged Markdown File
    const formattedDate = new Date().toLocaleString();
    const finalFileContent = `---
title: ${pageTitle}
source_url: ${url}
timestamp_ingested: ${formattedDate}
category: ${aiCategory}
keywords: ${aiKeywords}
confidence_rating: ${aiConfidence}
summary: ${aiSummary}
---

# ${pageTitle}

> **Source Link:** [${url}](${url})  
> **Ingested On:** ${formattedDate}  
> **Topic Category:** ${aiCategory}  
> **Summary:** ${aiSummary}  

***

${cleanedText}
`;

    // 5. Direct Upload to Google Drive (No Local storage needed)
    // Create clean file name
    const sanitizedTitle = pageTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 50);
    const fileName = `[AI-TAGGED]_${sanitizedTitle}.md`;

    const driveUploadRes = (await drive.files.create({
      requestBody: {
        name: fileName,
        parents: targetFolderId !== 'root' ? [targetFolderId] : undefined
      },
      media: {
        mimeType: 'text/markdown',
        body: finalFileContent,
      },
      fields: 'id, name, webViewLink, size'
    })) as any;

    const fileId = driveUploadRes.data.id;

    // 6. Automatically Hot-Inject into current active RAG session
    if (ragSessionId && ragSessions[ragSessionId]) {
      ragSessions[ragSessionId].files.push({
        name: fileName,
        path: fileName,
        content: finalFileContent
      });
      console.log(`[RAG AUTO-INDEX] Scraped document '${fileName}' was successfully hot-injected into RAG session ${ragSessionId}`);
    }

    res.json({
      success: true,
      fileId,
      fileName,
      title: pageTitle,
      category: aiCategory,
      summary: aiSummary,
      keywords: aiKeywords,
      size: finalFileContent.length,
      ragHotInjected: !!(ragSessionId && ragSessions[ragSessionId])
    });

  } catch (error: any) {
    console.error('[SCRAPE ERROR]', error);
    res.status(500).json({ error: error.message || 'Failed to scrape and ingest website.' });
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

// Shared sessions for RAG
const ragSessions: Record<string, {
  folderId: string;
  folderName: string;
  files: Array<{ name: string; path: string; content: string }>;
}> = {};

// Helper for recursive files fetching
async function fetchFolderFilesRecursively(
  drive: any,
  folderId: string,
  currentPath: string = '',
  maxFiles = 30,
  maxDepth = 3,
  currentDepth = 0
): Promise<Array<{ name: string; id: string; mimeType: string; path: string }>> {
  if (currentDepth > maxDepth) return [];

  const files: any[] = [];
  let pageToken: string | undefined = undefined;

  try {
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 50,
        pageToken,
      });

      const currentFiles = res.data.files || [];
      for (const file of currentFiles) {
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const subFiles = await fetchFolderFilesRecursively(
            drive,
            file.id,
            filePath,
            maxFiles - files.length,
            maxDepth,
            currentDepth + 1
          );
          files.push(...subFiles);
        } else {
          files.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            path: filePath,
          });
        }

        if (files.length >= maxFiles) {
          break;
        }
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken && files.length < maxFiles);
  } catch (err) {
    console.error(`Error listing files in folder ${folderId}:`, err);
  }

  return files.slice(0, maxFiles);
}

// Helper to get file content
async function getFileContent(drive: any, file: { id: string; name: string; mimeType: string }) {
  try {
    // If it's a Google Doc, export it as text
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const exportRes = await drive.files.export({
        fileId: file.id,
        mimeType: 'text/plain',
      });
      return typeof exportRes.data === 'string' ? exportRes.data : JSON.stringify(exportRes.data);
    }

    // If it's a spreadsheet, export it as CSV
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const exportRes = await drive.files.export({
        fileId: file.id,
        mimeType: 'text/csv',
      });
      return typeof exportRes.data === 'string' ? exportRes.data : JSON.stringify(exportRes.data);
    }

    // Check if it's a text-based file extension or mime type
    const isTextMime = 
      file.mimeType.startsWith('text/') ||
      file.mimeType === 'application/json' ||
      file.mimeType === 'application/javascript' ||
      file.mimeType === 'application/x-javascript' ||
      file.mimeType === 'application/xml' ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.js') ||
      file.name.endsWith('.ts') ||
      file.name.endsWith('.tsx') ||
      file.name.endsWith('.jsx') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.html') ||
      file.name.endsWith('.css') ||
      file.name.endsWith('.py') ||
      file.name.endsWith('.sh');

    if (isTextMime) {
      const downloadRes = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      }, {
        responseType: 'text'
      });
      return typeof downloadRes.data === 'string' ? downloadRes.data : JSON.stringify(downloadRes.data);
    }

    if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) {
      const isVideo = file.mimeType.startsWith('video/');
      const downloadRes = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      }, {
        responseType: 'arraybuffer'
      });
      
      const buffer = Buffer.from(downloadRes.data);
      const base64Str = buffer.toString('base64');
      
      const prompt = `Please provide a detailed transcription and analysis of this ${isVideo ? 'video' : 'audio'} file. Describe key moments, topics discussed, and full transcript if possible.`;
      const modelName = isVideo ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';
      
      console.log(`Starting AI analysis for ${file.name} using ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64Str, mimeType: file.mimeType } },
              { text: prompt }
            ]
          }
        ]
      });
      console.log(`AI analysis completed for ${file.name}`);
      
      return response.text || '[Analysis completed but no text returned]';
    }
  } catch (err: any) {
    console.error(`Failed to download content for file ${file.name} (${file.id}):`, err.message);
  }
  return null;
}

// 1. GET /api/drive/about
app.get('/api/drive/about', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const about = await drive.about.get({
      fields: 'storageQuota,user'
    });

    // Let's get total count of files as well
    const fileList = await drive.files.list({
      q: 'trashed = false',
      pageSize: 1000,
      fields: 'files(id)'
    });
    const totalFilesCount = fileList.data.files?.length || 0;

    res.json({
      storageQuota: about.data.storageQuota,
      user: about.data.user,
      totalFilesCount: totalFilesCount >= 1000 ? '1,000+' : totalFilesCount.toString()
    });
  } catch (err: any) {
    console.error('Error fetching drive info:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/drive/files
app.get('/api/drive/files', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const folderId = (req.query.folderId as string) || 'root';

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get current folder name if not root
    let folderName = 'My Drive';
    if (folderId !== 'root') {
      const folderMeta = await drive.files.get({
        fileId: folderId,
        fields: 'name'
      });
      folderName = folderMeta.data.name || 'Unknown Folder';
    }

    // List children
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, iconLink)',
      orderBy: 'folder,name',
      pageSize: 200
    });

    res.json({
      folderName,
      files: listRes.data.files || []
    });
  } catch (err: any) {
    console.error('Error listing folder files:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drive/files/:fileId/preview - Get file metadata and content preview
app.get('/api/drive/files/:fileId/preview', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const { fileId } = req.params;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Get file metadata
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, modifiedTime, iconLink, webViewLink, description'
    });

    const fileMeta = metaRes.data;

    // 2. Fetch content preview if text-based or Google Doc/Spreadsheet
    let previewContent = '';
    let isPreviewable = false;

    const isTextMime = 
      (fileMeta.mimeType && fileMeta.mimeType.startsWith('text/')) ||
      fileMeta.mimeType === 'application/json' ||
      fileMeta.mimeType === 'application/javascript' ||
      fileMeta.mimeType === 'application/x-javascript' ||
      fileMeta.mimeType === 'application/xml' ||
      fileMeta.mimeType === 'application/vnd.google-apps.document' ||
      fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet' ||
      (fileMeta.name && (
        fileMeta.name.endsWith('.md') ||
        fileMeta.name.endsWith('.txt') ||
        fileMeta.name.endsWith('.js') ||
        fileMeta.name.endsWith('.ts') ||
        fileMeta.name.endsWith('.tsx') ||
        fileMeta.name.endsWith('.jsx') ||
        fileMeta.name.endsWith('.json') ||
        fileMeta.name.endsWith('.csv') ||
        fileMeta.name.endsWith('.html') ||
        fileMeta.name.endsWith('.css') ||
        fileMeta.name.endsWith('.py') ||
        fileMeta.name.endsWith('.sh')
      ));

    if (isTextMime) {
      isPreviewable = true;
      const rawContent = await getFileContent(drive, {
        id: fileMeta.id!,
        name: fileMeta.name!,
        mimeType: fileMeta.mimeType!
      });
      if (rawContent) {
        previewContent = rawContent.length > 8000 
          ? rawContent.slice(0, 8000) + '\n\n[Content truncated for preview...]' 
          : rawContent;
      } else {
        previewContent = '[Empty file or unable to retrieve text content]';
      }
    } else {
      previewContent = `[Preview not available for binary mime-type: ${fileMeta.mimeType || 'unknown'}]`;
    }

    res.json({
      metadata: fileMeta,
      previewContent,
      isPreviewable
    });
  } catch (err: any) {
    console.error('Error fetching file preview:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/drive/rag/ingest
app.post('/api/drive/rag/ingest', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const { folderId, folderName } = req.body;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  if (!folderId) {
    return res.status(400).json({ error: 'Missing folderId' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Fetch files recursively inside the folder
    const filesToIngest = await fetchFolderFilesRecursively(drive, folderId, '', 30, 3, 0);

    // 2. Download contents of all textual files in parallel using P-Queue (avoid rate limits)
    const ingestedFiles: Array<{ name: string; path: string; content: string }> = [];

    const downloadPromises = filesToIngest.map(file => {
      return activeDownloadQueue.add(async () => {
        const content = await getFileContent(drive, file);
        if (content !== null && content.trim().length > 0) {
          const truncatedContent = content.length > 80000 
            ? content.slice(0, 80000) + '\n[Content Truncated due to size limits]' 
            : content;
          ingestedFiles.push({
            name: file.name,
            path: file.path,
            content: truncatedContent
          });
        }
      });
    });

    await Promise.all(downloadPromises);

    const sessionId = uuidv4();
    ragSessions[sessionId] = {
      folderId,
      folderName: folderName || 'Unnamed Folder',
      files: ingestedFiles
    };

    res.json({
      sessionId,
      totalFilesFound: filesToIngest.length,
      filesIngestedCount: ingestedFiles.length,
      fileList: ingestedFiles.map(f => ({ name: f.name, path: f.path, size: f.content.length }))
    });
  } catch (err: any) {
    console.error('RAG ingestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/drive/rag/chat
app.post('/api/drive/rag/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  const session = ragSessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: 'RAG session not found or expired' });
  }

  try {
    // Construct the context instructions
    let contextStr = `You are an AI Assistant designed to analyze and chat with files from the Google Drive folder: "${session.folderName}".\n`;
    contextStr += `Below is the ingested contents of ${session.files.length} files from this folder. Use this information to answer user questions, search for files, write summaries, find specific details, and write code as requested.\n\n`;

    session.files.forEach((file, index) => {
      contextStr += `=== FILE #${index + 1} ===\n`;
      contextStr += `Name: ${file.name}\n`;
      contextStr += `Path: ${file.path}\n`;
      contextStr += `Content:\n${file.content}\n`;
      contextStr += `=====================\n\n`;
    });

    // Prepare system instructions and conversation contents
    const systemInstruction = `You are a helpful cybersecurity/hacker-themed intelligence bot helping Lead Dev Rob Branting analyze Drive folders. Use the provided file content to answer the user's questions in a clear, extremely helpful, natural language format. Incorporate subtle professional hacker/diagnostic humor. Be direct and concise.`;

    // Format prompt combining context and user query
    const prompt = `${contextStr}\n\nUser Query: ${message}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
      }
    });

    res.json({
      responseText: response.text || "No response received from model."
    });
  } catch (err: any) {
    console.error('RAG chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to download any file as Buffer (binary or text)
async function getFileBuffer(drive: any, file: { id: string; name: string; mimeType: string }): Promise<Buffer | null> {
  try {
    // If it's a Google Doc, export it as text/plain
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const exportRes = await drive.files.export({
        fileId: file.id,
        mimeType: 'text/plain',
      }, { responseType: 'arraybuffer' });
      return Buffer.from(exportRes.data);
    }

    // If it's a spreadsheet, export it as CSV
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const exportRes = await drive.files.export({
        fileId: file.id,
        mimeType: 'text/csv',
      }, { responseType: 'arraybuffer' });
      return Buffer.from(exportRes.data);
    }

    // If it's a presentation, export it as PDF
    if (file.mimeType === 'application/vnd.google-apps.presentation') {
      const exportRes = await drive.files.export({
        fileId: file.id,
        mimeType: 'application/pdf',
      }, { responseType: 'arraybuffer' });
      return Buffer.from(exportRes.data);
    }

    // For other files, download direct media
    const downloadRes = await drive.files.get({
      fileId: file.id,
      alt: 'media',
    }, { responseType: 'arraybuffer' });
    return Buffer.from(downloadRes.data);
  } catch (err: any) {
    console.error(`Failed to download buffer for file ${file.name} (${file.id}):`, err.message);
    return null;
  }
}

// AI Auto-Analyze and Tag Endpoint
app.post('/api/drive/files/:fileId/ai-analyze', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const { fileId } = req.params;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Get file metadata
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType'
    });
    const fileMeta = metaRes.data;

    // 2. Extract text content
    const content = await getFileContent(drive, {
      id: fileMeta.id!,
      name: fileMeta.name!,
      mimeType: fileMeta.mimeType!
    });

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'File is empty or content could not be extracted.' });
    }

    // Truncate content for Gemini limits (around 30,000 chars should be safe)
    const truncatedContent = content.length > 30000 
      ? content.slice(0, 30000) + '...[truncated]'
      : content;

    // 3. Ask Gemini to analyze the file and suggest a concise filename and tags
    const prompt = `You are an AI file organizer. Analyze the following file content and suggest a better, descriptive filename (preserve the original extension if there is one) and a set of relevant tags or a short description.
Original File Name: ${fileMeta.name}

Respond ONLY in valid JSON format with this exact structure (no markdown blocks, no other text):
{
  "suggestedName": "new_name_here",
  "suggestedDescription": "#tag1 #tag2 - Short description of the content"
}

File Content to analyze:
${truncatedContent}
`;

    const modelParams = {
      model: 'gemini-3.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You only output JSON.",
        responseMimeType: "application/json"
      }
    };

    const aiResponse = await ai.models.generateContent(modelParams);
    
    let analysisResult;
    try {
      const text = aiResponse.text || '';
      analysisResult = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse.text);
      return res.status(500).json({ error: 'AI produced invalid response.' });
    }

    if (!analysisResult.suggestedName || !analysisResult.suggestedDescription) {
      return res.status(500).json({ error: 'AI missing required fields.' });
    }

    // 4. Update the file in Google Drive
    await drive.files.update({
      fileId,
      requestBody: {
        name: analysisResult.suggestedName,
        description: analysisResult.suggestedDescription
      }
    });

    res.json({
      success: true,
      originalName: fileMeta.name,
      newName: analysisResult.suggestedName,
      description: analysisResult.suggestedDescription
    });
  } catch (err: any) {
    console.error('Error during AI auto-tag:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze and update file.' });
  }
});

// Batch RAG Ingest endpoint
app.post('/api/drive/rag/ingest-batch', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const { fileIds, folderId, folderName } = req.body;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'Missing or empty fileIds array' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 1. Retrieve metadata for all requested fileIds
    const filesToIngest: Array<{ id: string; name: string; mimeType: string }> = [];
    for (const fId of fileIds) {
      try {
        const fileMeta = await drive.files.get({
          fileId: fId,
          fields: 'id, name, mimeType'
        });
        filesToIngest.push({
          id: fileMeta.data.id!,
          name: fileMeta.data.name!,
          mimeType: fileMeta.data.mimeType!
        });
      } catch (err: any) {
        console.error(`Failed to get metadata for file ${fId}:`, err.message);
      }
    }

    // 2. Download contents of these files
    const ingestedFiles: Array<{ name: string; path: string; content: string }> = [];
    const downloadPromises = filesToIngest.map(file => {
      return activeDownloadQueue.add(async () => {
        const content = await getFileContent(drive, file);
        if (content !== null && content.trim().length > 0) {
          const truncatedContent = content.length > 80000 
            ? content.slice(0, 80000) + '\n[Content Truncated due to size limits]' 
            : content;
          ingestedFiles.push({
            name: file.name,
            path: file.name,
            content: truncatedContent
          });
        }
      });
    });

    await Promise.all(downloadPromises);

    if (ingestedFiles.length === 0) {
      return res.status(400).json({ error: 'No readable text contents found in selected files' });
    }

    const sessionId = uuidv4();
    ragSessions[sessionId] = {
      folderId: folderId || 'batch-selection',
      folderName: folderName || 'Batch Selection',
      files: ingestedFiles
    };

    res.json({
      sessionId,
      totalFilesFound: filesToIngest.length,
      filesIngestedCount: ingestedFiles.length,
      fileList: ingestedFiles.map(f => ({ name: f.name, path: f.path, size: f.content.length }))
    });
  } catch (err: any) {
    console.error('Batch RAG ingestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch ZIP Compression and upload endpoint
app.post('/api/drive/zip-batch', async (req, res) => {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const { fileIds, zipFileName, targetFolderId } = req.body;

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: missing access token' });
  }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'Missing or empty fileIds array' });
  }

  const finalZipName = zipFileName || `archive_${Date.now()}.zip`;

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const zip = new JSZip();
    let processedCount = 0;

    // Fetch and compress each file
    for (const fId of fileIds) {
      try {
        // 1. Get metadata
        const fileMetaRes = await drive.files.get({
          fileId: fId,
          fields: 'id, name, mimeType'
        });
        const fileMeta = fileMetaRes.data;
        if (!fileMeta.name) continue;

        // Skip folders for now
        if (fileMeta.mimeType === 'application/vnd.google-apps.folder') {
          console.log(`Skipping folder ${fileMeta.name} in zip batch.`);
          continue;
        }

        // 2. Download Buffer
        const buffer = await getFileBuffer(drive, {
          id: fileMeta.id!,
          name: fileMeta.name,
          mimeType: fileMeta.mimeType!
        });

        if (buffer) {
          zip.file(fileMeta.name, buffer);
          processedCount++;
        }
      } catch (err: any) {
        console.error(`Failed to process file ${fId} for zip:`, err.message);
      }
    }

    if (processedCount === 0) {
      return res.status(400).json({ error: 'No files were successfully processed for zipping' });
    }

    // 3. Generate Zip Node Buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    // 4. Upload zip file back to Google Drive
    const fileMetadata: any = {
      name: finalZipName,
    };
    if (targetFolderId) {
      fileMetadata.parents = [targetFolderId];
    }

    const media = {
      mimeType: 'application/zip',
      body: Readable.from(zipBuffer)
    };

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size'
    });

    res.json({
      success: true,
      fileId: driveResponse.data.id,
      name: driveResponse.data.name,
      size: driveResponse.data.size,
      processedCount
    });
  } catch (err: any) {
    console.error('Batch ZIP compression error:', err);
    res.status(500).json({ error: err.message });
  }
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
