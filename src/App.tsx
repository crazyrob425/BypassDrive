/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { 
  DownloadCloud, CheckCircle2, AlertCircle, Loader2, Link as LinkIcon, 
  FileIcon, X, Plus, Terminal, Bug, Skull, Coffee, Folder, FolderOpen, 
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, RefreshCw, HardDrive, Database, Send, Sparkles, LayoutGrid, 
  FileText, ShieldCheck, Cpu, Search, FileArchive, Check, Save, Pencil, Trash2, Download, Info, Code, Play, Pause, HelpCircle
} from 'lucide-react';
import { initAuth, googleSignIn, getAccessToken, logout } from './auth';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { marked } from 'marked';
import StorageVisualizer from './components/StorageVisualizer';

interface Task {
  id: string;
  url: string;
  filename: string;
  status: 'pending' | 'downloading' | 'uploading' | 'done' | 'error' | 'analyzing';
  progress: number;
  total: number;
  bytes: number;
  error?: string;
  fileId?: string;
}

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Direct URL Scraper States (Super Feature)
  const [sidebarMode, setSidebarMode] = useState<'download' | 'scrape'>('download');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapedInfo, setScrapedInfo] = useState<{ title: string; category: string; summary: string; ragHotInjected: boolean } | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Tab control
  const [activeTab, setActiveTab] = useState<'downloads' | 'explorer'>('downloads');

  // Search and Batch Selection States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [zipFileNameInput, setZipFileNameInput] = useState('');
  const [showZipDialog, setShowZipDialog] = useState(false);

  // AI Connection Settings State
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiStatus, setAiStatus] = useState<'active' | 'backup'>('active');
  const [customGeminiKey, setCustomGeminiKey] = useState(localStorage.getItem('customGeminiKey') || '');
  const [customOpenAiKey, setCustomOpenAiKey] = useState(localStorage.getItem('customOpenAiKey') || '');
  const [pollinationEnabled, setPollinationEnabled] = useState(localStorage.getItem('pollinationEnabled') !== 'false');

  // Theme State
  const [theme, setTheme] = useState<'hacker' | 'elite'>(
    (localStorage.getItem('app_theme') as 'hacker' | 'elite') || 'hacker'
  );

  // Layout Collapse States
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [showFolders, setShowFolders] = useState(true);
  const [showSysStatus, setShowSysStatus] = useState(true);
  const [showBento, setShowBento] = useState(true);
  const [showIntel, setShowIntel] = useState(true);
  
  // r00tBypass Chat State
  const [showRootChat, setShowRootChat] = useState(false);
  const [rootChatMessages, setRootChatMessages] = useState<Array<{role: 'user'|'r00t', text: string}>>([
    { role: 'r00t', text: 'Oh look, another user. What do you want? I can control this entire app, so speak up or get out of my domain.' }
  ]);
  const [rootChatInput, setRootChatInput] = useState('');
  const [isRootThinking, setIsRootThinking] = useState(false);

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('customGeminiKey', customGeminiKey);
    localStorage.setItem('customOpenAiKey', customOpenAiKey);
    localStorage.setItem('pollinationEnabled', String(pollinationEnabled));
  }, [customGeminiKey, customOpenAiKey, pollinationEnabled]);

  // Quick-Look preview states
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    metadata: any;
    previewContent: string;
    previewType: string;
    isPreviewable: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [infoFile, setInfoFile] = useState<any | null>(null);
  const [infoNotes, setInfoNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Move/Rename states
  const [renameFile, setRenameFile] = useState<any | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [moveFolderId, setMoveFolderId] = useState('');
  const [renameMoveLoading, setRenameMoveLoading] = useState(false);
  const [allFolders, setAllFolders] = useState<any[]>([]);
  
  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    file: any;
  } | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => {
      if (contextMenu?.visible) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  
  // AI Analyze Tracking
  const [analyzingFileIds, setAnalyzingFileIds] = useState<string[]>([]);

  // Google Drive states
  const [driveStats, setDriveStats] = useState<{
    limit: number;
    usage: number;
    free: number;
    totalFiles: string;
    user: any;
  } | null>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'My Drive' }
  ]);
  const [explorerFiles, setExplorerFiles] = useState<any[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [folderName, setFolderName] = useState('My Drive');

  // RAG / AI Chat states
  const [ragSessionId, setRagSessionId] = useState<string | null>(null);
  const [ragIngesting, setRagIngesting] = useState(false);
  const [ragIngestionResult, setRagIngestionResult] = useState<any | null>(null);
  const [ragMessages, setRagMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; timestamp: Date }>>([]);
  const [ragInput, setRagInput] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragActiveFolderName, setRagActiveFolderName] = useState<string | null>(null);
  const [showRAGPanel, setShowRAGPanel] = useState(false);

  useEffect(() => {
    initAuth(
      (user) => {
        setUser(user);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
  }, []);

  // Fetch Drive Data (About & Files)
  const loadDriveData = async (folderId = currentFolderId) => {
    setSelectedFileIds([]); // Clear batch selection when folder changes or reloads
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setExplorerLoading(true);
    try {
      // 1. Fetch storage quotas
      const aboutRes = await fetch('/api/drive/about', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (aboutRes.ok) {
        const aboutData = await aboutRes.json();
        setDriveStats({
          limit: Number(aboutData.storageQuota?.limit || 16106127360),
          usage: Number(aboutData.storageQuota?.usage || 0),
          free: Number(aboutData.storageQuota?.limit || 16106127360) - Number(aboutData.storageQuota?.usage || 0),
          totalFiles: aboutData.totalFilesCount || '0',
          user: aboutData.user || null
        });
      }

      // 2. Fetch files list
      const filesRes = await fetch(`/api/drive/files?folderId=${folderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        setExplorerFiles(filesData.files);
        setFolderName(filesData.folderName);
      }
    } catch (err) {
      console.error('Error loading Drive data:', err);
    } finally {
      setExplorerLoading(false);
    }
  };

  // Trigger load drive data when user connects or active tab is explorer
  useEffect(() => {
    if (user && activeTab === 'explorer') {
      loadDriveData(currentFolderId);
    }
  }, [user, activeTab, currentFolderId]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const startTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'http://' + finalUrl;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setNeedsAuth(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl, filename: filename.trim(), accessToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to start transfer');
      }

      const data = await response.json();
      const taskId = data.taskId;

      const newTask: Task = {
        id: taskId,
        url: finalUrl,
        filename: filename.trim() || 'Auto-detect',
        status: 'pending',
        progress: 0,
        total: 0,
        bytes: 0
      };

      setTasks(prev => [newTask, ...prev]);
      setUrl('');
      setFilename('');

      // Setup SSE for progress tracking
      const eventSource = new EventSource(`/api/progress/${taskId}`);
      eventSource.onmessage = (event) => {
        const update = JSON.parse(event.data);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...update } : t));
        
        if (update.status === 'done' || update.status === 'error') {
          eventSource.close();
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', error: 'Connection lost' } : t));
      };

    } catch (err) {
      console.error('Start task error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleScrapeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) return;

    let finalUrl = scrapeUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'http://' + finalUrl;
    }

    setScrapeLoading(true);
    setScrapeError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      const res = await fetch('/api/download/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          folderId: currentFolderId,
          accessToken: token,
          ragSessionId: ragSessionId,
          aiSettings: { customGeminiKey, customOpenAiKey, pollinationEnabled }
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Scraping transaction aborted by remote node');
      }

      const data = await res.json();
      setScrapedInfo({
        title: data.title,
        category: data.category,
        summary: data.summary,
        ragHotInjected: data.ragHotInjected
      });

      setScrapeUrl('');
      // Reload current folder browser to show the newly created markdown file!
      loadDriveData(currentFolderId);

      // Add a helpful notification in RAG chat if active
      if (data.ragHotInjected) {
        setRagMessages(prev => [
          ...prev,
          { 
            sender: 'ai', 
            text: `### 🚀 [AI HOT-INJECTION COGNITION SUCCESS]\n\nIngested document **"${data.fileName}"** has been successfully added directly to your active RAG context.\n\n* **Topic Category:** ${data.category}\n* **File Size:** ${data.size} bytes\n* **Summary:** ${data.summary}`, 
            timestamp: new Date() 
          }
        ]);
        setShowRAGPanel(true);
      } else {
        // If RAG is not active, give a nice popup or switch tab
        alert(`Successfully scraped and saved to Drive:\nTitle: ${data.title}\nCategory: ${data.category}`);
      }
    } catch (err: any) {
      console.error('URL Scraper Error:', err);
      setScrapeError(err.message);
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleRenameMoveClick = async (file: any) => {
    setRenameFile(file);
    setRenameInput(file.name);
    
    // Find current parent from file or assume currentFolderId
    let currentParent = currentFolderId;
    if (file.parents && file.parents.length > 0) {
      currentParent = file.parents[0];
    }
    setMoveFolderId(currentParent);
    
    // Fetch folders
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/drive/folders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllFolders([{ id: 'root', name: 'My Drive' }, ...data.folders]);
      }
    } catch (err) {
      console.error('Error fetching folders:', err);
    }
  };

  const submitRenameMove = async (e: FormEvent) => {
    e.preventDefault();
    if (!renameFile) return;
    
    setRenameMoveLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      
      let currentParent = currentFolderId;
      if (renameFile.parents && renameFile.parents.length > 0) {
        currentParent = renameFile.parents[0];
      }

      const body: any = {};
      if (renameInput !== renameFile.name) body.name = renameInput;
      if (moveFolderId !== currentParent) {
        body.newParentId = moveFolderId;
        body.currentParentId = currentParent;
      }

      const res = await fetch(`/api/drive/files/${renameFile.id}/move-rename`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Update local state
        if (moveFolderId !== currentParent && currentFolderId !== 'search') {
          // File moved out of current folder
          setExplorerFiles(prev => prev.filter(f => f.id !== renameFile.id));
        } else {
          // File renamed but stays in current folder
          setExplorerFiles(prev => prev.map(f => f.id === renameFile.id ? { ...f, name: data.name } : f));
        }
        setRenameFile(null);
      }
    } catch (err) {
      console.error('Error renaming/moving file:', err);
    } finally {
      setRenameMoveLoading(false);
    }
  };

  const handleFileInfoClick = (file: any) => {
    setInfoFile(file);
    setInfoNotes(file.description || '');
  };

  const handleFilePreviewClick = async (fileId: string) => {
    setPreviewFileId(fileId);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      const res = await fetch(`/api/drive/files/${fileId}/preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Failed to fetch file preview from secure nodes.');
      }
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      console.error('Preview error:', err);
      setPreviewError(err.message || 'Error downloading preview metadata.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!infoFile) return;
    setSavingNotes(true);
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    try {
      const res = await fetch(`/api/drive/files/${infoFile.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description: infoNotes })
      });
      if (res.ok) {
        const data = await res.json();
        setInfoFile({ ...infoFile, description: data.description });
        setExplorerFiles(prev => prev.map(f => f.id === infoFile.id ? { ...f, description: data.description } : f));
      }
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleQueryFile = () => {
    if (!infoFile) return;
    const { name } = infoFile;
    
    // Auto-populate input
    setRagInput(`Could you analyze the file "${name}" and summarize its core insights?`);
    setShowRAGPanel(true);
    
    if (!ragSessionId) {
      setRagMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `💡 **Tip:** To query this specific file and other related files, please click **"AI RAG"** next to the folder name or any subdirectory to load the files into the AI memory. For convenience, I have pre-filled your chat prompt.`,
          timestamp: new Date()
        }
      ]);
    }
    
    // Close the info drawer
    setInfoFile(null);
  };

  const handleBatchAITag = async () => {
    if (selectedFileIds.length === 0) return;
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setBatchActionLoading(true);
    try {
      await Promise.allSettled(
        selectedFileIds.map(async (fileId) => {
          setAnalyzingFileIds(prev => [...prev, fileId]);
          try {
            const res = await fetch(`/api/drive/files/${fileId}/ai-analyze`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                aiSettings: { customGeminiKey, customOpenAiKey, pollinationEnabled }
              })
            });
            const data = await res.json();
            if (!res.ok) {
              console.error(`Failed to analyze file ${fileId}:`, data.error);
            } else if (data.usedBackup) {
              setAiStatus('backup');
            }
          } catch (err) {
             console.error(`Error analyzing file ${fileId}:`, err);
          } finally {
            setAnalyzingFileIds(prev => prev.filter(id => id !== fileId));
          }
        })
      );
      
      // Reload current folder contents to show updated metadata
      if (currentFolderId !== 'search') {
        fetchFolderContents(currentFolderId);
      }
    } catch (err) {
      console.error('Error during batch AI tagging:', err);
    } finally {
      setBatchActionLoading(false);
      setSelectedFileIds([]);
    }
  };

  const handleBatchRAGIngest = async () => {
    if (selectedFileIds.length === 0) return;
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setShowRAGPanel(true);
    setRagIngesting(true);
    setBatchActionLoading(true);
    setRagActiveFolderName("Batch Selection");
    setRagMessages([
      { sender: 'ai', text: `SYSTEM LOG: BOOTING NEURAL RAG INDEXING SUBSYSTEM IN BATCH MODE...`, timestamp: new Date() },
      { sender: 'ai', text: `SYSTEM LOG: INGESTING ${selectedFileIds.length} SELECTED FILES IN PARALLEL FROM EXPLORER...`, timestamp: new Date() }
    ]);

    try {
      const res = await fetch('/api/drive/rag/ingest-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileIds: selectedFileIds,
          folderId: currentFolderId,
          folderName: 'Batch Selection'
        })
      });

      if (!res.ok) {
        throw new Error('Batch RAG Ingestion mapping failed');
      }

      const data = await res.json();
      setRagSessionId(data.sessionId);
      setRagIngestionResult(data);
      setSelectedFileIds([]); // clear selection upon success!

      setRagMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `SYSTEM LOG: SUCCESS! Batch map completed.\n\nSuccessfully ingested **${data.filesIngestedCount}** out of **${data.totalFilesFound}** selected files into Active Memory.\n\nYou can now ask questions about these files collectively!`,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      console.error('Batch RAG ingest error:', err);
      setRagMessages(prev => [
        ...prev,
        { sender: 'ai', text: `SYSTEM ERROR: Ingestion abort. ${err.message}. Please verify permissions or try again.`, timestamp: new Date() }
      ]);
    } finally {
      setRagIngesting(false);
      setBatchActionLoading(false);
    }
  };

  const handleBatchZipCompress = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedFileIds.length === 0) return;
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setBatchActionLoading(true);
    const zipName = zipFileNameInput.trim() || `archive_${Math.floor(Math.random() * 9000 + 1000)}.zip`;

    try {
      const res = await fetch('/api/drive/zip-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileIds: selectedFileIds,
          zipFileName: zipName.endsWith('.zip') ? zipName : `${zipName}.zip`,
          targetFolderId: currentFolderId
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Batch ZIP generation request aborted.');
      }

      const data = await res.json();
      
      // Notify in chat or alert
      if (ragSessionId) {
        setRagMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: `### 📦 Bulk Compression Success\n\nCreated zip file **"${data.name}"** containing **${data.processedCount}** files.\n\n* **Storage Location:** Saved in active Drive folder.\n* **Size:** ${formatBytes(Number(data.size))}`,
            timestamp: new Date()
          }
        ]);
        setShowRAGPanel(true);
      } else {
        alert(`Successfully zipped and saved archive:\nName: ${data.name}\nSize: ${formatBytes(Number(data.size))}`);
      }

      setSelectedFileIds([]);
      setShowZipDialog(false);
      setZipFileNameInput('');
      
      // Reload current folder contents to show the new ZIP file!
      loadDriveData(currentFolderId);
    } catch (err: any) {
      console.error('Batch ZIP compression error:', err);
      alert(`ZIP Error: ${err.message}`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleDeleteFile = async (file: any) => {
    if (!window.confirm(`Are you sure you want to move "${file.name}" to trash?`)) return;
    
    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      const res = await fetch(`/api/drive/files/${file.id}/trash`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setExplorerFiles(prev => prev.filter(f => f.id !== file.id));
      }
    } catch (err) {
      console.error('Error trashing file:', err);
    }
  };

  const handleDownloadFile = (file: any) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank');
    }
  };

  const handleDropMove = async (draggedFileId: string, currentParentId: string, targetFolderId: string) => {
    if (!draggedFileId || !targetFolderId || draggedFileId === targetFolderId) return;

    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      
      const res = await fetch(`/api/drive/files/${draggedFileId}/move-rename`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newParentId: targetFolderId,
          currentParentId: currentParentId
        })
      });
      
      if (res.ok) {
        // Remove from current view
        setExplorerFiles(prev => prev.filter(f => f.id !== draggedFileId));
      } else {
        console.error('Failed to move file');
      }
    } catch (err) {
      console.error('Error moving file via drag and drop:', err);
    }
  };

  const handleCompressFolder = async (folder: any) => {
    setBatchActionLoading(true);
    const zipName = `archive_${folder.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Math.floor(Math.random() * 9000 + 1000)}.zip`;

    try {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        setBatchActionLoading(false);
        return;
      }
      const res = await fetch('/api/drive/zip-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileIds: [folder.id],
          zipFileName: zipName,
          targetFolderId: currentFolderId === 'search' ? 'root' : currentFolderId
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        // Add zip to current folder if we are not in search
        if (currentFolderId !== 'search') {
          fetchFolderContents(currentFolderId);
        }
      } else {
        console.error('Compression failed');
      }
    } catch (err) {
      console.error('Error compressing folder:', err);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleAIAnalyzeFile = async (fileId: string) => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setAnalyzingFileIds(prev => [...prev, fileId]);
    try {
      const res = await fetch(`/api/drive/files/${fileId}/ai-analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aiSettings: { customGeminiKey, customOpenAiKey, pollinationEnabled }
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze file');
      }
      if (data.usedBackup) setAiStatus('backup');
      
      // Reload the current folder to reflect renamed files
      loadDriveData(currentFolderId);
    } catch (err: any) {
      console.error('Error analyzing file:', err);
      alert(`AI Analysis failed: ${err.message}`);
    } finally {
      setAnalyzingFileIds(prev => prev.filter(id => id !== fileId));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFolderClick = (folderId: string, name: string) => {
    const updatedBreadcrumbs = [...folderBreadcrumbs, { id: folderId, name }];
    setFolderBreadcrumbs(updatedBreadcrumbs);
    setCurrentFolderId(folderId);
  };

  const handleBreadcrumbClick = (index: number) => {
    const updatedBreadcrumbs = folderBreadcrumbs.slice(0, index + 1);
    const target = updatedBreadcrumbs[index];
    setFolderBreadcrumbs(updatedBreadcrumbs);
    setCurrentFolderId(target.id);
  };

  // RAG Ingestion trigger
  const handleRAGIngest = async (folderId: string, folderName: string) => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setShowRAGPanel(true);
    setRagIngesting(true);
    setRagActiveFolderName(folderName);
    setRagMessages([
      { sender: 'ai', text: `SYSTEM LOG: BOOTING NEURAL RAG INDEXING SUBSYSTEM...`, timestamp: new Date() },
      { sender: 'ai', text: `SYSTEM LOG: INGESTING FILES RECURSIVELY FROM FOLDER "${folderName}" (DEPTH LIMIT: 3)...`, timestamp: new Date() }
    ]);
    
    try {
      const res = await fetch('/api/drive/rag/ingest', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ folderId, folderName })
      });

      if (!res.ok) {
        throw new Error('RAG Ingestion mapping failed');
      }

      const data = await res.json();
      setRagSessionId(data.sessionId);
      setRagIngestionResult(data);
      
      setRagMessages(prev => [
        ...prev,
        { 
          sender: 'ai', 
          text: `SYSTEM LOG: SUCCESS! Map completed. Ingested ${data.filesIngestedCount} files out of ${data.totalFilesFound} total items scanned. All textual datasets have been parsed and cached inside Gemini Context Space.`, 
          timestamp: new Date() 
        },
        {
          sender: 'ai',
          text: `Ask me anything! For example: "Give me an executive summary of the readme file" or "Search for the word 'config' across all files".`,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      console.error('RAG ingest error:', err);
      setRagMessages(prev => [
        ...prev,
        { sender: 'ai', text: `SYSTEM ERROR: Ingestion abort. ${err.message}. Please verify permissions or try again.`, timestamp: new Date() }
      ]);
    } finally {
      setRagIngesting(false);
    }
  };

  const sendRAGMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!ragInput.trim() || !ragSessionId || ragLoading) return;

    const userMsg = ragInput.trim();
    setRagInput('');
    setRagLoading(true);

    setRagMessages(prev => [
      ...prev,
      { sender: 'user', text: userMsg, timestamp: new Date() }
    ]);

    try {
      const res = await fetch('/api/drive/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: ragSessionId, 
          message: userMsg,
          aiSettings: { customGeminiKey, customOpenAiKey, pollinationEnabled }
        })
      });

      if (!res.ok) {
        throw new Error('AI Engine request failed');
      }

      const data = await res.json();
      if (data.usedBackup) setAiStatus('backup');
      setRagMessages(prev => [
        ...prev,
        { sender: 'ai', text: data.responseText, timestamp: new Date() }
      ]);
    } catch (err: any) {
      console.error('RAG chat error:', err);
      setRagMessages(prev => [
        ...prev,
        { sender: 'ai', text: `SYSTEM ERROR: AI Pipeline disconnected. Check console or backend logs. (${err.message})`, timestamp: new Date() }
      ]);
    } finally {
      setRagLoading(false);
    }
  };

  const filteredFiles = explorerFiles.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectableFiles = filteredFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  const allSelected = selectableFiles.length > 0 && selectableFiles.every(f => selectedFileIds.includes(f.id));
  const someSelected = selectableFiles.length > 0 && selectableFiles.some(f => selectedFileIds.includes(f.id)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedFileIds(prev => prev.filter(id => !selectableFiles.some(f => f.id === id)));
    } else {
      const newIds = Array.from(new Set([...selectedFileIds, ...selectableFiles.map(f => f.id)]));
      setSelectedFileIds(newIds);
    }
  };

  const handleRootChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rootChatInput.trim() || isRootThinking) return;

    const userMsg = rootChatInput.trim();
    setRootChatInput('');
    setRootChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsRootThinking(true);

    try {
      const appState = {
        activeTab,
        theme,
        hasUser: !!user,
        currentFolderId,
        scrapedInfo
      };

      const res = await fetch('/api/root-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg, 
          appState,
          aiSettings: { customGeminiKey, customOpenAiKey, pollinationEnabled }
        })
      });

      if (!res.ok) throw new Error('r00t chat request failed');
      const data = await res.json();
      
      let finalReply = data.reply || "I did something but I refuse to explain it.";
      setRootChatMessages(prev => [...prev, { role: 'r00t', text: finalReply }]);

      if (data.action && data.action.type !== 'NONE') {
        const type = data.action.type;
        const payload = data.action.payload || {};
        console.log("r00t executing action:", type, payload);

        if (type === 'CHANGE_TAB') {
          if (payload.tab) setActiveTab(payload.tab);
        } else if (type === 'SET_THEME') {
          if (payload.theme) setTheme(payload.theme);
        } else if (type === 'START_DOWNLOAD' || type === 'RAG_INJECT') {
          if (payload.url) {
            setScrapeUrl(payload.url);
            setActiveTab('downloads');
            setTimeout(() => {
              handleScrapeSubmit({ preventDefault: () => {} } as FormEvent);
            }, 100);
          }
        }
      }
    } catch (err: any) {
      setRootChatMessages(prev => [...prev, { role: 'r00t', text: "Error connecting to my core processor. " + err.message }]);
    } finally {
      setIsRootThinking(false);
    }
  };

  return (
    <div className={`h-screen w-full bg-zinc-950 bg-grid text-emerald-50 font-sans selection:bg-emerald-500/30 flex flex-col overflow-hidden relative ${theme === 'elite' ? 'theme-elite' : ''}`}>
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50 opacity-15" />
      
      {/* Header Navigation */}
      <header className="h-16 bg-zinc-950/85 border-b border-emerald-500/30 px-8 flex items-center justify-between shrink-0 backdrop-blur-md relative z-10">
        <div className="flex items-center space-x-4">
          <div className="relative w-11 h-11 border border-emerald-500/50 bg-emerald-950/50 rounded flex items-center justify-center hacker-glow overflow-hidden shadow-lg">
             <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,128,0.05)_2px,rgba(0,255,128,0.05)_4px)] pointer-events-none"></div>
             <Skull className="w-6 h-6 text-emerald-400 relative z-10 drop-shadow-[0_0_8px_rgba(0,255,128,0.8)]" />
             <Coffee className="w-3 h-3 text-emerald-300 absolute bottom-1 right-1 relative z-10 drop-shadow-[0_0_5px_rgba(0,255,128,0.8)]" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-2xl tracking-widest text-emerald-400 text-glow uppercase flex items-center gap-3">
              Drive Bypass
              <button 
                onClick={() => setShowAiSettings(true)}
                className={`text-[10px] tracking-normal font-mono px-2 py-0.5 rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  aiStatus === 'backup' 
                    ? 'border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10' 
                    : 'border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'backup' ? 'bg-yellow-500' : 'bg-emerald-500'} animate-pulse`}></div>
                {aiStatus === 'backup' ? 'BACKUP (SLOW) CONNECTION' : 'AI ACTIVE'}
              </button>
            </span>
            <span className="text-[10px] text-emerald-500/70 font-mono tracking-[0.2em] -mt-0.5 flex items-center">
              "Keep that 
              <img src="https://unpkg.com/emoji-datasource-apple@15.0.1/img/apple/64/1f4a9.png" alt="poop" className="w-6 h-6 mx-1 inline-block drop-shadow-md -mt-1" />
              in the cloud.."
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setTheme(theme === 'hacker' ? 'elite' : 'hacker')}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-all cursor-pointer ${
              theme === 'elite' 
                ? 'bg-zinc-800 text-emerald-500 border-emerald-500 hover:bg-zinc-900' 
                : 'bg-emerald-950/30 text-emerald-400 border-emerald-500/50 hover:bg-emerald-950/50'
            }`}
          >
            {theme === 'elite' ? 'Switch to Hacker Theme' : 'Switch to Elite Theme'}
          </button>
          {user ? (
            <div className="flex items-center space-x-3 text-sm text-emerald-500 font-mono">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#00ff80]"></div>
              <span>Account: <strong className="text-emerald-300">{user.displayName || user.email}</strong></span>
              <button onClick={logout} className="ml-4 text-xs font-semibold text-emerald-700 hover:text-emerald-400 hover:text-glow uppercase tracking-wider transition-all">Sign Out</button>
              {user.photoURL ? (
                <img src={user.photoURL} alt="User avatar" className="h-8 w-8 rounded border border-emerald-500/50 ml-2 opacity-80" />
              ) : (
                <div className="h-8 w-8 rounded bg-emerald-950/50 border border-emerald-500/50 ml-2"></div>
              )}
            </div>
          ) : (
             <div className="flex items-center space-x-2 text-sm text-red-500 font-mono">
              <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"></div>
              <span>Not Connected</span>
             </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1600px] mx-auto w-full relative z-10">
        {/* Sidebar */}
        {showSidebar ? (
          <aside className="w-80 flex flex-col gap-6 shrink-0 relative group">
            <button 
              onClick={() => setShowSidebar(false)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 bg-zinc-900 border border-emerald-500/50 text-emerald-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-emerald-950 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,255,128,0.3)]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className={`cyber-border shadow-lg flex flex-col transition-all overflow-hidden ${showFolders ? '' : 'h-[50px] shrink-0'}`}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-emerald-500/10 cursor-pointer hover:bg-emerald-500/5 transition-colors select-none" onClick={() => setShowFolders(!showFolders)}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-500/70 m-0 border-none pb-0">{needsAuth ? 'Authentication' : 'Operations'}</h2>
                <button className="text-emerald-500 hover:text-emerald-300 transition-colors">
                  {showFolders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {showFolders && (
              <div className="p-6">
              {needsAuth ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 border border-emerald-500/30 bg-zinc-900/50 rounded flex items-center justify-center mx-auto mb-4 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors" />
                  <DownloadCloud className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400 mb-2">Sign In Required</h2>
                <p className="text-xs text-emerald-600/70 mb-6 leading-relaxed font-mono">
                  Connect your Google Drive to start saving files directly and use RAG Analysis.
                </p>
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-emerald-950/30 border border-emerald-500/50 hover:bg-emerald-500/20 hover:border-emerald-400 text-emerald-400 rounded font-mono text-xs tracking-widest shadow-sm transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : (
                    <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block filter grayscale contrast-200 sepia hue-rotate-[130deg] saturate-200">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                  )}
                  <span className="text-glow">Connect Google Drive</span>
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-500/70 mb-3 border-b border-emerald-500/20 pb-2">New Operation</h2>
                
                {/* Segmented Mode Selector */}
                <div className="flex border border-emerald-500/20 rounded p-0.5 bg-zinc-950/80 mb-4 select-none shrink-0 font-mono text-[9px] tracking-widest uppercase">
                  <button 
                    type="button"
                    onClick={() => setSidebarMode('download')}
                    className={`flex-1 py-1 rounded transition-all text-center ${
                      sidebarMode === 'download' 
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 shadow-[inset_0_0_8px_rgba(0,255,128,0.1)]' 
                        : 'text-emerald-700 hover:text-emerald-500'
                    }`}
                  >
                    Direct DL
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSidebarMode('scrape')}
                    className={`flex-1 py-1 rounded transition-all text-center ${
                      sidebarMode === 'scrape' 
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 shadow-[inset_0_0_8px_rgba(0,255,128,0.1)]' 
                        : 'text-emerald-700 hover:text-emerald-500'
                    }`}
                  >
                    Scrape Intel
                  </button>
                </div>

                {sidebarMode === 'download' ? (
                  <form onSubmit={startTask} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="url" className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">File Link (URL)</label>
                      <input
                        id="url"
                        type="text"
                        required
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="http://example.onion/file.zip or https://server/data.pkg"
                        className="w-full px-3 py-2 bg-zinc-950/80 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 placeholder-emerald-900/40 shadow-[inset_0_0_10px_rgba(0,255,128,0.05)] transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="filename" className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">Save As (Optional)</label>
                      <input
                        id="filename"
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="<AUTO_DETECT>"
                        className="w-full px-3 py-2 bg-zinc-950/80 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 placeholder-emerald-900/40 shadow-[inset_0_0_10px_rgba(0,255,128,0.05)] transition-all"
                      />
                    </div>
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting || !url.trim()}
                        className="w-full py-2.5 bg-emerald-500/10 border border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400 text-emerald-400 rounded font-mono text-xs tracking-widest uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed flex justify-center items-center gap-2 group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        <span className="group-hover:text-glow">Start Download</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleScrapeSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="scrapeUrl" className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">Target Webpage Link</label>
                      <input
                        id="scrapeUrl"
                        type="url"
                        required
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                        placeholder="https://news.ycombinator.com"
                        className="w-full px-3 py-2 bg-zinc-950/80 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 placeholder-emerald-900/40 shadow-[inset_0_0_10px_rgba(0,255,128,0.05)] transition-all"
                      />
                    </div>
                    {scrapeError && (
                      <div className="text-[9px] font-mono text-red-400 bg-red-950/25 border border-red-500/30 p-2 rounded leading-normal">
                        &gt; ERROR: {scrapeError}
                      </div>
                    )}
                    {ragSessionId && (
                      <div className="text-[8px] font-mono text-cyan-400 bg-cyan-950/20 border border-cyan-500/20 p-2 rounded leading-relaxed">
                        &gt; HOT-INJECT READY: Ingested document will automatically load into the active RAG vector.
                      </div>
                    )}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={scrapeLoading || !scrapeUrl.trim()}
                        className="w-full py-2.5 bg-emerald-500/10 border border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400 text-emerald-400 rounded font-mono text-xs tracking-widest uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed flex justify-center items-center gap-2 group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                        {scrapeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span className="group-hover:text-glow">{scrapeLoading ? 'Scraping...' : 'Scrape & AI Tag'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            </div>
            )}
          </div>

          <div className={`cyber-border shadow-lg flex flex-col ${showSysStatus ? 'flex-1' : 'shrink-0'}`}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-emerald-500/10 cursor-pointer hover:bg-emerald-500/5 transition-colors select-none" onClick={() => setShowSysStatus(!showSysStatus)}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-500/70 m-0 border-none pb-0">System Status</h2>
              <button className="text-emerald-500 hover:text-emerald-300 transition-colors">
                {showSysStatus ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {showSysStatus && (
            <div className="p-6 space-y-4">
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold font-mono text-emerald-400 text-glow">Ready</div>
              </div>
              <p className="text-xs text-emerald-600/50 font-mono leading-relaxed mt-2">
                &gt; Cloud-to-cloud transfer ready.<br/>
                &gt; Saves your local data plan.<br/>
                &gt; RAG Ingest status: <span className="text-emerald-400 font-bold">{ragSessionId ? "ACTIVE MAP" : "IDLE"}</span>
              </p>
              {ragActiveFolderName && (
                <div className="text-[10px] text-emerald-400/80 font-mono border-t border-emerald-500/20 pt-2">
                  &gt; Map Folder: {ragActiveFolderName}
                </div>
              )}
            </div>
            )}
          </div>
        </aside>
        ) : (
          <div className="flex flex-col justify-center shrink-0 w-6 relative border-r border-emerald-500/20 bg-zinc-950/40">
            <button 
              onClick={() => setShowSidebar(true)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 bg-zinc-900 border border-emerald-500/50 text-emerald-500 rounded-full p-0.5 hover:bg-emerald-950 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,255,128,0.3)]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content Area: Tabbed layout */}
        <section className="flex-1 flex flex-col cyber-border shadow-lg overflow-hidden min-w-0 bg-zinc-950/60 backdrop-blur-md">
          {/* Custom Terminal Tabs */}
          <div className="flex border-b border-emerald-500/30 bg-emerald-950/10 select-none">
            <button 
              onClick={() => setActiveTab('downloads')}
              className={`flex-1 sm:flex-initial px-6 py-3.5 font-mono text-xs tracking-widest uppercase border-r border-emerald-500/30 transition-all ${
                activeTab === 'downloads' 
                  ? 'bg-emerald-500/10 text-emerald-400 font-bold border-b-2 border-b-emerald-400 shadow-[inset_0_-2px_10px_rgba(0,255,128,0.1)]' 
                  : 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/25'
              }`}
            >
              Active Downloads
            </button>
            <button 
              onClick={() => {
                setActiveTab('explorer');
              }}
              className={`flex-1 sm:flex-initial px-6 py-3.5 font-mono text-xs tracking-widest uppercase border-r border-emerald-500/30 transition-all ${
                activeTab === 'explorer' 
                  ? 'bg-emerald-500/10 text-emerald-400 font-bold border-b-2 border-b-emerald-400 shadow-[inset_0_-2px_10px_rgba(0,255,128,0.1)]' 
                  : 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/25'
              }`}
            >
              Drive Explorer & RAG Intel
            </button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            {activeTab === 'downloads' ? (
              /* TAB 1: ACTIVE DOWNLOADS */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-500/30 flex items-center justify-between bg-emerald-950/20 shrink-0">
                  <h2 className="font-bold text-emerald-400 tracking-widest uppercase text-sm">Active Downloads</h2>
                  <div className="flex space-x-3">
                    <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-mono tracking-widest">
                      Transfers: {tasks.filter(t => t.status === 'downloading' || t.status === 'uploading' || t.status === 'pending').length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-emerald-600/40 p-8 text-center space-y-4 font-mono text-xs">
                      <FileIcon className="w-12 h-12 opacity-50" />
                      <p>Waiting for a new download<span className="animate-pulse">...</span></p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {tasks.map(task => (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="p-6 border-b border-emerald-500/20 relative group hover:bg-emerald-950/20 transition-colors"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/0 group-hover:bg-emerald-500/50 transition-colors" />
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center min-w-0 flex-1 pr-4">
                              <div className={`w-10 h-10 border rounded flex items-center justify-center mr-4 shrink-0 ${
                                task.status === 'done' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 
                                task.status === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-500' : 
                                'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                              }`}>
                                {task.status === 'done' ? (
                                  <CheckCircle2 className="w-5 h-5" />
                                ) : task.status === 'error' ? (
                                  <AlertCircle className="w-5 h-5" />
                                ) : task.status === 'analyzing' ? (
                                  <Sparkles className="w-5 h-5 animate-pulse text-purple-400" />
                                ) : (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-semibold text-emerald-100 truncate tracking-wide" title={task.filename}>{task.filename}</h3>
                                <p className="text-[10px] text-emerald-600/70 truncate font-mono mt-1" title={task.url}>&gt; Link: {task.url}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {task.status !== 'pending' && task.status !== 'error' && (
                                <>
                                  <div className="text-sm font-bold text-emerald-300 font-mono">{task.progress}%</div>
                                  {task.total > 0 && (
                                    <div className="text-[10px] text-emerald-600/60 font-mono tracking-widest mt-1">
                                      {formatBytes(task.bytes)} / {formatBytes(task.total)}
                                    </div>
                                  )}
                                </>
                              )}
                              {task.status === 'pending' && (
                                <div className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest font-mono animate-pulse">Starting...</div>
                              )}
                              {task.status === 'error' && (
                                <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest font-mono">Failed</div>
                              )}
                            </div>
                          </div>

                          <div className="w-full h-[3px] bg-zinc-900 rounded-full mb-4 overflow-hidden relative">
                            <div 
                              className={`h-full relative transition-all duration-300 ease-out ${
                                task.status === 'done' ? 'bg-emerald-500 shadow-[0_0_10px_#00ff80]' :
                                task.status === 'error' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' :
                                task.status === 'analyzing' ? 'bg-purple-500 shadow-[0_0_10px_#a855f7]' :
                                'bg-cyan-400 shadow-[0_0_10px_#22d3ee]'
                              }`}
                              style={{ width: `${task.progress}%` }}
                            >
                              {task.status !== 'done' && task.status !== 'error' && (
                                <div className="absolute top-0 right-0 bottom-0 w-8 bg-white/50 blur-[2px] animate-pulse" />
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between text-[10px] font-mono tracking-widest">
                            <div className="flex space-x-4">
                              {task.status === 'downloading' && (
                                <span className="text-cyan-400 flex items-center">
                                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-2 animate-pulse shadow-[0_0_5px_#22d3ee]"></div> Downloading
                                </span>
                              )}
                              {task.status === 'uploading' && (
                                <span className="text-cyan-400 flex items-center">
                                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-2 animate-[pulse_0.5s_infinite] shadow-[0_0_5px_#22d3ee]"></div> Saving to Drive
                                </span>
                              )}
                              {task.status === 'analyzing' && (
                                <span className="text-purple-400 flex items-center">
                                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 animate-ping shadow-[0_0_5px_#a855f7]"></div> AI Analyzing Content
                                </span>
                              )}
                              {task.status === 'done' && (
                                <span className="text-emerald-400 flex items-center">
                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_5px_#00ff80]"></div> Complete
                                </span>
                              )}
                              {task.status === 'error' && (
                                <span className="text-red-400 truncate max-w-[200px]" title={task.error}>
                                  Error: {task.error}
                                </span>
                              )}
                            </div>
                            <div className="space-x-3">
                              {(task.status === 'done' || task.status === 'error') && (
                                <button onClick={() => removeTask(task.id)} className="text-emerald-600/50 hover:text-red-400 uppercase tracking-widest transition-colors">Clear</button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            ) : (
              /* TAB 2: DRIVE EXPLORER & RAG */
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {needsAuth ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 font-mono">
                    <Skull className="w-12 h-12 text-red-500 animate-bounce" />
                    <h3 className="text-emerald-400 uppercase tracking-wider font-bold">Secure Connection Lost</h3>
                    <p className="text-xs text-emerald-600 max-w-sm">Please sign in via the Google Drive button in the left sidebar to activate the secure directory inspector.</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Bento Statistics Widgets */}
                    <div className="border-b border-emerald-500/20 shrink-0 bg-zinc-950/20 flex flex-col">
                      <div className="flex justify-between items-center px-6 py-2 border-b border-emerald-500/10 cursor-pointer hover:bg-emerald-500/5 transition-colors select-none" onClick={() => setShowBento(!showBento)}>
                         <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest font-bold">System Statistics</span>
                         <button className="text-emerald-500 hover:text-emerald-300 transition-colors">
                           {showBento ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                         </button>
                      </div>
                      {showBento && (
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* Storage Quota Widget */}
                      <div className="cyber-border-thin bg-zinc-900/40 p-4 flex flex-col justify-between relative overflow-hidden shadow-md">
                        <div className="absolute top-1 right-2"><HardDrive className="w-4 h-4 text-emerald-600/60" /></div>
                        <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">DRIVE CAPACITY</span>
                        {driveStats ? (
                          <div className="mt-2">
                            <div className="text-lg font-bold font-mono text-emerald-300 text-glow">
                              {formatBytes(driveStats.free)} <span className="text-xs text-emerald-600 font-normal">FREE</span>
                            </div>
                            <div className="w-full bg-zinc-950 h-1.5 rounded-full mt-2 overflow-hidden border border-emerald-500/20">
                              <div 
                                className="h-full bg-emerald-500 shadow-[0_0_5px_#00ff80]" 
                                style={{ width: `${Math.round((driveStats.usage / driveStats.limit) * 100)}%` }}
                              />
                            </div>
                            <div className="text-[8px] font-mono text-emerald-600/80 mt-1 text-right uppercase">
                              {formatBytes(driveStats.usage)} / {formatBytes(driveStats.limit)} USED
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs font-mono text-emerald-600/60 animate-pulse mt-2">&gt; Loading data...</div>
                        )}
                      </div>

                      {/* Total Files Widget */}
                      <div className="cyber-border-thin bg-zinc-900/40 p-4 flex flex-col justify-between relative overflow-hidden shadow-md">
                        <div className="absolute top-1 right-2"><Database className="w-4 h-4 text-emerald-600/60" /></div>
                        <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">FILE ARCHIVE</span>
                        {driveStats ? (
                          <div className="mt-2 flex items-baseline justify-between">
                            <div className="text-2xl font-black font-mono text-emerald-300 text-glow">
                              {driveStats.totalFiles}
                            </div>
                            <span className="text-[9px] font-mono text-emerald-500/80 uppercase">Root Items mapped</span>
                          </div>
                        ) : (
                          <div className="text-xs font-mono text-emerald-600/60 animate-pulse mt-2">&gt; Mapping indexes...</div>
                        )}
                      </div>

                      {/* Security Matrix / Session Status */}
                      <div className="cyber-border-thin bg-zinc-900/40 p-4 flex flex-col justify-between relative overflow-hidden shadow-md">
                        <div className="absolute top-1 right-2"><Cpu className="w-4 h-4 text-emerald-600/60" /></div>
                        <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">AI RAG BUFFER</span>
                        <div className="mt-2 flex items-baseline justify-between">
                          <div className="text-xs font-bold font-mono text-emerald-300 uppercase">
                            {ragSessionId ? "RAG Synced" : "Idle"}
                          </div>
                          <span className="text-[9px] font-mono text-emerald-500/80 uppercase">
                            {ragSessionId ? "Context Committed" : "Select folder to map"}
                          </span>
                        </div>
                        {ragSessionId && (
                          <button 
                            onClick={() => setShowRAGPanel(true)} 
                            className="text-[9px] font-mono text-emerald-400 hover:text-glow border-t border-emerald-500/10 pt-1.5 mt-1 text-left uppercase flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3 animate-pulse" /> &gt; RESUME AI CONVERSATION
                          </button>
                        )}
                      </div>
                      </div>
                    )}
                    </div>

                    {/* Directory Navigation & Actions */}
                    <div className="px-6 py-4 border-b border-emerald-500/20 bg-zinc-900/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                      {/* Left: Breadcrumbs and Search bar */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                        {/* Breadcrumbs */}
                        <div className="flex items-center space-x-1.5 font-mono text-xs overflow-x-auto shrink-0 w-full sm:w-auto">
                          <span className="text-emerald-600 select-none">&gt;</span>
                          {folderBreadcrumbs.map((crumb, index) => (
                            <div key={crumb.id} className="flex items-center space-x-1">
                              {index > 0 && <ChevronRight className="w-3 h-3 text-emerald-700 shrink-0" />}
                              <button 
                                onClick={() => handleBreadcrumbClick(index)}
                                className="text-emerald-400 hover:text-emerald-200 hover:text-glow font-bold uppercase tracking-wide shrink-0 cursor-pointer"
                              >
                                {crumb.name}
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Search Bar */}
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 text-emerald-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input 
                            type="text"
                            placeholder="SEARCH CURRENT DIRECTORY..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950/85 border border-emerald-500/20 rounded pl-8 pr-3 py-1.5 text-xs text-emerald-300 placeholder-emerald-600/40 font-mono focus:outline-none focus:border-emerald-400/50 focus:shadow-[0_0_10px_rgba(0,255,128,0.15)] transition-all uppercase"
                          />
                          {searchQuery && (
                            <button 
                              onClick={() => setSearchQuery('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-400 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Top level folder Actions */}
                      <div className="flex items-center space-x-3 shrink-0 w-full md:w-auto justify-end">
                        <button 
                          onClick={() => loadDriveData(currentFolderId)} 
                          className="p-2 border border-emerald-500/30 hover:border-emerald-400 text-emerald-400 hover:text-glow rounded transition-all bg-emerald-950/20 cursor-pointer"
                          title="Refresh Files"
                        >
                          <RefreshCw className={`w-4 h-4 ${explorerLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                          onClick={() => handleRAGIngest(currentFolderId, folderName)}
                          disabled={explorerLoading || ragIngesting}
                          className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400 text-emerald-400 rounded font-mono text-xs tracking-widest uppercase transition-all flex items-center gap-2 cursor-pointer"
                        >
                          {ragIngesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          <span>RAG Ingest Folder</span>
                        </button>
                      </div>
                    </div>

                    {/* Folder Browser & Telemetry Dual Panel */}
                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 relative">
                      {/* Left Side: Folder Browser File Table */}
                      <div className="flex-1 overflow-y-auto min-h-0 relative">
                        {explorerLoading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center font-mono space-y-4 bg-zinc-950/50">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-400 shadow-glow" />
                            <p className="text-xs text-emerald-500 tracking-wider">Loading folder contents...</p>
                          </div>
                        ) : (
                          <div className="p-6">
                            {/* Batch Operations Panel */}
                            {selectedFileIds.length > 0 && (
                              <div className="mb-4 p-4 border border-emerald-500/40 bg-zinc-950/90 rounded shadow-[0_0_20px_rgba(0,255,128,0.08)] flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center gap-3">
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                                  <span className="text-xs text-emerald-300 font-mono uppercase font-bold">
                                    Batch Selection Identified: <span className="text-emerald-100 underline text-sm">{selectedFileIds.length}</span>
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                                  <button
                                    onClick={() => setSelectedFileIds([])}
                                    className="px-3 py-1.5 border border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 text-[10px] text-emerald-500 rounded font-bold uppercase transition-all cursor-pointer"
                                  >
                                    Reset Selection
                                  </button>
                                  <button
                                    onClick={handleBatchAITag}
                                    disabled={batchActionLoading}
                                    className="px-4 py-1.5 bg-indigo-500/15 border border-indigo-500/50 hover:bg-indigo-500/30 hover:border-indigo-400 text-indigo-400 hover:text-glow text-[10px] rounded font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  >
                                    {batchActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    Batch AI Tag
                                  </button>
                                  <button
                                    onClick={handleBatchRAGIngest}
                                    disabled={batchActionLoading}
                                    className="px-4 py-1.5 bg-emerald-500/15 border border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400 text-emerald-400 hover:text-glow text-[10px] rounded font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  >
                                    {batchActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    Bulk RAG Ingest
                                  </button>
                                  <button
                                    onClick={() => {
                                      setZipFileNameInput(`archive_${Math.floor(Math.random() * 9000 + 1000)}.zip`);
                                      setShowZipDialog(true);
                                    }}
                                    disabled={batchActionLoading}
                                    className="px-4 py-1.5 bg-cyan-500/15 border border-cyan-500/50 hover:bg-cyan-500/30 hover:border-cyan-400 text-cyan-400 hover:text-glow text-[10px] rounded font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  >
                                    {batchActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                                    Compress to .ZIP
                                  </button>
                                </div>
                              </div>
                            )}

                            {filteredFiles.length === 0 ? (
                              <div className="text-center py-16 text-emerald-600/40 font-mono text-xs space-y-2">
                                <p>&gt; Empty directory or no files matched.</p>
                              </div>
                            ) : (
                              <div className="w-full overflow-x-auto border border-emerald-500/20 rounded">
                                <table className="w-full text-left font-mono text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-emerald-500/20 bg-emerald-950/20 text-emerald-400 select-none">
                                      <th className="p-3 w-10 text-center select-none">
                                        <input 
                                          type="checkbox"
                                          checked={allSelected}
                                          ref={(el) => {
                                            if (el) el.indeterminate = someSelected;
                                          }}
                                          onChange={handleSelectAll}
                                          className="rounded border-emerald-500/30 text-emerald-500 bg-zinc-950 focus:ring-emerald-500/50 cursor-pointer"
                                        />
                                      </th>
                                      <th className="p-3 uppercase tracking-wider font-bold">
                                        Name {selectedFileIds.length > 0 && (
                                          <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                                            {selectedFileIds.length} selected
                                          </span>
                                        )}
                                      </th>
                                      <th className="p-3 uppercase tracking-wider font-bold">Mime Type</th>
                                      <th className="p-3 uppercase tracking-wider font-bold text-right">Size</th>
                                      <th className="p-3 uppercase tracking-wider font-bold text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredFiles.map((file, index) => {
                                      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                                      return (
                                        <motion.tr 
                                          initial={{ opacity: 0, y: 15 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5), ease: "easeOut" }}
                                          key={file.id} 
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({ fileId: file.id, parentId: file.parents?.[0] || currentFolderId }));
                                            e.dataTransfer.effectAllowed = 'move';
                                          }}
                                          onDragOver={(e) => {
                                            if (isFolder) {
                                              e.preventDefault();
                                              e.dataTransfer.dropEffect = 'move';
                                              e.currentTarget.classList.add('bg-emerald-900/30');
                                            }
                                          }}
                                          onDragLeave={(e) => {
                                            if (isFolder) {
                                              e.currentTarget.classList.remove('bg-emerald-900/30');
                                            }
                                          }}
                                          onDrop={(e) => {
                                            if (isFolder) {
                                              e.preventDefault();
                                              e.currentTarget.classList.remove('bg-emerald-900/30');
                                              try {
                                                const dataStr = e.dataTransfer.getData('application/json');
                                                if (dataStr) {
                                                  const data = JSON.parse(dataStr);
                                                  if (data.fileId !== file.id) {
                                                    handleDropMove(data.fileId, data.parentId, file.id);
                                                  }
                                                }
                                              } catch (err) {
                                                console.error('Drop error', err);
                                              }
                                            }
                                          }}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenu({
                                              visible: true,
                                              x: e.clientX,
                                              y: e.clientY,
                                              file
                                            });
                                          }}
                                          className="border-b border-emerald-500/10 hover:bg-emerald-950/15 transition-colors text-emerald-100 align-middle"
                                        >
                                          <td className="p-3 text-center w-10">
                                            {!isFolder ? (
                                              <input 
                                                type="checkbox"
                                                checked={selectedFileIds.includes(file.id)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedFileIds(prev => [...prev, file.id]);
                                                  } else {
                                                    setSelectedFileIds(prev => prev.filter(id => id !== file.id));
                                                  }
                                                }}
                                                className="rounded border-emerald-500/30 text-emerald-500 bg-zinc-950 focus:ring-emerald-500/50 cursor-pointer"
                                              />
                                            ) : (
                                              <span className="text-[10px] text-emerald-800 select-none">-</span>
                                            )}
                                          </td>
                                          <td className="p-3 font-semibold flex items-center space-x-3 truncate max-w-sm">
                                            {isFolder ? (
                                              <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
                                            ) : (
                                              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                                            )}
                                            {isFolder ? (
                                              <button 
                                                onClick={() => handleFolderClick(file.id, file.name)}
                                                className="hover:text-emerald-400 hover:underline text-left font-bold cursor-pointer"
                                              >
                                                {file.name}
                                              </button>
                                            ) : (
                                              <button 
                                                onClick={() => handleFilePreviewClick(file.id)}
                                                className="hover:text-emerald-400 hover:underline text-left font-semibold cursor-pointer"
                                                title="Click to Quick-Look Preview File"
                                              >
                                                {file.name}
                                              </button>
                                            )}
                                          </td>
                                          <td className="p-3 text-emerald-600 truncate max-w-xs">{file.mimeType.replace('application/', '').replace('vnd.google-apps.', 'workspace/')}</td>
                                          <td className="p-3 text-right text-emerald-500">
                                            {file.size ? formatBytes(Number(file.size)) : isFolder ? 'DIR' : 'N/A'}
                                          </td>
                                          <td className="p-3 text-right">
                                            {isFolder ? (
                                              <button 
                                                onClick={() => handleRAGIngest(file.id, file.name)}
                                                className="px-2 py-0.5 border border-emerald-500/20 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10 text-[10px] rounded cursor-pointer"
                                              >
                                                AI RAG
                                              </button>
                                            ) : (
                                              <div className="flex items-center justify-end space-x-2">
                                                <button 
                                                  onClick={() => handleAIAnalyzeFile(file.id)}
                                                  disabled={analyzingFileIds.includes(file.id)}
                                                  className="px-2 py-0.5 border border-purple-500/20 text-purple-400 hover:border-purple-400 hover:bg-purple-500/10 text-[10px] rounded cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                                                  title="Auto-tag & Rename using Gemini AI"
                                                >
                                                  {analyzingFileIds.includes(file.id) ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                  ) : (
                                                    <Sparkles className="w-3 h-3" />
                                                  )}
                                                  <span>AI Analyze</span>
                                                </button>
                                                <button 
                                                  onClick={() => handleFileInfoClick(file)}
                                                  className="px-2 py-0.5 border border-emerald-500/20 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10 text-[10px] rounded cursor-pointer"
                                                >
                                                  Info
                                                </button>
                                                <button 
                                                  onClick={() => handleRenameMoveClick(file)}
                                                  className="px-2 py-0.5 border border-cyan-500/20 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-500/10 text-[10px] rounded cursor-pointer flex items-center gap-1"
                                                >
                                                  <Pencil className="w-3 h-3" />
                                                  <span>Move/Rename</span>
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        </motion.tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Side: Telemetry Metrics Visualizer */}
                      {showTelemetry ? (
                        <div className="w-full lg:w-[320px] shrink-0 overflow-hidden border-t lg:border-t-0 lg:border-l border-emerald-500/20 bg-zinc-950/40 p-6 flex flex-col items-center relative group">
                          <button 
                            onClick={() => setShowTelemetry(false)}
                            className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 bg-zinc-900 border border-emerald-500/50 text-emerald-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-emerald-950 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,255,128,0.3)] hidden lg:block"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <h3 className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest border-b border-emerald-500/20 pb-2 mb-4 w-full text-center font-bold shrink-0">DRIVE TELEMETRY GAUGE</h3>
                          {driveStats ? (
                            <div className="flex-1 w-full min-h-0 flex items-center justify-center">
                              <StorageVisualizer 
                                limit={driveStats.limit} 
                                usage={driveStats.usage} 
                                free={driveStats.free} 
                                totalFiles={driveStats.totalFiles} 
                              />
                            </div>
                          ) : (
                            <div className="h-48 flex items-center justify-center font-mono text-xs text-emerald-600/40 italic shrink-0">
                              Telemetry Stream Offline
                            </div>
                          )}

                          {/* Scraped Intel Box */}
                          {scrapedInfo && (
                            <div className="w-full border border-emerald-500/30 bg-emerald-950/15 rounded font-mono text-[10px] text-emerald-300 mt-4 shrink-0 overflow-y-auto">
                              <div className="text-emerald-400 font-bold uppercase tracking-wider border-b border-emerald-500/20 px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-emerald-500/10 select-none" onClick={() => setShowIntel(!showIntel)}>
                                <span className="flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" /> TARGET PAGE ANALYZED
                                </span>
                                <button className="text-emerald-500 hover:text-emerald-300">
                                  {showIntel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                              {showIntel && (
                                <div className="p-4 space-y-2 border-t border-emerald-500/10">
                                  <div><strong className="text-emerald-500">TITLE:</strong> {scrapedInfo.title}</div>
                                  <div><strong className="text-emerald-500">CATEGORY:</strong> {scrapedInfo.category}</div>
                                  <div className="italic text-emerald-500/80 mt-1 leading-normal"><strong className="text-emerald-500">SUMMARY:</strong> {scrapedInfo.summary}</div>
                                  {scrapedInfo.ragHotInjected && (
                                    <div className="text-[8px] bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 px-1.5 py-1 rounded text-center font-bold uppercase tracking-wider mt-1 animate-pulse">
                                      INJECTED DIRECTLY TO RAG SESSION
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col justify-center shrink-0 w-6 relative border-l border-emerald-500/20 bg-zinc-950/40 hidden lg:flex">
                          <button 
                            onClick={() => setShowTelemetry(true)}
                            className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 bg-zinc-900 border border-emerald-500/50 text-emerald-500 rounded-full p-0.5 hover:bg-emerald-950 transition-all cursor-pointer shadow-[0_0_10px_rgba(0,255,128,0.3)]"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sliding Cybersecurity Tactical Terminal for RAG Chat */}
          <AnimatePresence>
            {showRAGPanel && (
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.35 }}
                className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-zinc-950 border-l border-emerald-500/40 shadow-2xl z-40 flex flex-col overflow-hidden"
              >
                {/* Header of RAG Matrix */}
                <div className="px-6 py-4 border-b border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-5 h-5 text-emerald-400 shadow-glow" />
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-300">AI Chat Assistant</h3>
                      <p className="text-[8px] font-mono text-emerald-500/70 tracking-widest uppercase mt-0.5">Folder RAG Module: ON</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowRAGPanel(false)}
                    className="p-1 border border-emerald-500/30 text-emerald-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Session Ingestion Result Header details */}
                {ragIngestionResult && (
                  <div className="p-4 bg-zinc-900/50 border-b border-emerald-500/10 font-mono text-[9px] text-emerald-600 shrink-0 leading-relaxed space-y-1">
                    <div>&gt; ACTIVE REPOSITORY: "{ragActiveFolderName}"</div>
                    <div>&gt; Chunks Compiled: {ragIngestionResult.filesIngestedCount} datasets ingested | {ragIngestionResult.totalFilesFound} mapped</div>
                    <div>&gt; Pipeline Engine: Gemini 3.5 Flash | Large Context Engine</div>
                  </div>
                )}

                {/* Message Log */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-950/80 font-mono text-xs">
                  {ragMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-emerald-600/40 space-y-3">
                      <Terminal className="w-10 h-10 animate-pulse text-emerald-500/20" />
                      <p>&gt; Connection idle.</p>
                      <p className="text-[10px]">Select a folder and click "RAG Ingest" to begin analysis.</p>
                    </div>
                  ) : (
                    ragMessages.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`p-3 rounded border text-left leading-relaxed ${
                          msg.sender === 'user' 
                            ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200 ml-8' 
                            : 'bg-zinc-900/50 border-emerald-500/10 text-emerald-400 mr-8 font-mono'
                        }`}
                      >
                        <div className="text-[8px] text-emerald-600 uppercase tracking-widest mb-1.5 select-none">
                          {msg.sender === 'user' ? 'User' : 'AI'}
                        </div>
                        <div 
                          className="markdown-body space-y-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-emerald-300 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-emerald-300 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-emerald-300 [&_code]:bg-emerald-950/40 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-400 [&_pre]:bg-zinc-950/80 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-cyan-400 [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}
                        />
                      </div>
                    ))
                  )}
                  {ragLoading && (
                    <div className="flex items-center space-x-2 text-emerald-500 text-xs italic font-mono p-3 bg-zinc-900/30 border border-emerald-500/10 mr-8">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Transmitting queries through hyper-dimensional RAG vector...</span>
                    </div>
                  )}
                </div>

                {/* Chat input box */}
                <form onSubmit={sendRAGMessage} className="p-4 border-t border-emerald-500/30 bg-zinc-950 shrink-0">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={ragInput}
                      onChange={(e) => setRagInput(e.target.value)}
                      disabled={!ragSessionId || ragLoading}
                      placeholder={ragSessionId ? "Ask a question about this folder..." : "RAG inactive. Select a folder to ingest..."}
                      className="flex-1 px-3 py-2 bg-zinc-950 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 placeholder-emerald-900/50 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!ragInput.trim() || !ragSessionId || ragLoading}
                      className="p-2 border border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/20 text-emerald-400 hover:text-glow rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-3 bg-emerald-950/20 border-t border-emerald-500/30 flex items-center justify-between shrink-0">
            <p className="text-[10px] text-emerald-600/60 uppercase tracking-[0.2em] font-mono">
              Network: <span className="text-emerald-400 text-glow">Secure</span>
            </p>
            <div className="flex space-x-1.5">
              <div className="w-1.5 h-2 bg-emerald-500/40 rounded-sm"></div>
              <div className="w-1.5 h-4 bg-emerald-500/60 rounded-sm animate-pulse"></div>
              <div className="w-1.5 h-3 bg-emerald-500/50 rounded-sm"></div>
              <div className="w-1.5 h-5 bg-emerald-400 rounded-sm animate-[pulse_0.8s_infinite] shadow-[0_0_5px_#00ff80]"></div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="py-3 bg-zinc-950 border-t border-emerald-500/20 px-8 flex flex-col sm:flex-row items-center justify-between text-[9px] text-emerald-600/50 shrink-0 uppercase tracking-[0.2em] font-mono relative z-10 gap-3">
        <div className="text-center sm:text-left leading-relaxed">
          <span className="text-emerald-400 font-bold">Blacklisted Binary Labs</span> | App Development<br/>
          <span className="text-emerald-600/60">Lead Dev: Rob Branting (blacklistedrob@gmail.com)</span>
        </div>
        <div className="flex space-x-8 items-center">
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#00ff80]"></div> <span>Drive Connected</span></div>
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#00ff80]"></div> <span>Connection Secure</span></div>
        </div>
      </footer>

      {/* Batch ZIP filename selection dialog */}
      <AnimatePresence>
        {showZipDialog && (
          <div 
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            id="zip-dialog-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="w-full max-w-md bg-zinc-900 border border-cyan-500/30 rounded shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col font-mono text-cyan-100 animate-in fade-in duration-200"
              id="zip-dialog-content"
            >
              {/* Dialog Header */}
              <div className="p-4 border-b border-cyan-500/30 bg-zinc-950 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileArchive className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">ARCHIVE COMPRESSION INIT</span>
                </div>
                <button 
                  onClick={() => setShowZipDialog(false)}
                  className="p-1 border border-cyan-500/20 text-cyan-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dialog Body */}
              <form onSubmit={handleBatchZipCompress} className="p-6 space-y-6">
                <div className="space-y-2">
                  <p className="text-xs text-cyan-300/80 leading-relaxed">
                    You have selected <strong className="text-cyan-100 underline">{selectedFileIds.length}</strong> items for bulk archive serialization. Provide an archive identity label:
                  </p>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="e.g. documents_archive"
                      value={zipFileNameInput}
                      onChange={(e) => setZipFileNameInput(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-cyan-500/30 rounded px-3 py-2 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400/50 focus:shadow-[0_0_10px_rgba(6,182,212,0.1)] transition-all uppercase"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-cyan-600">.ZIP</span>
                  </div>
                </div>

                {/* Dialog Footer Actions */}
                <div className="flex gap-3 pt-4 border-t border-cyan-500/20">
                  <button
                    type="button"
                    onClick={() => setShowZipDialog(false)}
                    className="flex-1 py-2 border border-cyan-500/30 hover:border-cyan-400 text-cyan-500 hover:text-cyan-400 rounded text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={batchActionLoading || !zipFileNameInput.trim()}
                    className="flex-1 py-2 bg-cyan-500/10 border border-cyan-500/50 hover:bg-cyan-500/30 hover:border-cyan-400 text-cyan-400 font-bold rounded text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {batchActionLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>COMPRESSING...</span>
                      </>
                    ) : (
                      <>
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>SERIALIZE BINARY</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Move/Rename Modal */}
      <AnimatePresence>
        {renameFile && (
          <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="w-full max-w-lg bg-zinc-900 border border-cyan-500/30 rounded shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden font-mono text-cyan-100"
            >
              <div className="p-4 border-b border-cyan-500/30 bg-zinc-950 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">MOVE / RENAME FILE</span>
                </div>
                <button 
                  onClick={() => setRenameFile(null)}
                  className="p-1 border border-cyan-500/20 text-cyan-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={submitRenameMove} className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">File Name</label>
                    <input 
                      type="text"
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-cyan-500/30 rounded px-3 py-2 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400/50 focus:shadow-[0_0_10px_rgba(6,182,212,0.1)] transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Location (Folder)</label>
                    <select
                      value={moveFolderId}
                      onChange={(e) => setMoveFolderId(e.target.value)}
                      className="w-full bg-zinc-950 border border-cyan-500/30 rounded px-3 py-2 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400/50 transition-all appearance-none cursor-pointer"
                    >
                      {allFolders.map(folder => (
                        <option key={folder.id} value={folder.id}>
                          {folder.id === 'root' ? '/ My Drive' : `/ ${folder.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-cyan-500/20">
                  <button
                    type="button"
                    onClick={() => setRenameFile(null)}
                    className="flex-1 py-2 border border-cyan-500/30 hover:border-cyan-400 text-cyan-500 hover:text-cyan-400 rounded text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={renameMoveLoading || !renameInput.trim()}
                    className="flex-1 py-2 bg-cyan-500/10 border border-cyan-500/50 hover:bg-cyan-500/30 hover:border-cyan-400 text-cyan-400 font-bold rounded text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {renameMoveLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>APPLYING...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>APPLY CHANGES</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFileId && (
          <div 
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            id="quick-look-modal-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="w-full max-w-4xl bg-zinc-900 border border-emerald-500/30 rounded shadow-[0_0_50px_rgba(0,255,128,0.15)] overflow-hidden flex flex-col max-h-[90vh] font-mono text-emerald-100"
              id="quick-look-modal-content"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-emerald-500/30 bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">File Preview</span>
                </div>
                <button 
                  onClick={() => setPreviewFileId(null)}
                  className="p-1 border border-emerald-500/20 text-emerald-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all cursor-pointer"
                  id="close-quick-look-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {previewLoading ? (
                  <div className="py-24 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-400 shadow-glow" />
                    <div className="text-xs text-emerald-500 uppercase tracking-widest animate-pulse">Loading File Preview...</div>
                  </div>
                ) : previewError ? (
                  <div className="p-4 border border-red-500/30 bg-red-950/15 rounded space-y-2">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> SECURE LINK HANDSHAKE FAILED
                    </div>
                    <p className="text-xs text-red-500/80 leading-relaxed">{previewError}</p>
                  </div>
                ) : previewData ? (
                  <div className="space-y-6 flex flex-col h-full">
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-emerald-500/20 bg-zinc-950/40 p-4 rounded text-xs leading-normal shrink-0">
                      <div className="space-y-1.5">
                        <div><strong className="text-emerald-500 uppercase">FILE ID:</strong> <span className="text-emerald-300 font-mono text-[10px] bg-emerald-950/20 px-1 py-0.5 rounded break-all">{previewData.metadata.id}</span></div>
                        <div><strong className="text-emerald-500 uppercase">FILE NAME:</strong> <span className="text-emerald-300 font-bold">{previewData.metadata.name}</span></div>
                        <div><strong className="text-emerald-500 uppercase">MIME TYPE:</strong> <span className="text-emerald-400/80 break-all">{previewData.metadata.mimeType}</span></div>
                      </div>
                      <div className="space-y-1.5 md:border-l md:border-emerald-500/10 md:pl-4">
                        <div><strong className="text-emerald-500 uppercase">FILE SIZE:</strong> <span className="text-emerald-300">{previewData.metadata.size ? formatBytes(Number(previewData.metadata.size)) : 'N/A'}</span></div>
                        <div><strong className="text-emerald-500 uppercase">LAST MODIFIED:</strong> <span className="text-emerald-300">{new Date(previewData.metadata.modifiedTime).toLocaleString()}</span></div>
                        {previewData.metadata.description && (
                          <div><strong className="text-emerald-500 uppercase">DESCRIPTION:</strong> <span className="text-emerald-400 italic">{previewData.metadata.description}</span></div>
                        )}
                      </div>
                    </div>

                    {/* Content Preview */}
                    <div className="space-y-2 flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-500 font-bold shrink-0">
                        <span>File Content Preview</span>
                        {previewData.metadata.webViewLink && (
                          <a 
                            href={previewData.metadata.webViewLink} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-cyan-400 hover:underline flex items-center gap-1"
                          >
                            View in Drive &gt;
                          </a>
                        )}
                      </div>
                      <div className="w-full bg-zinc-950 border border-emerald-500/20 p-4 rounded flex-1 overflow-y-auto relative min-h-[300px]">
                        {previewData.previewType === 'image' ? (
                          <div className="flex items-center justify-center w-full h-full">
                            <img src={previewData.previewContent} alt={previewData.metadata.name} className="max-w-full max-h-full object-contain rounded border border-emerald-500/10" />
                          </div>
                        ) : previewData.previewType === 'pdf' ? (
                          <iframe src={previewData.previewContent} title={previewData.metadata.name} className="w-full h-full border-none rounded" />
                        ) : previewData.previewType === 'text' ? (
                          <div className="text-xs text-emerald-300 whitespace-pre-wrap font-mono leading-relaxed select-text selection:bg-emerald-500/30">
                            {previewData.previewContent}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center w-full h-full text-center space-y-4">
                            <FileIcon className="w-16 h-16 text-emerald-500/50" />
                            <p className="text-emerald-500 text-sm font-bold uppercase tracking-widest">{previewData.previewContent}</p>
                            {previewData.metadata.webViewLink && (
                              <a href={previewData.metadata.webViewLink} target="_blank" rel="noreferrer" className="mt-4 px-6 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30 hover:text-emerald-200 transition-colors rounded">
                                OPEN IN GOOGLE DRIVE
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu?.visible && contextMenu.file && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 min-w-[160px] bg-zinc-950 border border-emerald-500/30 rounded shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden font-mono text-xs text-emerald-300 py-1"
            style={{ 
              top: contextMenu.y, 
              left: contextMenu.x,
              // basic boundary check if needed, but keeping it simple
            }}
          >
            <div className="px-3 py-2 border-b border-emerald-500/10 text-[10px] uppercase font-bold text-emerald-600 truncate max-w-[200px]">
              {contextMenu.file.name}
            </div>
            
            <button
              onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleRenameMoveClick(contextMenu.file); }}
              className="w-full text-left px-4 py-2 hover:bg-emerald-900/40 hover:text-emerald-100 flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-cyan-500" />
              <span>Move / Rename</span>
            </button>
            
            <button
              onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleFileInfoClick(contextMenu.file); }}
              className="w-full text-left px-4 py-2 hover:bg-emerald-900/40 hover:text-emerald-100 flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-emerald-500" />
              <span>Info</span>
            </button>

            {contextMenu.file.mimeType !== 'application/vnd.google-apps.folder' ? (
              <button
                onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleDownloadFile(contextMenu.file); }}
                className="w-full text-left px-4 py-2 hover:bg-emerald-900/40 hover:text-emerald-100 flex items-center space-x-2 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download</span>
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleCompressFolder(contextMenu.file); }}
                className="w-full text-left px-4 py-2 hover:bg-emerald-900/40 hover:text-emerald-100 flex items-center space-x-2 transition-colors cursor-pointer"
              >
                <FileArchive className="w-3.5 h-3.5 text-emerald-400" />
                <span>Compress Folder</span>
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleDeleteFile(contextMenu.file); }}
              className="w-full text-left px-4 py-2 hover:bg-red-900/40 hover:text-red-100 flex items-center space-x-2 transition-colors text-red-400 border-t border-emerald-500/10 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Delete</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Drawer Panel */}
      <AnimatePresence>
        {infoFile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40"
              onClick={() => setInfoFile(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-[400px] max-w-full bg-zinc-900 border-l border-emerald-500/30 shadow-[-10px_0_50px_rgba(0,255,128,0.1)] z-50 flex flex-col font-mono text-emerald-100 overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-emerald-500/30 bg-zinc-950 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">FILE METADATA & INFO</span>
                </div>
                <button 
                  onClick={() => setInfoFile(null)}
                  className="p-1 border border-emerald-500/20 text-emerald-500 hover:text-red-400 hover:border-red-500/40 rounded transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* File Identity */}
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded flex items-start gap-4">
                    <div className="p-2 bg-emerald-500/10 rounded shrink-0">
                      <FileText className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <h3 className="font-bold text-emerald-300 break-words leading-tight">{infoFile.name}</h3>
                      <p className="text-[10px] text-emerald-500 truncate">{infoFile.mimeType}</p>
                    </div>
                  </div>
                </div>

                {/* Metadata Details */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 border-b border-emerald-500/10 pb-1">System Attributes</h4>
                  <div className="grid grid-cols-2 gap-y-4 text-xs">
                    <div>
                      <div className="text-emerald-700 text-[9px] uppercase tracking-wider mb-1">Creation Date</div>
                      <div className="text-emerald-300">{infoFile.createdTime ? new Date(infoFile.createdTime).toLocaleDateString() : 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 text-[9px] uppercase tracking-wider mb-1">Last Modified</div>
                      <div className="text-emerald-300">{infoFile.modifiedTime ? new Date(infoFile.modifiedTime).toLocaleDateString() : 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 text-[9px] uppercase tracking-wider mb-1">File Size</div>
                      <div className="text-emerald-300">{infoFile.size ? formatBytes(Number(infoFile.size)) : 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-emerald-700 text-[9px] uppercase tracking-wider mb-1">Sharing State</div>
                      <div className="text-emerald-300">{infoFile.shared ? 'Shared' : 'Private'}</div>
                    </div>
                  </div>
                </div>

                {/* Editable Notes Section */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 border-b border-emerald-500/10 pb-1">Custom Notes / Tags</h4>
                  <textarea
                    value={infoNotes}
                    onChange={(e) => setInfoNotes(e.target.value)}
                    placeholder="Add tags (e.g. #important) or description here..."
                    className="w-full h-32 bg-zinc-950 border border-emerald-500/30 rounded p-3 text-xs text-emerald-300 focus:outline-none focus:border-emerald-400/50 focus:shadow-[0_0_10px_rgba(0,255,128,0.1)] transition-all resize-none leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 rounded text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save Notes
                    </button>
                  </div>
                </div>

                {/* External Actions */}
                <div className="space-y-4 pt-4 border-t border-emerald-500/10">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">External Links</h4>
                  {infoFile.webViewLink && (
                    <a
                      href={infoFile.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400/50 rounded text-xs font-bold tracking-wider uppercase transition-all"
                    >
                      Open in Google Drive
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Settings Modal */}
      <AnimatePresence>
        {showAiSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 border border-emerald-500/30 rounded-lg p-6 w-[400px] shadow-2xl relative"
            >
              <button 
                onClick={() => setShowAiSettings(false)}
                className="absolute top-4 right-4 text-emerald-500 hover:text-emerald-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h2 className="text-emerald-400 font-bold uppercase tracking-widest text-lg flex items-center gap-2 mb-6">
                <Cpu className="w-5 h-5" />
                AI Connection Logic
              </h2>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Custom Gemini API Key</label>
                  <input
                    type="password"
                    value={customGeminiKey}
                    onChange={(e) => setCustomGeminiKey(e.target.value)}
                    placeholder="Leave empty for default"
                    className="w-full px-3 py-2 bg-zinc-950/80 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-400"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Custom OpenAI API Key (Fallback)</label>
                  <input
                    type="password"
                    value={customOpenAiKey}
                    onChange={(e) => setCustomOpenAiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-zinc-950/80 border border-emerald-500/30 rounded text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
                  <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Pollinations.ai Failsafe</span>
                  <button 
                    onClick={() => setPollinationEnabled(!pollinationEnabled)}
                    className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${pollinationEnabled ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-zinc-950 rounded-full transition-transform ${pollinationEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* r00tBypass Floating Chat */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        <AnimatePresence>
          {showRootChat && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mb-4 w-80 sm:w-96 bg-zinc-950/95 border border-emerald-500/50 rounded shadow-[0_0_30px_rgba(0,255,128,0.15)] flex flex-col overflow-hidden backdrop-blur-md"
            >
              <div className="bg-emerald-950/40 border-b border-emerald-500/30 p-3 flex justify-between items-center cursor-pointer select-none" onClick={() => setShowRootChat(false)}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-zinc-950 border border-emerald-500/50 flex items-center justify-center hacker-glow">
                    <Skull className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold text-emerald-400 uppercase tracking-widest text-glow">r00tBypass</span>
                    <span className="font-mono text-[9px] text-emerald-500/70 uppercase">Master Admin AI</span>
                  </div>
                </div>
                <button className="text-emerald-500 hover:text-emerald-300 transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="h-80 p-4 overflow-y-auto font-mono text-xs space-y-4 bg-zinc-950/50">
                {rootChatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] text-emerald-500/50 mb-1">{msg.role === 'user' ? 'You' : 'r00t'}</span>
                    <div className={`p-2.5 rounded border max-w-[85%] ${
                      msg.role === 'user' 
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100' 
                        : 'bg-zinc-900/80 border-emerald-500/50 text-emerald-300 shadow-[inset_0_0_10px_rgba(0,255,128,0.05)]'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isRootThinking && (
                  <div className="flex items-start flex-col">
                    <span className="text-[9px] text-emerald-500/50 mb-1">r00t</span>
                    <div className="p-2.5 rounded border max-w-[85%] bg-zinc-900/80 border-emerald-500/50 text-emerald-400 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-[10px] uppercase tracking-wider">Hacking reality...</span>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleRootChatSubmit} className="p-3 border-t border-emerald-500/30 bg-emerald-950/20 flex gap-2">
                <input 
                  type="text" 
                  value={rootChatInput}
                  onChange={(e) => setRootChatInput(e.target.value)}
                  placeholder="Command me, weakling..."
                  className="flex-1 bg-zinc-950 border border-emerald-500/30 rounded px-3 py-2 text-xs text-emerald-300 focus:outline-none focus:border-emerald-400 placeholder-emerald-700/50 font-mono"
                  disabled={isRootThinking}
                />
                <button 
                  type="submit"
                  disabled={isRootThinking || !rootChatInput.trim()}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 rounded px-3 py-2 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowRootChat(!showRootChat)}
          className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all shadow-[0_0_20px_rgba(0,255,128,0.2)] cursor-pointer group hover:scale-105 ${
            showRootChat 
              ? 'bg-zinc-900 border-emerald-400 text-emerald-400' 
              : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-500 hover:text-emerald-300'
          }`}
        >
          {showRootChat ? <X className="w-6 h-6 group-hover:rotate-90 transition-transform" /> : <HelpCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />}
        </button>
      </div>

    </div>
  );
}

