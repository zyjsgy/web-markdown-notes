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
  X
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
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setNodes([]);
        setActiveFileId(null);
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
    const activeFile = nodes.find(n => n.id === activeFileId);
    if (activeFile && activeFile.content !== undefined) {
      setMarkdown(activeFile.content);
    }
  }, [activeFileId, nodes]);

  // Auto-save
  useEffect(() => {
    if (!user || !activeFileId) return;

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

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTree = (parentId: string | null = null, depth = 0) => {
    const children = nodes.filter(n => n.parentId === parentId);
    return children.map(node => (
      <div key={node.id}>
        <div 
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#E7E5E4] dark:hover:bg-[#292524] transition-colors rounded-md group",
            activeFileId === node.id ? "bg-[#E7E5E4] dark:bg-[#292524] text-[#1C1917] dark:text-white" : "text-[#57534E] dark:text-[#A8A29E]"
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
          {node.type === 'folder' && <Folder className="w-3.5 h-3.5 text-blue-500" />}
          <span className="text-xs font-medium truncate flex-1">{node.name}</span>
          
          <div className="hidden group-hover:flex items-center gap-1">
            {node.type === 'folder' && (
              <button onClick={(e) => { e.stopPropagation(); createNode('file', node.id); }} className="p-1 hover:bg-[#D6D3D1] dark:hover:bg-[#44403C] rounded">
                <FilePlus className="w-3 h-3" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        {node.type === 'folder' && expandedFolders.has(node.id) && renderTree(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans transition-colors duration-200 bg-[#F5F5F4] text-[#1C1917]">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col border-r border-[#E7E5E4] bg-white transition-all duration-300",
        isSidebarOpen ? "w-64" : "w-0 overflow-hidden"
      )}>
        <div className="p-4 flex items-center justify-between border-b border-[#E7E5E4]">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E]">Explorer</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => createNode('folder')} className="p-1.5 hover:bg-[#F5F5F4] rounded-md text-[#78716C]" title="New Folder">
              <FolderPlus className="w-4 h-4" />
            </button>
            <button onClick={() => createNode('file')} className="p-1.5 hover:bg-[#F5F5F4] rounded-md text-[#78716C]" title="New File">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          {user ? (
            nodes.length > 0 ? renderTree() : (
              <div className="p-4 text-center">
                <p className="text-[10px] text-[#A8A29E] uppercase tracking-wider mb-4">No files yet</p>
                <button 
                  onClick={() => createNode('file')}
                  className="w-full py-2 border border-dashed border-[#E7E5E4] rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#78716C] hover:bg-[#F5F5F4] transition-colors"
                >
                  Create First File
                </button>
              </div>
            )
          ) : (
            <div className="p-8 text-center">
              <LogIn className="w-8 h-8 mx-auto mb-4 text-[#E7E5E4]" />
              <p className="text-xs text-[#78716C] mb-4">Sign in to save your files</p>
              <button onClick={handleLogin} className="w-full py-2 bg-[#1C1917] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest">Sign In</button>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-[#E7E5E4]">
          <div className="flex items-center justify-end">
            <button className="p-2 hover:bg-[#F5F5F4] rounded-lg text-[#78716C]">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#E7E5E4] shadow-sm z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-[#F5F5F4] rounded-lg text-[#78716C]">
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#1C1917] rounded-lg flex items-center justify-center">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-sm font-bold tracking-tight hidden sm:block">Markdown Pro</h1>
            </div>
            {activeFileId && (
              <div className="flex items-center gap-2 px-3 py-1 bg-[#F5F5F4] rounded-full border border-[#E7E5E4]">
                <FileText className="w-3 h-3 text-[#78716C]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#44403C]">
                  {nodes.find(n => n.id === activeFileId)?.name}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-[#F5F5F4] p-1 rounded-lg border border-[#E7E5E4]">
              <button onClick={() => setViewMode('editor')} className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", viewMode === 'editor' ? "bg-white shadow-sm text-[#1C1917]" : "text-[#78716C]")}>Editor</button>
              <button onClick={() => setViewMode('split')} className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all hidden md:block", viewMode === 'split' ? "bg-white shadow-sm text-[#1C1917]" : "text-[#78716C]")}>Split</button>
              <button onClick={() => setViewMode('preview')} className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all", viewMode === 'preview' ? "bg-white shadow-sm text-[#1C1917]" : "text-[#78716C]")}>Preview</button>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F5F5F4] rounded-full border border-[#E7E5E4] hidden sm:flex">
                  {user.photoURL ? <img src={user.photoURL} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" /> : <UserIcon className="w-4 h-4 text-[#78716C]" />}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#44403C] max-w-[80px] truncate">{user.displayName}</span>
                </div>
                <button onClick={handleLogout} className="p-2 hover:bg-red-50 text-[#78716C] hover:text-red-500 rounded-lg transition-colors"><LogOut className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={handleLogin} className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"><LogIn className="w-4 h-4" /> Sign In</button>
            )}
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-2 bg-white border-b border-[#E7E5E4] overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1">
            <ToolbarButton icon={<Bold className="w-4 h-4" />} onClick={() => insertText('**', '**')} title="Bold" />
            <ToolbarButton icon={<Italic className="w-4 h-4" />} onClick={() => insertText('_', '_')} title="Italic" />
            <div className="w-px h-4 bg-[#E7E5E4] mx-1" />
            <ToolbarButton icon={<List className="w-4 h-4" />} onClick={() => insertText('\n- ')} title="Unordered List" />
            <ToolbarButton icon={<ListOrdered className="w-4 h-4" />} onClick={() => insertText('\n1. ')} title="Ordered List" />
            <div className="w-px h-4 bg-[#E7E5E4] mx-1" />
            <ToolbarButton icon={<LinkIcon className="w-4 h-4" />} onClick={() => insertText('[', '](url)')} title="Link" />
            <ToolbarButton icon={<ImageIcon className="w-4 h-4" />} onClick={() => insertText('![alt](', ')')} title="Image" />
            
            <div className="relative">
              <button onClick={() => setShowLangMenu(!showLangMenu)} className="flex items-center gap-1 p-2 hover:bg-[#F5F5F4] rounded-md transition-colors text-[#78716C] hover:text-[#1C1917]">
                <Code className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showLangMenu && (
                <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-[#E7E5E4] rounded-lg shadow-lg z-50 py-1">
                  {LANGUAGES.map(lang => (
                    <button key={lang.value} onClick={() => insertCodeBlock(lang.value)} className="w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-[#F5F5F4] text-[#44403C]">{lang.label}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-[#E7E5E4] mx-1" />
            <ToolbarButton icon={<Copy className="w-4 h-4" />} onClick={() => { navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 2000); }} title="Copy" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} onClick={() => { const blob = new Blob([markdown], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'document.md'; a.click(); URL.revokeObjectURL(url); }} title="Download" />
          </div>
        </div>

        {/* Editor/Preview Area */}
        <main className="flex-1 flex overflow-hidden">
          {(viewMode === 'split' || viewMode === 'editor') && (
            <div className={cn(
              "flex-1 flex flex-col bg-white",
              viewMode === 'split' ? "border-r border-[#E7E5E4]" : ""
            )}>
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="flex-1 p-8 resize-none focus:outline-none font-mono text-sm leading-relaxed text-[#44403C] bg-transparent"
                placeholder="Start writing markdown..."
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === 'split' || viewMode === 'preview') && (
            <div className="flex-1 overflow-y-auto bg-[#FAFAF9] p-8">
              <div className="max-w-3xl mx-auto prose prose-stone prose-sm sm:prose-base lg:prose-lg prose-headings:font-bold prose-a:text-blue-500 prose-img:rounded-2xl">
                <Markdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={vs}
                          language={match[1]}
                          PreTag="pre"
                          customStyle={{ border: 'none', margin: 0 }}
                          className="rounded-xl !bg-[#F5F5F4] !p-4"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={cn("bg-[#F5F5F4] px-1.5 py-0.5 rounded text-sm font-mono", className)} {...props}>
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
        <footer className="px-6 py-2 bg-white border-t border-[#E7E5E4] flex items-center justify-between text-[10px] font-bold text-[#A8A29E] uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5"><Search className="w-3 h-3" /> {markdown.length} Characters</span>
            <span>{markdown.split(/\s+/).filter(Boolean).length} Words</span>
            {user && activeFileId && <span className="text-green-600 flex items-center gap-1.5"><Check className="w-3 h-3" /> Saved to Cloud</span>}
          </div>
        </footer>
      </div>
    </div>

  );
}

function ToolbarButton({ icon, onClick, title }: { icon: React.ReactNode, onClick: () => void, title: string }) {
  return (
    <button onClick={onClick} className="p-2 hover:bg-[#F5F5F4] rounded-md transition-colors text-[#78716C] hover:text-[#1C1917]" title={title}>
      {icon}
    </button>
  );
}
