import { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, CheckCircle2, Lock, Crown, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTransactions, getInventory, checkAiAccess } from '../utils/storage';
import { createChatSession } from '../utils/ai';
import type { Transaction, InventoryItem } from '../types';
import DOMPurify from 'dompurify';

const renderMarkdown = (text: string) => {
  return text.split('\n').map((line, index) => {
    const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      const sanitizedLine = DOMPurify.sanitize(formattedLine.substring(2));
      return (
        <div key={index} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
          <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0, marginTop: '2px' }} />
          <span dangerouslySetInnerHTML={{ __html: sanitizedLine }} />
        </div>
      );
    }
    if (formattedLine.startsWith('#')) {
      const sanitizedLine = DOMPurify.sanitize(formattedLine.replace(/^#+\s/, ''));
      return <strong key={index} style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', fontSize: '1.05rem', color: '#fff' }} dangerouslySetInnerHTML={{ __html: sanitizedLine }} />;
    }
    if (formattedLine.trim()) {
      const sanitizedLine = DOMPurify.sanitize(formattedLine);
      return <p key={index} style={{ marginBottom: '0.5rem', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: sanitizedLine }} />;
    }
    return null;
  });
};

const AiAssistant = () => {
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [chatSession, setChatSession] = useState<any>(null);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [promptsUsedToday, setPromptsUsedToday] = useState(0);
  const [dailyPromptLimit, setDailyPromptLimit] = useState(15);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [userName, setUserName] = useState<string>('Admin');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add a slight delay to ensure DOM is fully rendered after loading state changes
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [messages, isChatLoading, loading]);

  useEffect(() => {
    const init = async () => {
      try {
        const approved = await checkAiAccess();
        setIsApproved(approved);

        // Load data regardless of approval status so free users can use it
        const [txs, inv] = await Promise.all([getTransactions(), getInventory()]);
        setTransactions(txs);
        setInventory(inv);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.full_name) {
          setUserName(user.user_metadata.full_name);
        }
        
        const globalKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (globalKey) {
          setGeminiKey(globalKey);
        } else if (user?.user_metadata?.gemini_api_key) {
          setGeminiKey(user.user_metadata.gemini_api_key);
        }
        if (user?.user_metadata?.ai_prompt_limit !== undefined) {
          setDailyPromptLimit(Number(user.user_metadata.ai_prompt_limit));
        }

        // Initialize daily limit counter and load history with namespace
        const todayDate = new Date().toDateString();
        if (user?.id) {
          setUserId(user.id);
          
          try {
            const savedTime = localStorage.getItem(`vrimae_ai_chat_time_${user.id}`);
            if (savedTime) {
              const timeDiff = new Date().getTime() - new Date(savedTime).getTime();
              // 2 hari dalam milliseconds
              if (timeDiff > 172800000) {
                localStorage.removeItem(`vrimae_ai_chat_history_${user.id}`);
                localStorage.removeItem(`vrimae_ai_chat_time_${user.id}`);
              } else {
                const saved = localStorage.getItem(`vrimae_ai_chat_history_${user.id}`);
                if (saved) {
                  const parsed = JSON.parse(saved);
                  setMessages(parsed.length > 10 ? parsed.slice(-10) : parsed);
                }
              }
            } else {
              const saved = localStorage.getItem(`vrimae_ai_chat_history_${user.id}`);
              if (saved) {
                const parsed = JSON.parse(saved);
                setMessages(parsed.length > 10 ? parsed.slice(-10) : parsed);
              }
            }
          } catch (e) {}

          const savedDate = localStorage.getItem(`vrimae_ai_prompts_date_${user.id}`);
          if (savedDate === todayDate) {
            const count = parseInt(localStorage.getItem(`vrimae_ai_prompts_count_${user.id}`) || '0');
            setPromptsUsedToday(count);
          } else {
            localStorage.setItem(`vrimae_ai_prompts_date_${user.id}`, todayDate);
            localStorage.setItem(`vrimae_ai_prompts_count_${user.id}`, '0');
            setPromptsUsedToday(0);
          }
        }
      } catch (error) {
        console.error("Error loading initial data", error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const initChat = async () => {
    if (!geminiKey) {
      setChatError('API Key belum diatur. Silakan tambahkan Google Gemini API Key di halaman Pengaturan.');
      return false;
    }
    if (!chatSession) {
      try {
        const session = await createChatSession(geminiKey, transactions, inventory, messages, userName);
        setChatSession(session);
        return session;
      } catch (err: any) {
        const errorMessage = err.message || '';
        if (errorMessage.toLowerCase().includes('quota') || errorMessage.includes('429')) {
          setChatError('Batas penggunaan AI (Quota) harian dari Google telah habis. Silakan coba lagi besok hari.');
        } else {
          setChatError(errorMessage || 'Terjadi kesalahan saat memulai AI.');
        }
        return false;
      }
    }
    return chatSession;
  };

  const handleClearChat = () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus seluruh riwayat obrolan ini? AI akan melupakan konteks sebelumnya.')) {
      setMessages([]);
      localStorage.removeItem(`vrimae_ai_chat_history_${userId}`);
      localStorage.removeItem(`vrimae_ai_chat_time_${userId}`);
      setChatSession(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatLoading) return;
    
    setIsChatLoading(true);
    setChatError('');

    if (promptsUsedToday >= dailyPromptLimit) {
      if (!isApproved) {
        setChatError(`Anda telah mencapai batas ${dailyPromptLimit} pertanyaan gratis hari ini. Silakan hubungi admin untuk Upgrade ke Pro agar limit Anda ditambah!`);
      } else {
        setChatError(`Anda telah mencapai batas maksimal ${dailyPromptLimit} pertanyaan AI hari ini.`);
      }
      setIsChatLoading(false);
      return;
    }

    const session = await initChat();
    if (!session) {
      setIsChatLoading(false);
      return;
    }

    const userText = inputMessage.trim();
    setInputMessage('');
    setChatError('');
    
    let newMessagesAfterUser = [...messages, { role: 'user' as const, text: userText }];
    if (newMessagesAfterUser.length > 10) newMessagesAfterUser = newMessagesAfterUser.slice(-10);
    
    setMessages(newMessagesAfterUser);
    localStorage.setItem(`vrimae_ai_chat_history_${userId}`, JSON.stringify(newMessagesAfterUser));
    localStorage.setItem(`vrimae_ai_chat_time_${userId}`, new Date().toISOString());
    
    setIsChatLoading(true);

    try {
      const result = await session.sendMessage(userText);
      const response = await result.response;
      
      let newMessagesAfterModel = [...newMessagesAfterUser, { role: 'model' as const, text: response.text() }];
      if (newMessagesAfterModel.length > 10) newMessagesAfterModel = newMessagesAfterModel.slice(-10);
      
      setMessages(newMessagesAfterModel);
      localStorage.setItem(`vrimae_ai_chat_history_${userId}`, JSON.stringify(newMessagesAfterModel));
      localStorage.setItem(`vrimae_ai_chat_time_${userId}`, new Date().toISOString());
      
      const newCount = promptsUsedToday + 1;
      setPromptsUsedToday(newCount);
      localStorage.setItem(`vrimae_ai_prompts_count_${userId}`, newCount.toString());
    } catch (err: any) {
      const errorMessage = err.message || '';
      if (errorMessage.toLowerCase().includes('quota') || errorMessage.includes('429')) {
        setChatError('Batas penggunaan AI (Quota) harian dari Google telah habis. Silakan coba lagi besok hari.');
      } else if (errorMessage.includes('503') || errorMessage.toLowerCase().includes('overloaded')) {
        setChatError('Server AI sedang penuh (High Demand). Silakan coba lagi dalam beberapa saat.');
      } else if (errorMessage.includes('fetch')) {
        setChatError('Gagal menghubungi server AI. Periksa koneksi internet Anda atau coba lagi nanti.');
      } else {
        setChatError(errorMessage || 'Terjadi kesalahan jaringan saat menghubungi AI.');
      }
    } finally {
      setIsChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="fade-in" style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
          <Lock size={36} style={{ color: '#8B5CF6' }} />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
          Vrimae AI Assistant <Crown size={28} style={{ color: '#8B5CF6' }} />
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', maxWidth: '500px', marginBottom: '2rem', lineHeight: 1.6 }}>
          Fitur ini terkunci. Dapatkan asisten bisnis pintar yang siap membantu Anda kapan saja dengan Upgrade ke paket Pro.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 65px)', maxWidth: '900px', margin: '0 auto', position: 'relative', background: 'var(--color-bg)' }}>
      
      {/* Header (Gemini Minimalist) */}
      <div style={{ 
        padding: '1rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: 'transparent',
        zIndex: 10
      }}>
        <div style={{ width: '32px' }}></div> {/* Spacer */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Vrimae AI <Sparkles size={14} color="#a8c7fa" />
        </h2>
        <button 
          onClick={handleClearChat}
          title="Hapus Obrolan"
          style={{
            background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer',
            padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-expense)'}
          onMouseOut={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Chat Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'transparent'
      }}>
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1.5rem 1rem 7rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={28} style={{ color: '#a8c7fa' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>Halo.</h3>
                <p style={{ maxWidth: '350px', lineHeight: 1.6, fontSize: '0.9rem', margin: '0 auto', color: 'var(--color-text-secondary)' }}>Apa yang ingin Anda diskusikan hari ini?</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1.5rem', width: '100%', maxWidth: '500px' }}>
                {["Strategi diskon bulan ini?", "Barang apa yang mau habis?", "Analisis penjualan saya."].map((suggestion, i) => (
                  <button 
                    key={i}
                    onClick={() => setInputMessage(suggestion)}
                    style={{ padding: '0.6rem 1rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', fontSize: '0.85rem', color: 'var(--color-text)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#8B5CF6'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} style={{ 
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', 
              display: 'flex', 
              gap: '1rem',
              maxWidth: '85%',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}>

              
              <div style={{ 
                padding: '0.8rem 1.2rem', 
                borderRadius: '24px', 
                background: msg.role === 'user' ? 'var(--color-surface)' : 'transparent',
                color: 'var(--color-text)',
                border: msg.role === 'user' ? '1px solid var(--color-border)' : 'none',
                fontSize: '0.95rem',
                lineHeight: '1.6'
              }}>
                {msg.role === 'user' ? msg.text : renderMarkdown(msg.text)}
              </div>
            </div>
          ))}

          {isChatLoading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '1rem', maxWidth: '85%' }}>
              <div style={{ padding: '0.8rem 1.2rem', background: 'transparent', display: 'flex', alignItems: 'center' }}>
                <div className="gemini-loader">
                  <div className="gemini-dot"></div>
                  <div className="gemini-dot"></div>
                  <div className="gemini-dot"></div>
                  <div className="gemini-dot"></div>
                  <div className="gemini-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area (Gemini Style) */}
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          padding: '1rem', 
          background: 'linear-gradient(to bottom, transparent, var(--color-bg) 30%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', maxWidth: '750px' }}>
            {chatError && (
              <div style={{ 
                marginBottom: '0.5rem', 
                padding: '0.75rem 1rem', 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: '#ef4444', 
                borderRadius: '12px', 
                fontSize: '0.85rem', 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '0.75rem',
                wordBreak: 'break-word',
                lineHeight: '1.4',
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                <span style={{ flexShrink: 0, marginTop: '2px' }}>⚠️</span> 
                <span style={{ flex: 1 }}>{chatError}</span>
              </div>
            )}
            <form onSubmit={handleSendMessage} style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              background: 'var(--color-surface)', 
              borderRadius: '32px', 
              padding: '0.5rem 0.5rem 0.5rem 1.5rem',
              border: '1px solid var(--color-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}>
              <input 
                type="text" 
                placeholder="Tanyakan Vrimae AI"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isChatLoading}
                style={{ 
                  flex: 1, 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--color-text)', 
                  outline: 'none',
                  fontSize: '0.95rem',
                  lineHeight: '1.5'
                }}
              />
              <button 
                type="submit" 
                disabled={isChatLoading || !inputMessage.trim()}
                style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%', 
                  background: 'transparent',
                  color: inputMessage.trim() ? '#a8c7fa' : '#5f6368', 
                  border: 'none',
                  cursor: inputMessage.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistant;
