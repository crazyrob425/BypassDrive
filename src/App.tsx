/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { DownloadCloud, CheckCircle2, AlertCircle, Loader2, Link as LinkIcon, FileIcon, X, Plus } from 'lucide-react';
import { initAuth, googleSignIn, getAccessToken, logout } from './auth';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';

interface Task {
  id: string;
  url: string;
  filename: string;
  status: 'pending' | 'downloading' | 'uploading' | 'done' | 'error';
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
        body: JSON.stringify({ url: url.trim(), filename: filename.trim(), accessToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to start transfer');
      }

      const data = await response.json();
      const taskId = data.taskId;

      const newTask: Task = {
        id: taskId,
        url: url.trim(),
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden text-slate-800 font-sans selection:bg-blue-100">
      {/* Header Navigation */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <DownloadCloud className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">DriveFetch</span>
        </div>
        <div className="flex items-center space-x-6">
          {user ? (
            <div className="flex items-center space-x-3 text-sm text-slate-500">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Connected: <strong className="text-slate-800">{user.displayName || user.email}</strong></span>
              <button onClick={logout} className="ml-4 text-xs font-semibold text-slate-400 hover:text-slate-600 uppercase tracking-wider">Sign out</button>
              {user.photoURL ? (
                <img src={user.photoURL} alt="User avatar" className="h-8 w-8 rounded-full border border-slate-300 ml-2" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300 ml-2"></div>
              )}
            </div>
          ) : (
             <div className="flex items-center space-x-2 text-sm text-slate-500">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span>Not Connected</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1600px] mx-auto w-full">
        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-6 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            {needsAuth ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DownloadCloud className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-800 mb-2">Connect Drive</h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Sign in to securely transfer files directly to Google Drive.
                </p>
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 block">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  )}
                  <span>Google Sign In</span>
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">New Transfer</h2>
                <form onSubmit={startTask} className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="url" className="text-xs font-medium text-slate-600">Source URL</label>
                    <input
                      id="url"
                      type="url"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/archive.zip"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="filename" className="text-xs font-medium text-slate-600">Filename (Optional)</label>
                    <input
                      id="filename"
                      type="text"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      placeholder="Auto-detect"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || !url.trim()}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Initialize Transfer
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">System Info</h2>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold">Ready</div>
              </div>
              <p className="text-xs text-slate-400">Stream chunks directly to Drive to bypass local memory limits.</p>
            </div>
          </div>
        </aside>

        {/* Main Content: Progress Tracker */}
        <section className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold">Active Transfers</h2>
            <div className="flex space-x-2">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-bold uppercase tracking-tight">
                {tasks.filter(t => t.status === 'downloading' || t.status === 'uploading' || t.status === 'pending').length} Processing
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center space-y-4">
                <FileIcon className="w-12 h-12 text-slate-200" />
                <p>No active transfers. Initialize a new transfer from the sidebar.</p>
              </div>
            ) : (
              <AnimatePresence>
                {tasks.map(task => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 border-b border-slate-50 relative"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center min-w-0 flex-1 pr-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 shrink-0 ${
                          task.status === 'done' ? 'bg-green-50' : 
                          task.status === 'error' ? 'bg-red-50' : 
                          'bg-indigo-50'
                        }`}>
                          {task.status === 'done' ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                          ) : task.status === 'error' ? (
                            <AlertCircle className="w-6 h-6 text-red-500" />
                          ) : (
                            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-800 truncate" title={task.filename}>{task.filename}</h3>
                          <p className="text-xs text-slate-400 truncate" title={task.url}>Source: {task.url}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {task.status !== 'pending' && task.status !== 'error' && (
                          <>
                            <div className="text-sm font-bold text-slate-800">{task.progress}%</div>
                            {task.total > 0 && (
                              <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                                {formatBytes(task.bytes)} of {formatBytes(task.total)}
                              </div>
                            )}
                          </>
                        )}
                        {task.status === 'pending' && (
                          <div className="text-sm font-bold text-slate-400 italic">Waiting...</div>
                        )}
                        {task.status === 'error' && (
                          <div className="text-sm font-bold text-red-500">Failed</div>
                        )}
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden relative">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ease-out ${
                          task.status === 'done' ? 'bg-green-500' :
                          task.status === 'error' ? 'bg-red-500' :
                          'bg-blue-600'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between text-[11px] font-medium">
                      <div className="flex space-x-4">
                        {task.status === 'downloading' && (
                          <span className="text-blue-600 flex items-center">
                            <div className="w-1 h-1 bg-blue-500 rounded-full mr-1.5 animate-pulse"></div> Fetching Stream
                          </span>
                        )}
                        {task.status === 'uploading' && (
                          <span className="text-blue-600 flex items-center">
                            <div className="w-1 h-1 bg-blue-500 rounded-full mr-1.5 animate-pulse"></div> Saving to Drive
                          </span>
                        )}
                        {task.status === 'done' && (
                          <span className="text-green-600 flex items-center">
                            <div className="w-1 h-1 bg-green-500 rounded-full mr-1.5"></div> Completed
                          </span>
                        )}
                        {task.status === 'error' && (
                          <span className="text-red-500 truncate max-w-[200px]" title={task.error}>
                            {task.error}
                          </span>
                        )}
                      </div>
                      <div className="space-x-3">
                        {(task.status === 'done' || task.status === 'error') && (
                          <button onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-slate-600 uppercase tracking-wider">Remove</button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              System Status: <span className="text-green-600 font-bold">Optimized</span>
            </p>
            <div className="flex space-x-1">
              <div className="w-1 h-3 bg-blue-400 rounded-full"></div>
              <div className="w-1 h-5 bg-blue-600 rounded-full animate-pulse"></div>
              <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
              <div className="w-1 h-6 bg-blue-700 rounded-full animate-pulse"></div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="h-10 bg-slate-900 px-8 flex items-center justify-between text-[10px] text-slate-400 shrink-0 uppercase tracking-[0.2em]">
        <div>v1.0.0 Stable Build</div>
        <div className="flex space-x-6">
          <span>Google Drive API Connected</span>
          <span>Encrypted Tunnel Active</span>
        </div>
        <div className="text-slate-500">© 2024 DriveFetch</div>
      </footer>
    </div>
  );
}

