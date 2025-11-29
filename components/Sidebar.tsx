/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, MediaMode, useTranscriptionStore, TranscriptionProvider, TranscriptionInput } from '@/lib/state';
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
  const { connected, client: liveClient } = useLiveAPIContext();
  const { 
    entries, 
    isListening, 
    language, 
    provider,
    transcriptionInput,
    setListening, 
    setLanguage, 
    setProvider,
    setTranscriptionInput,
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
     
     // Extract Meeting ID: matches /j/123456789 or /wc/123456789 or /my/123456789
     // Added /wc/ support as per user URL example
     const idMatch = url.match(/(?:\/j\/|\/wc\/|\/my\/)(\d+)/);
     if (idMatch) meetingId = idMatch[1];
     
     // Extract Passcode: matches ?pwd=...
     const pwdMatch = url.match(/[?&]pwd=([^#&]+)/);
     if (pwdMatch) passcode = pwdMatch[1];

     setZoomConfig({ 
        joinUrl: url,
        meetingId: meetingId || zoomConfig.meetingId,
        passcode: passcode || zoomConfig.passcode 
     });
  };

  // Initialize Speech Recognition (Web Speech API)
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab === 'transcription' && provider === 'web_speech') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        // Handle "Auto" language for Web Speech API by not setting lang (defaults to browser)
        if (language !== 'auto') {
            recognition.lang = language;
        }

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const finalText = event.results[i][0].transcript;
              addEntry(finalText, true, language, 'You');
              
              // BRIDGE TO GEMINI LIVE: Send text as input if connected
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
          // Ignore 'no-speech' errors as they are common when user is silent but still wants to record
          if (event.error === 'no-speech') {
            return;
          }
          console.error("Speech recognition error", event.error);
          if (event.error === 'not-allowed') {
            setListening(false);
          }
        };

        recognition.onend = () => {
          // Restart if we are still supposed to be listening (handles no-speech timeouts)
          if (useTranscriptionStore.getState().isListening && useTranscriptionStore.getState().provider === 'web_speech') {
             try {
               recognition.start();
             } catch(e) { /* ignore already started */ }
          }
        };

        recognitionRef.current = recognition;
      }
    } else {
        // Cleanup if switching providers or tabs
        if (recognitionRef.current) {
            recognitionRef.current.onend = null; // Prevent restart loop
            try { recognitionRef.current.stop(); } catch(e) {}
            recognitionRef.current = null;
        }
    }
  }, [activeTab, language, addEntry, provider, connected, liveClient, setProcessing]);

  // Handle Toggle Listening logic (Start/Stop)
  const toggleRecording = async () => {
    if (!isListening) {
      // START RECORDING
      setListening(true);
      
      // Web Speech API Logic (Source: Mic/Default Device)
      if (provider === 'web_speech') {
          try { recognitionRef.current?.start(); } catch(e) {}
      }

      // AssemblyAI Logic (Source: Manual Selection)
      if (provider === 'assembly_ai') {
          if (!assemblyClientRef.current) {
              const client = new AssemblyAIClient();
              client.on('transcript', (data: { text: string; isFinal: boolean; speaker?: string }) => {
                  const speakerLabel = data.speaker 
                      ? `Speaker ${data.speaker}` 
                      : (transcriptionInput === 'system' ? 'System' : 'Speaker');

                  addEntry(data.text, data.isFinal, language, speakerLabel);
                  
                  // BRIDGE TO GEMINI LIVE: Send text as input if connected
                  if (data.isFinal && connected && liveClient) {
                      liveClient.send([{ text: data.text }]);
                      setProcessing(true);
                  }
              });
              client.on('error', (err) => {
                  console.error('AssemblyAI Error:', err);
                  setListening(false);
              });
              
              let stream: MediaStream | undefined;

              // SYSTEM AUDIO / INTEGRATED MEDIA
              if (transcriptionInput === 'system') {
                  
                  // Try to capture Audio Element directly if in Audio Mode
                  if (mediaMode === 'audio') {
                      const audioEl = document.getElementById('integrated-audio-player') as HTMLAudioElement;
                      if (audioEl) {
                          if ((audioEl as any).captureStream) {
                            stream = (audioEl as any).captureStream();
                          } else if ((audioEl as any).mozCaptureStream) {
                            stream = (audioEl as any).mozCaptureStream();
                          }
                      }
                  }

                  // If not captured from DOM, fallback to Screen/Tab Share
                  // This is the primary method for YouTube Iframe and Zoom
                  if (!stream) {
                       try {
                         const displayMedia = await navigator.mediaDevices.getDisplayMedia({ 
                            video: true, // Video is required to get display media
                            audio: { 
                               echoCancellation: false, 
                               noiseSuppression: false, 
                               autoGainControl: false,
                               // @ts-ignore
                               suppressLocalAudioPlayback: false 
                            } 
                         });
                         
                         // Check if user shared audio
                         if (displayMedia.getAudioTracks().length > 0) {
                             stream = new MediaStream(displayMedia.getAudioTracks());
                             // Stop video track
                             displayMedia.getVideoTracks().forEach(track => track.stop());
                         } else {
                             alert("No audio shared! Please check 'Share tab audio' in the browser dialog.");
                             displayMedia.getTracks().forEach(track => track.stop());
                             setListening(false);
                             return;
                         }
    
                       } catch(err) {
                         console.warn("User cancelled display media selection or not supported.", err);
                         setListening(false);
                         return;
                       }
                  }
              }

              // MICROPHONE (Default if stream is undefined or input is 'mic')
              client.connect(16000, language, stream);
              assemblyClientRef.current = client;
          }
      }
    } else {
      // STOP RECORDING
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

  // Sync state with effect cleanup
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
    if (editingTool) {
      updateTool(editingTool.name, updatedTool);
    }
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
                      placeholder="Describe the role and personality of the AI..."
                    />
                  </label>
                  <label>
                    Model
                    <select value={model} onChange={e => setModel(e.target.value)}>
                      {AVAILABLE_MODELS.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Voice
                    <select value={voice} onChange={e => setVoice(e.target.value)}>
                      {AVAILABLE_VOICES.map(v => (
                        <option key={v} value={v}>
                          {v}
                        </option>
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
                          id={`tool-checkbox-${tool.name}`}
                          checked={tool.isEnabled}
                          onChange={() => toggleTool(tool.name)}
                          disabled={connected}
                        />
                        <span className="checkbox-visual"></span>
                      </label>
                      <label
                        htmlFor={`tool-checkbox-${tool.name}`}
                        className="tool-name-text"
                      >
                        {tool.name}
                      </label>
                      <div className="tool-actions">
                        <button
                          onClick={() => setEditingTool(tool)}
                          disabled={connected}
                          aria-label={`Edit ${tool.name}`}
                        >
                          <span className="icon">edit</span>
                        </button>
                        <button
                          onClick={() => removeTool(tool.name)}
                          disabled={connected}
                          aria-label={`Delete ${tool.name}`}
                        >
                          <span className="icon">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addTool}
                  className="add-tool-button"
                  disabled={connected}
                >
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
                        placeholder="https://www.youtube.com/watch?v=..." 
                      />
                    </label>
                    <p className="config-hint">Supports standard YouTube URLs.</p>
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
                        placeholder="Paste Zoom Invite Link here..." 
                      />
                    </label>
                    {/* Auto-extracted fields, now simplified */}
                    <div style={{display: 'flex', gap: '10px'}}>
                         <label style={{flex: 1}}>
                            Meeting ID
                            <input 
                                type="text" 
                                value={zoomConfig.meetingId}
                                readOnly
                                style={{opacity: 0.7}}
                            />
                        </label>
                        <label style={{flex: 1}}>
                            Passcode
                            <input 
                                type="text" 
                                value={zoomConfig.passcode}
                                readOnly
                                style={{opacity: 0.7}}
                            />
                        </label>
                    </div>

                    <label>
                      Display Name
                      <input 
                        type="text" 
                        value={zoomConfig.userName}
                        onChange={(e) => setZoomConfig({ userName: e.target.value })}
                        placeholder="AI Agent" 
                      />
                    </label>
                    
                     <details>
                        <summary style={{color: 'var(--gray-500)', fontSize: '12px', cursor: 'pointer', margin: '10px 0'}}>
                            Advanced: Zoom SDK Credentials
                        </summary>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px'}}>
                            <label>
                            Client ID
                            <input 
                                type="text" 
                                value={zoomCredentials.clientId}
                                onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientId: e.target.value })}
                            />
                            </label>
                            <label>
                            Client Secret
                            <input 
                                type="text" 
                                value={zoomCredentials.clientSecret}
                                onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientSecret: e.target.value })}
                            />
                            </label>
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
                        placeholder="https://example.com/stream.mp3" 
                      />
                    </label>
                    <p className="config-hint">Direct link to MP3/WAV/AAC stream.</p>
                 </div>
              )}

            </div>
          )}

          {activeTab === 'transcription' && (
            <div className="sidebar-section full-height">
              <label>
                Provider
                <select 
                   value={provider} 
                   onChange={e => {
                     setListening(false);
                     setProvider(e.target.value as TranscriptionProvider);
                   }}
                >
                  <option value="web_speech">Browser Native (Web Speech)</option>
                  <option value="assembly_ai">AssemblyAI (WebSocket)</option>
                </select>
              </label>

              {/* Audio Source Dropdown - Only for AssemblyAI */}
              {provider === 'assembly_ai' && (
                  <label>
                    Audio Source
                    <select
                        value={transcriptionInput}
                        onChange={e => {
                            setListening(false); // Stop if changing source
                            setTranscriptionInput(e.target.value as TranscriptionInput);
                        }}
                    >
                        <option value="mic">Microphone (Default)</option>
                        <option value="system">System Audio (Share Tab)</option>
                    </select>
                  </label>
              )}

              <div className="transcription-controls">
                <button 
                   className={c('rec-button', { recording: isListening })}
                   onClick={toggleRecording}
                >
                  <span className="icon">
                     {isListening ? 'stop_circle' : 'radio_button_checked'}
                  </span>
                  {isListening ? 'Stop' : 'Rec'}
                </button>
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="lang-select"
                >
                  {TRANSLATION_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                  ))}
                </select>
                <button onClick={clearEntries} className="clear-button">
                  <span className="icon">delete_sweep</span>
                </button>
              </div>
              
              {/* Audio Source Indicator */}
              <div style={{fontSize: '11px', color: 'var(--gray-500)', marginBottom: '8px', paddingLeft: '4px'}}>
                   Source: {provider === 'web_speech' 
                      ? 'Microphone (Browser Default)' 
                      : (transcriptionInput === 'system' ? 'Device Audio (Tab Share)' : 'Microphone')}
              </div>
              
              <div className="transcript-log">
                 {entries.length === 0 && (
                   <div className="empty-state">
                     <span className="icon">graphic_eq</span>
                     <p>Waiting for audio...</p>
                     {provider === 'assembly_ai' && transcriptionInput === 'system' && (
                        <p style={{fontSize: '11px', color: 'var(--Blue-400)', maxWidth: '200px'}}>
                           Ensure you select "Share Audio" in the browser dialog.
                        </p>
                     )}
                     {connected && <p style={{fontSize: '11px', color: 'var(--Green-500)', marginTop: '4px'}}>Gemini Translation Active</p>}
                   </div>
                 )}
                 {entries.map((entry, idx) => (
                    <div key={idx} className={c('transcript-entry', { final: entry.isFinal })}>
                      <div className="entry-header">
                        <span className="speaker-name">{entry.speaker}</span>
                        <span className="timestamp">{entry.timestamp}</span>
                        {entry.topic && (
                          <span className={c('topic-badge', entry.topic.toLowerCase())}>
                             {entry.topic}
                          </span>
                        )}
                      </div>
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