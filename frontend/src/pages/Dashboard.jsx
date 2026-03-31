import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Mic, ArrowUp, Volume2, Globe, HeartPulse, LogOut, ChartLine, 
  MessageSquarePlus, MessageSquare, FileText, X, Upload, Sun, Moon,
  PanelLeftClose, PanelLeft, ClipboardList, Trash2, User
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';

/* ── Color-coded status badges for AI summaries ── */
const colorizeText = (text) => {
  if (typeof text !== 'string') return text;
  const regex = /(⚠️\s*HIGH|✅\s*NORMAL|↓\s*LOW|↑\s*HIGH|🔴\s*CRITICAL|⚠️\s*CRITICAL)/gi;
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, i) => {
    if (/⚠️\s*HIGH|↑\s*HIGH/i.test(part)) return <span key={i} className="status-badge high">{part}</span>;
    if (/✅\s*NORMAL/i.test(part)) return <span key={i} className="status-badge normal">{part}</span>;
    if (/↓\s*LOW/i.test(part)) return <span key={i} className="status-badge low">{part}</span>;
    if (/CRITICAL/i.test(part)) return <span key={i} className="status-badge critical">{part}</span>;
    return part;
  });
};
const processChildren = (children) => {
  return React.Children.map(children, child => {
    if (typeof child === 'string') return colorizeText(child);
    if (React.isValidElement(child) && child.props?.children) {
      return React.cloneElement(child, {}, processChildren(child.props.children));
    }
    return child;
  });
};
const medicalComponents = {
  p: ({children, ...p}) => <p {...p}>{processChildren(children)}</p>,
  li: ({children, ...p}) => <li {...p}>{processChildren(children)}</li>,
};

const languages = [
  { code: "en-IN", label: "EN" },
  { code: "hi-IN", label: "HI" },
  { code: "bn-IN", label: "BN" },
  { code: "gu-IN", label: "GU" },
  { code: "mr-IN", label: "MR" },
  { code: "ta-IN", label: "TA" },
  { code: "te-IN", label: "TE" }
];

const uiStrings = {
  "en-IN": { newChat: "New chat", history: "History", reports: "Reports", placeholder: "Ask anything about your health...", listening: "Listening...", upload: "Upload Report", analyze: "Analyze Report" },
  "hi-IN": { newChat: "नई चैट", history: "इतिहास", reports: "रिपोर्ट्स", placeholder: "स्वास्थ्य के बारे में कुछ भी पूछें...", listening: "सुन रहा हूँ...", upload: "रिपोर्ट अपलोड", analyze: "रिपोर्ट विश्लेषण" },
  "bn-IN": { newChat: "নতুন চ্যাট", history: "ইতিহাস", reports: "রিপোর্ট", placeholder: "স্বাস্থ্য সম্পর্কে জিজ্ঞাসা করুন...", listening: "শুনছি...", upload: "রিপোর্ট আপলোড", analyze: "রিপোর্ট বিশ্লেষণ" }
};
const ui = (key, lang) => uiStrings[lang]?.[key] || uiStrings["en-IN"][key];

const Dashboard = ({ session }) => {
  const navigate = useNavigate();
  
  // Core state
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Thread state
  const [threadList, setThreadList] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [file, setFile] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [loaderStep, setLoaderStep] = useState(0);
  const [reportData, setReportData] = useState(null);
  const [showReportPanel, setShowReportPanel] = useState(false);
  
  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatHistoryRef = useRef(chatHistory);

  // Theme
  useEffect(() => {
    if (isDarkMode) document.body.classList.remove('light-mode');
    else document.body.classList.add('light-mode');
  }, [isDarkMode]);

  // Scroll to bottom
  useEffect(() => {
    chatHistoryRef.current = chatHistory;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  // Loader steps
  useEffect(() => {
    let iv;
    if (loadingFile) {
      setLoaderStep(0);
      iv = setInterval(() => setLoaderStep(p => p < 3 ? p + 1 : p), 2500);
    }
    return () => clearInterval(iv);
  }, [loadingFile]);

  // Fetch threads
  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch('http://localhost:8000/api/chat/threads', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) setThreadList(d.threads);
    } catch (e) { console.error(e); }
  }, [session]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadThread = async (id) => {
    try {
      const r = await fetch(`http://localhost:8000/api/chat/threads/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) {
        setActiveThreadId(id);
        if (d.thread.language_code) setSelectedLanguage(d.thread.language_code);
        setChatHistory(d.thread.messages || []);
        setReportData(null);
        setShowReportPanel(false);
      }
    } catch (e) { console.error(e); }
  };

  const startNewChat = () => {
    setActiveThreadId(null);
    setChatHistory([]);
    setReportData(null);
    setShowReportPanel(false);
    setFile(null);
  };

  const deleteThread = async (e, threadId) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      const r = await fetch(`http://localhost:8000/api/chat/threads/${threadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) {
        setThreadList(prev => prev.filter(t => t.id !== threadId));
        if (activeThreadId === threadId) startNewChat();
      }
    } catch (e) { console.error(e); }
  };

  const activeSuggestions = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant'
    ? (chatHistory[chatHistory.length - 1].suggestions || []) : [];

  // TTS
  const playTTS = async (text, langCode) => {
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('language_code', langCode || 'hi-IN');
      const r = await fetch('http://localhost:8000/api/tts', { method: 'POST', body: fd });
      const d = await r.json();
      
      // Fallback for old API response d.audio, or new API d.audios arrays
      const audiosList = d.audios || (d.audio ? [d.audio] : []);
      if (d.success && audiosList.length > 0) {
        if (currentlyPlaying) currentlyPlaying.pause();
        
        let localPlaying = true;
        const playNext = (index) => {
          if (index >= audiosList.length || !localPlaying) return;
          const a = new Audio('data:audio/wav;base64,' + audiosList[index]);
          setCurrentlyPlaying(a);
          a.onpause = () => { localPlaying = false; };
          a.onended = () => {
             if (localPlaying) playNext(index + 1);
          };
          a.play();
        };
        playNext(0);
      }
    } catch (e) { console.error(e); }
  };

  // Upload
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setShowUpload(false);
    setLoadingFile(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', selectedLanguage);

    try {
      const r = await fetch('http://localhost:8000/api/upload', {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) {
        setReportData(d);
        setShowReportPanel(true);
        setUploadedFileName(file.name);
        const welc = d.welcome_msg || 'Your report has been analyzed. Ask me anything about it.';
        const sugs = d.welcome_suggestions || ['Explain my report', 'What are my risks?', 'Diet recommendations'];
        setChatHistory([
          { role: 'system-file', content: file.name, fileType: file.type },
          { role: 'assistant', content: welc, language_code: selectedLanguage, suggestions: sugs }
        ]);
        if (autoSpeak) playTTS(welc, selectedLanguage);
        loadThreads();
      } else {
        alert('Analysis failed: ' + d.detail);
      }
    } catch (err) { console.error(err); alert('Server error.'); }
    finally { setLoadingFile(false); setFile(null); }
  };

  // Chat
  const handleChat = async (e, textOverride = null) => {
    e?.preventDefault();
    const query = textOverride || chatInput;
    if (!query.trim()) return;
    setIsListening(false);

    const newHistory = [...chatHistory, { role: 'user', content: query }];
    setChatHistory(newHistory);
    if (!textOverride || textOverride === chatInput) setChatInput('');
    setIsTyping(true);

    const fd = new FormData();
    fd.append('query', query);
    fd.append('language', selectedLanguage);
    if (activeThreadId) fd.append('thread_id', activeThreadId);
    if (reportData?.context_file) fd.append('context_file', reportData.context_file);
    fd.append('history', JSON.stringify(newHistory.slice(0, -1).filter(h => h.role !== 'system-file').map(h => ({ role: h.role, content: h.content }))));

    try {
      const r = await fetch('http://localhost:8000/api/chat', {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) {
        setChatHistory([...newHistory, {
          role: 'assistant', content: d.response, language_code: d.language_code,
          suggestions: d.suggestions || []
        }]);
        if (d.thread_id && !activeThreadId) {
          setActiveThreadId(d.thread_id);
          loadThreads();
        }
        if (autoSpeak) playTTS(d.response, d.language_code);
      }
    } catch (e) { console.error(e); }
    finally { setIsTyping(false); }
  };

  // Voice
  const toggleListen = async () => {
    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const tempId = Date.now();
        setChatHistory(p => [...p, { role: 'user', content: '🎤 Processing...', id: tempId }]);
        setIsTyping(true);

        const fd = new FormData();
        fd.append('file', blob, 'voice.webm');
        fd.append('language', selectedLanguage);
        if (activeThreadId) fd.append('thread_id', activeThreadId);
        if (reportData?.context_file) fd.append('context_file', reportData.context_file);
        fd.append('history', JSON.stringify(chatHistoryRef.current.filter(m => m.id !== tempId && m.role !== 'system-file').map(h => ({ role: h.role, content: h.content }))));

        try {
          const r = await fetch('http://localhost:8000/api/chat_voice', {
            method: 'POST', body: fd,
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          const d = await r.json();
          if (d.success) {
            setChatHistory(p => {
              const f = p.filter(m => m.id !== tempId);
              return [...f,
                { role: 'user', content: d.user_transcript },
                { role: 'assistant', content: d.response, language_code: d.language_code, suggestions: d.suggestions || [] }
              ];
            });
            if (d.thread_id && !activeThreadId) { setActiveThreadId(d.thread_id); loadThreads(); }
            if (autoSpeak) playTTS(d.response, d.language_code);
          }
        } catch (e) { console.error(e); }
        finally { setIsTyping(false); }
      };
      mr.start();
      setIsListening(true);
    } catch (e) { alert('Microphone access denied'); }
  };

  const loaderSteps = ['Extracting medical data...', 'Analyzing biomarkers...', 'Computing longitudinal drift...', 'Securing to your EHR vault...'];

  return (
    <div className="nidaan-shell">
      {/* ═══ SIDEBAR ═══ */}
      <div className={`sidebar ${!sidebarOpen ? 'hidden' : ''}`} style={!sidebarOpen ? { width: 0, minWidth: 0, overflow: 'hidden', padding: 0, border: 'none' } : {}}>
        <div className="sidebar-header">
          <HeartPulse size={20} color="var(--accent)" />
          <span className="sidebar-brand">NIDAAN.ai</span>
        </div>

        <button className="sidebar-new-btn" onClick={startNewChat}>
          <MessageSquarePlus size={16} /> {ui('newChat', selectedLanguage)}
        </button>

        <div className="sidebar-section-label">{ui('history', selectedLanguage)}</div>
        <div className="sidebar-list hide-scrollbar">
          {threadList.map(t => (
            <div key={t.id} className={`sidebar-item ${activeThreadId === t.id ? 'active' : ''}`} onClick={() => loadThread(t.id)}>
              <MessageSquare size={15} />
              <span>{t.title}</span>
              <button className="sidebar-item-delete" onClick={(e) => deleteThread(e, t.id)} title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-footer-btn" onClick={() => navigate('/timeline')}>
            <ChartLine size={15} /> {ui('reports', selectedLanguage)}
          </button>
          <button className="sidebar-footer-btn" onClick={() => navigate('/profile')}>
            <User size={15} /> Profile
          </button>
          <button className="sidebar-footer-btn danger" onClick={() => supabase.auth.signOut()} title="Sign Out">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div className="main-content">
        {/* Top Bar */}
        <div className="topbar">
          <div className="topbar-left">
            <button className="topbar-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>
          <div className="topbar-right">
            <button className="topbar-btn accent" onClick={() => setShowUpload(true)}>
              <Upload size={14} /> {ui('upload', selectedLanguage)}
            </button>
            {reportData && (
              <button className="topbar-btn" onClick={() => setShowReportPanel(!showReportPanel)}>
                <ClipboardList size={14} /> Summary
              </button>
            )}
            <div className="topbar-btn" style={{ gap: '4px' }}>
              <Globe size={14} />
              <select className="topbar-select" value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <button className="topbar-btn" onClick={() => { setAutoSpeak(!autoSpeak); if (currentlyPlaying) currentlyPlaying.pause(); }}>
              <Volume2 size={14} style={{ opacity: autoSpeak ? 1 : 0.4 }} />
            </button>
            <button className="topbar-btn" onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="chat-viewport hide-scrollbar">
          <div className="chat-messages">
            {chatHistory.length === 0 && (
              <div className="chat-empty-state">
                <div className="chat-empty-icon"><HeartPulse size={24} /></div>
                <div className="chat-empty-title">How can I help with your health?</div>
                <div className="chat-empty-sub">
                  Upload a medical report for AI analysis, or ask any health question. I speak your language.
                </div>
              </div>
            )}

            {chatHistory.map((msg, i) => {
              /* File attachment card */
              if (msg.role === 'system-file') {
                return (
                  <div key={i} className="file-attachment-card" onClick={() => setShowReportPanel(true)}>
                    <FileText size={18} color="var(--accent)" />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{msg.content}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Medical report uploaded • Click to view analysis</div>
                    </div>
                  </div>
                );
              }
              return (
              <div key={i} className={`msg-row ${msg.role}`}>
                <div className={`msg-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                  {msg.role === 'assistant' ? 'N' : 'Y'}
                </div>
                <div className="msg-body">
                  <div className="msg-content">
                    <ReactMarkdown components={medicalComponents}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.role === 'assistant' && msg.language_code && (
                    <div className="msg-actions">
                      <button className="msg-action-btn" onClick={() => playTTS(msg.content, msg.language_code)} title="Listen">
                        <Volume2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              );
            })}

            {isTyping && (
              <div className="msg-row assistant">
                <div className="msg-avatar ai">N</div>
                <div className="msg-body">
                  <div className="thinking-indicator">
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                    <div className="thinking-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Suggestions */}
        {activeSuggestions.length > 0 && !isTyping && (
          <div className="suggestions-bar hide-scrollbar">
            {activeSuggestions.map((s, i) => (
              <button key={i} className="suggestion-chip" onClick={() => handleChat(null, s)}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="input-dock">
          <div className="input-container">
            <button className={`input-btn mic ${isListening ? 'recording' : ''}`} onClick={toggleListen}>
              <Mic size={16} />
            </button>
            <form onSubmit={handleChat} style={{ display: 'flex', flex: 1, alignItems: 'flex-end' }}>
              <input
                className="chat-input"
                placeholder={isListening ? ui('listening', selectedLanguage) : ui('placeholder', selectedLanguage)}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isListening}
              />
              <button type="submit" className="input-btn send" disabled={!chatInput.trim() || isListening || isTyping}>
                <ArrowUp size={16} />
              </button>
            </form>
          </div>
          <div className="input-hint">NIDAAN.ai is a medical AI assistant. Always consult a doctor for medical decisions.</div>
        </div>
      </div>

      {/* ═══ UPLOAD MODAL ═══ */}
      {showUpload && (
        <div className="upload-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="upload-modal" style={{ position: 'relative' }}>
            <button className="upload-close" onClick={() => setShowUpload(false)}><X size={18} /></button>
            <div className="upload-title">{ui('upload', selectedLanguage)}</div>
            <div className="upload-subtitle">PDF, PNG, or JPEG — your data stays encrypted</div>
            <div className="upload-drop-zone">
              <input type="file" onChange={e => setFile(e.target.files[0])} accept=".pdf,.png,.jpg,.jpeg" />
              <FileText size={32} color="var(--text-tertiary)" />
              <div className="upload-drop-label">{file ? '' : 'Drag & drop or click to browse'}</div>
              {file && <div className="upload-file-name">{file.name}</div>}
            </div>
            <button className="upload-btn" disabled={!file} onClick={handleUpload}>
              {ui('analyze', selectedLanguage)}
            </button>
          </div>
        </div>
      )}

      {/* ═══ PROCESSING LOADER ═══ */}
      {loadingFile && (
        <div className="processing-overlay">
          <div className="dna-helix">
            {[...Array(7)].map((_, i) => <div key={i} className="helix-bar" />)}
          </div>
          <div className="processing-steps">
            {loaderSteps.map((step, i) => (
              <div key={i} className={`processing-step ${loaderStep >= i ? 'active' : ''}`}>
                <div className="step-dot" />
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ REPORT SIDE PANEL ═══ */}
      {showReportPanel && reportData && (
        <div className="report-panel">
          <div className="report-panel-header">
            <span className="report-panel-title">Analysis Results</span>
            <button className="report-panel-close" onClick={() => setShowReportPanel(false)}><X size={18} /></button>
          </div>
          <div className="report-panel-body hide-scrollbar">
            {reportData.severity_score !== undefined && (
              <div className="report-section">
                <div className="report-section-title">Severity Score</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: reportData.severity_score > 60 ? 'var(--danger)' : 'var(--accent)' }}>
                  {reportData.severity_score}<span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>/100</span>
                </div>
              </div>
            )}

            {reportData.longitudinal_data?.drift_analysis && (
              <div className="report-section">
                <div className="report-section-title">Longitudinal Drift</div>
                {reportData.longitudinal_data.drift_analysis.map((d, i) => (
                  <div key={i} className="drift-item">{d}</div>
                ))}
              </div>
            )}

            <div className="report-section">
              <div className="report-section-title">AI Summary</div>
              <div className="report-section-content">
                <ReactMarkdown components={medicalComponents}>{reportData.summary}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
