/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { 
  vscDarkPlus, 
  vs 
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon, 
  Image as ImageIcon, 
  Code, 
  Edit3, 
  Download, 
  Copy,
  Check,
  LogIn,
  LogOut,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder,
  FileText,
  Plus,
  Trash2,
  FolderPlus,
  FilePlus,
  Sun,
  Moon,
  PanelLeft,
  Search,
  Settings,
  X,
  Sparkles,
  CheckSquare
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  User
} from './firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';

const INITIAL_MARKDOWN = `# Welcome to Markdown Pro

Markdown Pro is a professional-grade editor with real-time preview and AI-powered writing assistance.

## Key Features
- **Real-time Preview**: See your changes as you type.
- **AI Assistant**: Use Gemini to improve your writing.
- **GFM Support**: Tables, task lists, and more.
- **Responsive**: Works on all devices.
- **Cloud Sync**: Sign in to save and sync your files.
- **Drag & Drop**: Organize your files easily.
- **Task Lists**: Keep track of your to-dos.

### To-Do List
- [x] Create a professional markdown editor
- [x] Add Claude-inspired styling
- [ ] Write a best-selling novel
- [ ] World domination (maybe later)

### Try a Table
| Feature | Status |
| :--- | :--- |
| Markdown | ✅ |
| AI | ✅ |
| Fun | ✅ |

### Code Example
\`\`\`python
def hello():
    print("Hello, Markdown with Python!")
\`\`\`

> "The pen is mightier than the sword, but the keyboard is faster."
`;

const LANGUAGES = [
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
  { label: 'SQL', value: 'sql' },
  { label: 'Bash', value: 'bash' },
];

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  uid: string;
  updatedAt: any;
  createdAt: any;
}

export default function App() {
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>('welcome');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSyncedContent = useRef<string | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setNodes([]);
        setActiveFileId('welcome');
        setMarkdown(INITIAL_MARKDOWN);
      }
    });
    return () => unsubscribe();
  }, []);

  // Theme effect
  // Removed

  // Firestore Nodes Listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'nodes'),
      where('uid', '==', user.uid),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNodes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FileNode[];
      setNodes(fetchedNodes);
    });

    return () => unsubscribe();
  }, [user]);

  // Active File Sync
  useEffect(() => {
    if (!activeFileId) return;
    if (activeFileId === 'welcome') {
      if (markdown !== INITIAL_MARKDOWN) {
        setMarkdown(INITIAL_MARKDOWN);
        lastSyncedContent.current = INITIAL_MARKDOWN;
      }
      return;
    }
    const activeFile = nodes.find(n => n.id === activeFileId);
    if (activeFile && activeFile.content !== undefined) {
      // Only update local state if the server content is actually different from what we have
      // AND it's different from the last thing we synced (to avoid echoes of our own saves)
      if (activeFile.content !== markdown && activeFile.content !== lastSyncedContent.current) {
        setMarkdown(activeFile.content);
        lastSyncedContent.current = activeFile.content;
      } else if (activeFile.content === markdown) {
        // Keep track of the latest confirmed content from server
        lastSyncedContent.current = activeFile.content;
      }
    }
  }, [activeFileId, nodes, markdown]);

  // Auto-save
  useEffect(() => {
    if (!user || !activeFileId || activeFileId === 'welcome') return;

    const timer = setTimeout(async () => {
      try {
        const nodeRef = doc(db, 'nodes', activeFileId);
        await updateDoc(nodeRef, {
          content: markdown,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [markdown, user, activeFileId]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    
    setMarkdown(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const insertCodeBlock = (lang: string) => {
    insertText(`\n\`\`\`${lang}\n`, `\n\`\`\`\n`);
    setShowLangMenu(false);
  };

  const createNode = async (type: 'file' | 'folder', parentId: string | null = null) => {
    if (!user) return;
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;

    try {
      const newNode = {
        name,
        type,
        parentId,
        uid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(type === 'file' ? { content: '' } : {})
      };
      const docRef = await addDoc(collection(db, 'nodes'), newNode);
      if (type === 'file') {
        setActiveFileId(docRef.id);
      }
    } catch (error) {
      console.error("Failed to create node:", error);
    }
  };

  const deleteNode = async (id: string) => {
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      await deleteDoc(doc(db, 'nodes', id));
      if (activeFileId === id) setActiveFileId(null);
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  };

  const renameNode = async (id: string, newName: string) => {
    try {
      const nodeRef = doc(db, 'nodes', id);
      await updateDoc(nodeRef, {
        name: newName,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to rename node:", error);
    }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedNodeId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, node: FileNode) => {
    e.preventDefault();
    if (node.type === 'folder' && node.id !== draggedNodeId) {
      setDropTargetId(node.id);
      e.dataTransfer.dropEffect = 'move';
    } else {
      setDropTargetId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetParentId: string | null) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('text/plain');
    setDraggedNodeId(null);
    setDropTargetId(null);

    if (!nodeId || nodeId === targetParentId) return;

    // Prevent dropping a folder into itself or its children
    const isDescendant = (parent: string, child: string): boolean => {
      const childNode = nodes.find(n => n.id === child);
      if (!childNode || !childNode.parentId) return false;
      if (childNode.parentId === parent) return true;
      return isDescendant(parent, childNode.parentId);
    };

    if (targetParentId && isDescendant(nodeId, targetParentId)) return;

    try {
      const nodeRef = doc(db, 'nodes', nodeId);
      await updateDoc(nodeRef, {
        parentId: targetParentId,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to move node:", error);
    }
  };

  const renderTree = (parentId: string | null = null, depth = 0) => {
    const children = nodes.filter(n => n.parentId === parentId);
    return (
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          if (parentId === null) e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => parentId === null && handleDrop(e, null)}
        className={cn(parentId === null && "min-h-[20px]")}
      >
        {children.map(node => (
          <div key={node.id}>
            <div 
              draggable
              onDragStart={(e) => handleDragStart(e, node.id)}
              onDragOver={(e) => handleDragOver(e, node)}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(e) => {
                e.stopPropagation();
                if (node.type === 'folder') handleDrop(e, node.id);
                else handleDrop(e, node.parentId);
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-claude-bg dark:hover:bg-claude-dark-bg transition-all rounded-xl group relative",
                activeFileId === node.id ? "bg-claude-bg dark:bg-claude-dark-bg text-claude-accent" : "text-claude-text/70 dark:text-claude-dark-text/70",
                dropTargetId === node.id && "bg-claude-accent/10 ring-2 ring-claude-accent ring-inset",
                draggedNodeId === node.id && "opacity-40"
              )}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
              onClick={() => {
                if (node.type === 'folder') toggleFolder(node.id);
                else setActiveFileId(node.id);
              }}
            >
              {node.type === 'folder' ? (
                expandedFolders.has(node.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {node.type === 'folder' && <Folder className="w-3.5 h-3.5 text-blue-500/70" />}
              <span className="text-xs font-medium truncate flex-1">{node.name}</span>
              
              <div className="hidden group-hover:flex items-center gap-1">
                {node.type === 'folder' && (
                  <button onClick={(e) => { e.stopPropagation(); createNode('file', node.id); }} className="p-1 hover:bg-claude-sidebar dark:hover:bg-claude-dark-sidebar rounded-lg transition-colors">
                    <FilePlus className="w-3 h-3" />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); const newName = prompt('Rename to:', node.name); if (newName) renameNode(node.id, newName); }} className="p-1 hover:bg-claude-sidebar dark:hover:bg-claude-dark-sidebar rounded-lg transition-colors">
                  <Edit2 className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {node.type === 'folder' && expandedFolders.has(node.id) && renderTree(node.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans transition-colors duration-300 bg-claude-bg dark:bg-claude-dark-bg text-claude-text dark:text-claude-dark-text">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col border-r border-claude-border dark:border-claude-dark-border bg-claude-sidebar dark:bg-claude-dark-sidebar transition-all duration-300",
        isSidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        <div className="p-5 flex items-center justify-between border-b border-claude-border dark:border-claude-dark-border">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-claude-text/50 dark:text-claude-dark-text/40">Explorer</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => createNode('folder')} className="p-1.5 hover:bg-claude-bg dark:hover:bg-claude-dark-bg rounded-md text-claude-text/60 dark:text-claude-dark-text/60 transition-colors" title="New Folder">
              <FolderPlus className="w-4 h-4" />
            </button>
            <button onClick={() => createNode('file')} className="p-1.5 hover:bg-claude-bg dark:hover:bg-claude-dark-bg rounded-md text-claude-text/60 dark:text-claude-dark-text/60 transition-colors" title="New File">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
          <div 
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-claude-bg dark:hover:bg-claude-dark-bg transition-all rounded-xl group relative mb-2",
              activeFileId === 'welcome' ? "bg-claude-bg dark:bg-claude-dark-bg text-claude-accent" : "text-claude-text/70 dark:text-claude-dark-text/70"
            )}
            onClick={() => setActiveFileId('welcome')}
          >
            <Sparkles className="w-3.5 h-3.5 text-claude-accent" />
            <span className="text-xs font-medium truncate flex-1">Welcome Guide</span>
          </div>
          <div className="h-px bg-claude-border dark:bg-claude-dark-border mx-2 mb-4 opacity-50" />

          {user ? (
            nodes.length > 0 ? renderTree() : (
              <div className="p-6 text-center">
                <p className="text-[10px] text-claude-text/40 dark:text-claude-dark-text/40 uppercase tracking-widest mb-4">No files yet</p>
                <button 
                  onClick={() => createNode('file')}
                  className="w-full py-2.5 border border-dashed border-claude-border dark:border-claude-dark-border rounded-xl text-[10px] font-bold uppercase tracking-widest text-claude-text/60 dark:text-claude-dark-text/60 hover:bg-claude-bg dark:hover:bg-claude-dark-bg transition-colors"
                >
                  Create First File
                </button>
              </div>
            )
          ) : (
            <div className="p-8 text-center">
              <LogIn className="w-8 h-8 mx-auto mb-4 text-claude-border dark:text-claude-dark-border" />
              <p className="text-xs text-claude-text/60 dark:text-claude-dark-text/60 mb-5">Sign in to save your files</p>
              <button onClick={handleLogin} className="w-full py-2.5 bg-claude-accent text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">Sign In</button>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-claude-border dark:border-claude-dark-border">
          <div className="flex items-center justify-between">
            <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 hover:bg-claude-bg dark:hover:bg-claude-dark-bg rounded-xl text-claude-text/60 dark:text-claude-dark-text/60 transition-colors">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button className="p-2.5 hover:bg-claude-bg dark:hover:bg-claude-dark-bg rounded-xl text-claude-text/60 dark:text-claude-dark-text/60 transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 bg-claude-bg dark:bg-claude-dark-bg border-b border-claude-border dark:border-claude-dark-border z-10">
          <div className="flex items-center gap-5">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-claude-sidebar dark:hover:bg-claude-dark-sidebar rounded-xl text-claude-text/60 dark:text-claude-dark-text/60 transition-colors">
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-claude-accent rounded-xl flex items-center justify-center shadow-sm">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base font-serif font-bold tracking-tight hidden sm:block">Markdown Pro</h1>
            </div>
            {activeFileId && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-claude-sidebar dark:bg-claude-dark-sidebar rounded-full border border-claude-border dark:border-claude-dark-border">
                {activeFileId === 'welcome' ? (
                  <Sparkles className="w-3.5 h-3.5 text-claude-accent" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-claude-accent" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-widest text-claude-text/80 dark:text-claude-dark-text/80">
                  {activeFileId === 'welcome' ? 'Welcome Guide' : nodes.find(n => n.id === activeFileId)?.name}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-5">
            <div className="flex bg-claude-sidebar dark:bg-claude-dark-sidebar p-1 rounded-xl border border-claude-border dark:border-claude-dark-border">
              <button onClick={() => setViewMode('editor')} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all", viewMode === 'editor' ? "bg-white dark:bg-claude-dark-bg shadow-sm text-claude-text dark:text-white" : "text-claude-text/50 dark:text-claude-dark-text/50")}>Editor</button>
              <button onClick={() => setViewMode('split')} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all hidden md:block", viewMode === 'split' ? "bg-white dark:bg-claude-dark-bg shadow-sm text-claude-text dark:text-white" : "text-claude-text/50 dark:text-claude-dark-text/50")}>Split</button>
              <button onClick={() => setViewMode('preview')} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all", viewMode === 'preview' ? "bg-white dark:bg-claude-dark-bg shadow-sm text-claude-text dark:text-white" : "text-claude-text/50 dark:text-claude-dark-text/50")}>Preview</button>
            </div>

            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-9 h-9 bg-claude-sidebar dark:bg-claude-dark-sidebar rounded-full border border-claude-border dark:border-claude-dark-border overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-claude-text/60" />
                  )}
                </div>
                <button onClick={handleLogout} className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-claude-text/50 dark:text-claude-dark-text/50 hover:text-red-500 rounded-xl transition-colors"><LogOut className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={handleLogin} className="flex items-center gap-2.5 px-5 py-2.5 bg-claude-text dark:bg-claude-dark-text text-white dark:text-claude-dark-bg rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity shadow-sm"><LogIn className="w-4 h-4" /> Sign In</button>
            )}
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-8 py-2.5 bg-claude-bg dark:bg-claude-dark-bg border-b border-claude-border dark:border-claude-dark-border overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5">
            <ToolbarButton icon={<Bold className="w-4 h-4" />} onClick={() => insertText('**', '**')} title="Bold" disabled={activeFileId === 'welcome'} />
            <ToolbarButton icon={<Italic className="w-4 h-4" />} onClick={() => insertText('_', '_')} title="Italic" disabled={activeFileId === 'welcome'} />
            <div className="w-px h-5 bg-claude-border dark:bg-claude-dark-border mx-2" />
            <ToolbarButton icon={<List className="w-4 h-4" />} onClick={() => insertText('\n- ')} title="Unordered List" disabled={activeFileId === 'welcome'} />
            <ToolbarButton icon={<ListOrdered className="w-4 h-4" />} onClick={() => insertText('\n1. ')} title="Ordered List" disabled={activeFileId === 'welcome'} />
            <ToolbarButton icon={<CheckSquare className="w-4 h-4" />} onClick={() => insertText('\n- [ ] ')} title="Task List" disabled={activeFileId === 'welcome'} />
            <div className="w-px h-5 bg-claude-border dark:bg-claude-dark-border mx-2" />
            <ToolbarButton icon={<LinkIcon className="w-4 h-4" />} onClick={() => insertText('[', '](url)')} title="Link" disabled={activeFileId === 'welcome'} />
            <ToolbarButton icon={<ImageIcon className="w-4 h-4" />} onClick={() => insertText('![alt](', ')')} title="Image" disabled={activeFileId === 'welcome'} />
            
            <div className="relative">
              <button 
                onClick={() => setShowLangMenu(!showLangMenu)} 
                disabled={activeFileId === 'welcome'}
                className={cn(
                  "flex items-center gap-1.5 p-2.5 hover:bg-claude-sidebar dark:hover:bg-claude-dark-sidebar rounded-xl transition-colors text-claude-text/60 dark:text-claude-dark-text/60 hover:text-claude-text dark:hover:text-white",
                  activeFileId === 'welcome' && "opacity-50 cursor-not-allowed"
                )}
              >
                <Code className="w-4 h-4" />
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showLangMenu && (
                <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-claude-dark-sidebar border border-claude-border dark:border-claude-dark-border rounded-2xl shadow-xl z-50 py-2 overflow-hidden">
                  {LANGUAGES.map(lang => (
                    <button key={lang.value} onClick={() => insertCodeBlock(lang.value)} className="w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-claude-bg dark:hover:bg-claude-dark-bg text-claude-text/80 dark:text-claude-dark-text/80 transition-colors">{lang.label}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-5 bg-claude-border dark:bg-claude-dark-border mx-2" />
            <ToolbarButton icon={<Copy className="w-4 h-4" />} onClick={() => { navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 2000); }} title="Copy" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} onClick={() => { const blob = new Blob([markdown], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'document.md'; a.click(); URL.revokeObjectURL(url); }} title="Download" />
          </div>
        </div>

        {/* Editor/Preview Area */}
        <main className="flex-1 flex overflow-hidden">
          {(viewMode === 'split' || viewMode === 'editor') && (
            <div className={cn(
              "flex-1 flex flex-col bg-white dark:bg-claude-dark-bg",
              viewMode === 'split' ? "border-r border-claude-border dark:border-claude-dark-border" : ""
            )}>
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                readOnly={activeFileId === 'welcome'}
                className={cn(
                  "flex-1 p-10 resize-none focus:outline-none font-mono text-sm leading-relaxed text-claude-text/90 dark:text-claude-dark-text/90 bg-transparent",
                  activeFileId === 'welcome' && "opacity-80 cursor-default"
                )}
                placeholder="Start writing markdown..."
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === 'split' || viewMode === 'preview') && (
            <div className="flex-1 overflow-y-auto bg-claude-bg dark:bg-claude-dark-bg p-10">
              <div className="max-w-3xl mx-auto markdown-body [&_h1]:text-5xl [&_h1]:font-serif [&_h1]:font-bold [&_h1]:mb-8 [&_h1]:text-claude-text dark:[&_h1]:text-white [&_h2]:text-3xl [&_h2]:font-serif [&_h2]:font-bold [&_h2]:mt-12 [&_h2]:mb-6 [&_h2]:text-claude-text dark:[&_h2]:text-white [&_h3]:text-2xl [&_h3]:font-serif [&_h3]:font-bold [&_h3]:mt-8 [&_h3]:mb-4 [&_h3]:text-claude-text dark:[&_h3]:text-white [&_p]:leading-relaxed [&_p]:my-5 [&_p]:text-claude-text/90 dark:[&_p]:text-claude-dark-text/90 [&_a]:text-claude-accent [&_a]:underline [&_a]:underline-offset-4 [&_img]:rounded-3xl [&_img]:my-8 [&_img]:shadow-md [&_blockquote]:border-l-4 [&_blockquote]:border-claude-accent [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:text-claude-text/70 dark:[&_blockquote]:text-claude-dark-text/70 [&_blockquote]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:my-8 [&_th]:border-b-2 [&_th]:border-claude-border dark:[&_th]:border-claude-dark-border [&_th]:p-3 [&_th]:text-left [&_th]:bg-claude-sidebar/50 dark:[&_th]:bg-claude-dark-sidebar/50 [&_td]:border-b [&_td]:border-claude-border dark:[&_td]:border-claude-dark-border [&_td]:p-3 [&_ul]:list-disc [&_ul]:pl-8 [&_ul]:my-5 [&_ol]:list-decimal [&_ol]:pl-8 [&_ol]:my-5 [&_li]:my-2 [&_strong]:font-bold [&_em]:italic [&_code]:font-mono [&_code]:text-sm [&_code]:bg-claude-sidebar dark:[&_code]:bg-claude-dark-sidebar [&_code]:px-2 [&_code]:py-0.5 [&_code]:rounded-lg">
                <Markdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={darkMode ? vscDarkPlus : vs}
                          language={match[1]}
                          PreTag="pre"
                          customStyle={{ border: 'none', margin: 0, background: 'transparent', fontFamily: 'inherit' }}
                          codeTagProps={{ style: { fontFamily: 'inherit' } }}
                          className={cn("rounded-2xl !p-6 shadow-sm", darkMode ? "!bg-[#0D0D0D]" : "!bg-claude-sidebar")}
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={cn("bg-claude-sidebar dark:bg-claude-dark-sidebar px-2 py-0.5 rounded-lg text-sm font-mono", className)} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {markdown}
                </Markdown>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="px-8 py-3 bg-claude-bg dark:bg-claude-dark-bg border-t border-claude-border dark:border-claude-dark-border flex items-center justify-between text-[11px] font-bold text-claude-text/40 dark:text-claude-dark-text/40 uppercase tracking-[0.2em]">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2"><Search className="w-3.5 h-3.5" /> {markdown.length} Characters</span>
            <span>{markdown.split(/\s+/).filter(Boolean).length} Words</span>
            {user && activeFileId && <span className="text-claude-accent flex items-center gap-2"><Check className="w-3.5 h-3.5" /> Saved to Cloud</span>}
          </div>
        </footer>
      </div>
    </div>

  );
}

function ToolbarButton({ icon, onClick, title, disabled }: { icon: React.ReactNode, onClick: () => void, title: string, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        "p-2.5 hover:bg-claude-sidebar dark:hover:bg-claude-dark-sidebar rounded-xl transition-colors text-claude-text/60 dark:text-claude-dark-text/60 hover:text-claude-text dark:hover:text-white",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={title}
    >
      {icon}
    </button>
  );
}
