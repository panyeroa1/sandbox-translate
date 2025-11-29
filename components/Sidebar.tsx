/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, MediaMode, useTranscriptionStore, TranscriptionProvider } from '@/lib/state';
import c from 'classnames';
import { DEFAULT_LIVE_API_MODEL, AVAILABLE_VOICES, TRANSLATION_LANGUAGES } from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useState, useEffect, useRef } from 'react';
import ToolEditorModal from './ToolEditorModal';
import { AssemblyAIClient } from '@/lib/assembly-ai-client';

const AVAILABLE_MODELS = [
  DEFAULT_LIVE_API_MODEL
];

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab, setProcessing } = useUI();
  const { 
    systemPrompt, 
    model, 
    voice, 
    mediaMode,
    youtubeUrl,
    audioUrl,
    zoomConfig,
    zoomCredentials,
    setSystemPrompt, 
    setModel, 
    setVoice,
    setMediaMode,
    setYoutubeUrl,
    setAudioUrl,
    setZoomConfig,
    setZoomCredentials
  } = useSettings();
  const { tools, toggleTool, addTool, removeTool, updateTool } = useTools();
  const { connected, client: liveClient, connect } = useLiveAPIContext();
  const { 
    entries, 
    isListening, 
    language, 
    provider,
    audioSource,
    audioDevices,
    setListening, 
    setLanguage, 
    setProvider,
    setAudioSource,
    setAudioDevices,
    addEntry, 
    clearEntries 
  } = useTranscriptionStore();

  const [editingTool, setEditingTool] = useState<FunctionCall | null>(null);
  const recognitionRef = useRef<any>(null);
  const assemblyClientRef = useRef<AssemblyAIClient | null>(null);

  // Helper to parse Zoom URL
  const handleZoomLinkChange = (url: string) => {
     let meetingId = '';
     let passcode = '';
     const idMatch = url.match(/(?:\/j\/|\/wc\/|\/my\/)(\d+)/);
     if (idMatch) meetingId = idMatch[1];
     const pwdMatch = url.match(/[?&]pwd=([^#&]+)/);
     if (pwdMatch) passcode = pwdMatch[1];

     setZoomConfig({ 
        joinUrl: url,
        meetingId: meetingId || zoomConfig.meetingId,
        passcode: passcode || zoomConfig.passcode 
     });
  };

  // Enumerate Audio Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(inputs);
      } catch (e) {
        console.error("Error enumerating devices:", e);
      }
    };
    if (activeTab === 'transcription') {
       getDevices();
       navigator.mediaDevices.addEventListener('devicechange', getDevices);
    }
    return () => {
       navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }
  }, [activeTab, setAudioDevices]);


  // Initialize Speech Recognition (Web Speech API) - Only for default source/mic fallback
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab === 'transcription' && provider === 'web_speech') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        if (language !== 'auto') {
            recognition.lang = language;
        }

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const finalText = event.results[i][0].transcript;
              addEntry(finalText, true, language, 'You');
              
              if (connected && liveClient) {
                 liveClient.send([{ text: finalText }]);
                 setProcessing(true);
              }
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (interimTranscript) {
             addEntry(interimTranscript, false, language, 'You');
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') return;
          console.error("Speech recognition error", event.error);
          if (event.error === 'not-allowed') setListening(false);
        };

        recognition.onend = () => {
          if (useTranscriptionStore.getState().isListening && useTranscriptionStore.getState().provider === 'web_speech') {
             try { recognition.start(); } catch(e) {}
          }
        };

        recognitionRef.current = recognition;
      }
    } else {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            try { recognitionRef.current.stop(); } catch(e) {}
            recognitionRef.current = null;
        }
    }
  }, [activeTab, language, addEntry, provider, connected, liveClient, setProcessing]);

  // Handle Toggle Listening logic (Start/Stop)
  const toggleRecording = async () => {
    if (!isListening) {
      // Auto-connect to Gemini Live if not already connected
      if (!connected) {
         connect();
      }

      setListening(true);
      
      // Web Speech API Logic (only if manually forced, otherwise we use AssemblyAI for flexibility)
      if (provider === 'web_speech') {
          try { recognitionRef.current?.start(); } catch(e) {}
      }

      // AssemblyAI Logic (Handles both System and Specific Mics)
      if (provider === 'assembly_ai') {
          if (!assemblyClientRef.current) {
              const client = new AssemblyAIClient();
              client.on('transcript', (data: { text: string; isFinal: boolean; speaker?: string }) => {
                  // Determine speaker label based on source
                  let speakerLabel = data.speaker ? `Speaker ${data.speaker}` : 'Speaker';
                  if (audioSource === 'system') speakerLabel = 'System';
                  else if (!data.speaker) speakerLabel = 'You';

                  addEntry(data.text, data.isFinal, language, speakerLabel);
                  
                  if (data.isFinal && liveClient) {
                      // Note: liveClient might be connecting, but usually safe to send once established.
                      // The bridge checks state inside context or client usually.
                      if (liveClient.status === 'connected') {
                          liveClient.send([{ text: data.text }]);
                          setProcessing(true);
                      }
                  }
              });
              client.on('error', (err) => {
                  console.error('AssemblyAI Error:', err);
                  setListening(false);
              });
              
              let stream: MediaStream | undefined;

              // SYSTEM AUDIO / INTEGRATED MEDIA
              if (audioSource === 'system') {
                  
                  if (mediaMode === 'audio') {
                      const audioEl = document.getElementById('integrated-audio-player') as HTMLAudioElement;
                      if (audioEl) {
                          if ((audioEl as any).captureStream) stream = (audioEl as any).captureStream();
                          else if ((audioEl as any).mozCaptureStream) stream = (audioEl as any).mozCaptureStream();
                      }
                  }

                  if (!stream) {
                       try {
                         const displayMedia = await navigator.mediaDevices.getDisplayMedia({ 
                            video: true,
                            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false } as any
                         });
                         
                         if (displayMedia.getAudioTracks().length > 0) {
                             stream = new MediaStream(displayMedia.getAudioTracks());
                             displayMedia.getVideoTracks().forEach(track => track.stop());
                         } else {
                             alert("No audio shared! Please check 'Share tab audio'.");
                             displayMedia.getTracks().forEach(track => track.stop());
                             setListening(false);
                             return;
                         }
                       } catch(err) {
                         console.warn("Display media cancelled", err);
                         setListening(false);
                         return;
                       }
                  }
                  // Start without deviceId (using the stream)
                  client.connect(16000, language, stream);
              } 
              else {
                  // SPECIFIC DEVICE (Microphone/Bluetooth)
                  // Pass the deviceId to getUserMedia inside client
                  // Note: We don't pass a stream here, we let the client/recorder handle the getUserMedia with deviceId
                  // However, our AssemblyAIClient.connect doesn't take deviceId yet, we need to hack it or update it.
                  // We updated AudioRecorder to take deviceId. We need to pass it down.
                  // Updating AssemblyAIClient locally or assuming the stream creation happens outside?
                  // Best practice: Create stream here and pass it.
                  try {
                       const micStream = await navigator.mediaDevices.getUserMedia({ 
                           audio: { deviceId: { exact: audioSource } } 
                       });
                       client.connect(16000, language, micStream);
                  } catch (e) {
                      console.error("Failed to get specific device stream", e);
                      // Fallback to default
                      client.connect(16000, language);
                  }
              }
              
              assemblyClientRef.current = client;
          }
      }
    } else {
      setListening(false);
      
      if (provider === 'web_speech') {
          try { recognitionRef.current?.stop(); } catch(e) {}
      }
      if (provider === 'assembly_ai') {
          if (assemblyClientRef.current) {
              assemblyClientRef.current.disconnect();
              assemblyClientRef.current = null;
          }
      }
    }
  };

  useEffect(() => {
    return () => {
       if (recognitionRef.current && provider !== 'web_speech') {
            recognitionRef.current.onend = null;
            try { recognitionRef.current.stop(); } catch(e) {}
       }
       if (assemblyClientRef.current && provider !== 'assembly_ai') {
           assemblyClientRef.current.disconnect();
           assemblyClientRef.current = null;
       }
    }
  }, [provider]);

  const handleSaveTool = (updatedTool: FunctionCall) => {
    if (editingTool) updateTool(editingTool.name, updatedTool);
    setEditingTool(null);
  };

  return (
    <>
      <aside className={c('sidebar', { open: isSidebarOpen })}>
        <div className="sidebar-header">
          <h3>Configuration</h3>
          <button onClick={toggleSidebar} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        
        <div className="sidebar-tabs">
          <button 
            className={c('tab-button', { active: activeTab === 'settings' })}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
          <button 
            className={c('tab-button', { active: activeTab === 'integrations' })}
            onClick={() => setActiveTab('integrations')}
          >
            Integrations
          </button>
          <button 
            className={c('tab-button', { active: activeTab === 'transcription' })}
            onClick={() => setActiveTab('transcription')}
          >
            Transcription
          </button>
        </div>

        <div className="sidebar-content">
          {activeTab === 'settings' && (
            <>
              <div className="sidebar-section">
                <fieldset disabled={connected}>
                  <label>
                    System Prompt
                    <textarea
                      value={systemPrompt}
                      onChange={e => setSystemPrompt(e.target.value)}
                      rows={10}
                    />
                  </label>
                  <label>
                    Model
                    <select value={model} onChange={e => setModel(e.target.value)}>
                      {AVAILABLE_MODELS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Voice
                    <select value={voice} onChange={e => setVoice(e.target.value)}>
                      {AVAILABLE_VOICES.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </div>
              <div className="sidebar-section">
                <h4 className="sidebar-section-title">Tools</h4>
                <div className="tools-list">
                  {tools.map(tool => (
                    <div key={tool.name} className="tool-item">
                      <label className="tool-checkbox-wrapper">
                        <input
                          type="checkbox"
                          checked={tool.isEnabled}
                          onChange={() => toggleTool(tool.name)}
                          disabled={connected}
                        />
                        <span className="checkbox-visual"></span>
                      </label>
                      <label className="tool-name-text">{tool.name}</label>
                      <div className="tool-actions">
                        <button onClick={() => setEditingTool(tool)} disabled={connected}>
                          <span className="icon">edit</span>
                        </button>
                        <button onClick={() => removeTool(tool.name)} disabled={connected}>
                          <span className="icon">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addTool} className="add-tool-button" disabled={connected}>
                  <span className="icon">add</span> Add function call
                </button>
              </div>
            </>
          )}

          {activeTab === 'integrations' && (
            <div className="sidebar-section">
              <label>
                Active Integration
                <select 
                  value={mediaMode} 
                  onChange={e => setMediaMode(e.target.value as MediaMode)}
                >
                  <option value="youtube">YouTube Embed</option>
                  <option value="zoom">Zoom Integration</option>
                  <option value="audio">Audio Stream</option>
                </select>
              </label>

              {mediaMode === 'youtube' && (
                 <div className="integration-config fade-in">
                    <h4 className="sidebar-section-title">YouTube Configuration</h4>
                    <label>
                      Video URL
                      <input 
                        type="text" 
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                      />
                    </label>
                 </div>
              )}

              {mediaMode === 'zoom' && (
                 <div className="integration-config fade-in">
                    <h4 className="sidebar-section-title">Zoom Configuration</h4>
                     <label>
                      Zoom Invite Link
                      <input 
                        type="text" 
                        value={zoomConfig.joinUrl}
                        onChange={(e) => handleZoomLinkChange(e.target.value)}
                      />
                    </label>
                    <label>
                      Display Name
                      <input 
                        type="text" 
                        value={zoomConfig.userName}
                        onChange={(e) => setZoomConfig({ userName: e.target.value })}
                      />
                    </label>
                    <details>
                        <summary style={{color: 'var(--gray-500)', fontSize: '12px', cursor: 'pointer', margin: '10px 0'}}>
                            Advanced: Zoom SDK Credentials
                        </summary>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px'}}>
                            <label>Client ID <input type="text" value={zoomCredentials.clientId} onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientId: e.target.value })} /></label>
                            <label>Client Secret <input type="text" value={zoomCredentials.clientSecret} onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientSecret: e.target.value })} /></label>
                         </div>
                    </details>
                 </div>
              )}

              {mediaMode === 'audio' && (
                 <div className="integration-config fade-in">
                    <h4 className="sidebar-section-title">Audio Configuration</h4>
                    <label>
                      Audio Stream URL
                      <input 
                        type="text" 
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                      />
                    </label>
                 </div>
              )}
            </div>
          )}

          {activeTab === 'transcription' && (
            <div className="sidebar-section full-height">
              
              <label>
                Audio Input
                <select
                    value={audioSource}
                    onChange={e => {
                        setListening(false);
                        setAudioSource(e.target.value);
                        // Force AssemblyAI when specific inputs are used
                        setProvider('assembly_ai');
                    }}
                >
                    <optgroup label="System">
                       <option value="system">System Audio (Share Tab)</option>
                    </optgroup>
                    <optgroup label="Microphones & Devices">
                       {audioDevices.map((device, i) => (
                           <option key={device.deviceId || i} value={device.deviceId}>
                               {device.label || `Microphone ${i + 1}`}
                           </option>
                       ))}
                    </optgroup>
                </select>
              </label>

              <div className="transcription-controls">
                <button 
                   className={c('rec-button', { recording: isListening })}
                   onClick={toggleRecording}
                >
                  <span className="icon">
                     {isListening ? 'stop_circle' : 'radio_button_checked'}
                  </span>
                  {isListening ? 'Stop' : 'Start'}
                </button>
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="lang-select"
                  title="Source Language"
                >
                  {TRANSLATION_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
                <button onClick={clearEntries} className="clear-button">
                  <span className="icon">delete_sweep</span>
                </button>
              </div>
              
              <div style={{fontSize: '11px', color: 'var(--gray-500)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                   <span className="icon" style={{fontSize: '14px'}}>
                      {audioSource === 'system' ? 'computer' : 'mic'}
                   </span>
                   <span>
                      {audioSource === 'system' 
                        ? 'Capturing Device Audio' 
                        : (audioDevices.find(d => d.deviceId === audioSource)?.label || 'Microphone')}
                   </span>
                   {connected && <span style={{color: 'var(--Green-500)', marginLeft: 'auto', fontWeight: 'bold'}}>LIVE</span>}
              </div>
              
              <div className="transcript-log">
                 {entries.length === 0 && (
                   <div className="empty-state">
                     <span className="icon">graphic_eq</span>
                     <p>Ready to transcribe</p>
                     {audioSource === 'system' && (
                        <p style={{fontSize: '11px', color: 'var(--Blue-400)', maxWidth: '200px'}}>
                           Select the tab playing audio in the popup.
                        </p>
                     )}
                   </div>
                 )}
                 {entries.map((entry, idx) => (
                    <div key={idx} className={c('transcript-entry', { final: entry.isFinal })}>
                      <div className="entry-header">
                        <div className="entry-meta">
                            <span className="lang-badge">{entry.language !== 'auto' ? entry.language.toUpperCase() : 'Detect'}</span>
                            <span className={c("source-icon", "material-symbols-outlined")}>
                                {entry.speaker === 'System' ? 'computer' : 'record_voice_over'}
                            </span>
                            <span className="speaker-name">{entry.speaker}</span>
                        </div>
                        <span className="timestamp">{entry.timestamp}</span>
                      </div>
                      {entry.topic && (
                          <div className="entry-topic-row">
                             <span className={c('topic-badge', entry.topic.toLowerCase())}>
                                {entry.topic}
                             </span>
                          </div>
                      )}
                      <p className="entry-text">{entry.text}</p>
                    </div>
                 ))}
              </div>
            </div>
          )}
        </div>
      </aside>
      {editingTool && (
        <ToolEditorModal
          tool={editingTool}
          onClose={() => setEditingTool(null)}
          onSave={handleSaveTool}
        />
      )}
    </>
  );
}