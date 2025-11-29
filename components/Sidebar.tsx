/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, MediaMode, useTranscriptionStore } from '@/lib/state';
import c from 'classnames';
import { DEFAULT_LIVE_API_MODEL, AVAILABLE_VOICES } from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useState, useEffect, useRef } from 'react';
import ToolEditorModal from './ToolEditorModal';

const AVAILABLE_MODELS = [
  DEFAULT_LIVE_API_MODEL
];

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar, activeTab, setActiveTab } = useUI();
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
  const { connected } = useLiveAPIContext();
  const { 
    entries, 
    isListening, 
    language, 
    setListening, 
    setLanguage, 
    addEntry, 
    clearEntries 
  } = useTranscriptionStore();

  const [editingTool, setEditingTool] = useState<FunctionCall | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab === 'transcription') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              addEntry(event.results[i][0].transcript, true, language);
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (interimTranscript) {
             addEntry(interimTranscript, false, language);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error === 'not-allowed') {
            setListening(false);
          }
        };

        recognition.onend = () => {
          if (isListening) {
             try {
               recognition.start();
             } catch(e) { /* ignore already started */ }
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [activeTab, language, addEntry, isListening, setListening]);

  // Toggle Listening
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      if (isListening) {
        try { recognition.start(); } catch(e) {}
      } else {
        try { recognition.stop(); } catch(e) {}
      }
    }
    return () => {
       if (recognition) try { recognition.stop(); } catch(e) {}
    }
  }, [isListening]);


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
                      Client ID (SDK Key)
                      <input 
                        type="text" 
                        value={zoomCredentials.clientId}
                        onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientId: e.target.value })}
                        placeholder="Zoom Client ID" 
                      />
                    </label>
                    <label>
                      Client Secret
                      <input 
                        type="text" 
                        value={zoomCredentials.clientSecret}
                        onChange={(e) => setZoomCredentials({ ...zoomCredentials, clientSecret: e.target.value })}
                        placeholder="Zoom Client Secret" 
                      />
                    </label>
                    <hr style={{border: 'none', borderTop: '1px solid var(--gray-700)', margin: '10px 0'}} />
                    <label>
                      Meeting ID
                      <input 
                        type="text" 
                        value={zoomConfig.meetingId}
                        onChange={(e) => setZoomConfig({ meetingId: e.target.value })}
                        placeholder="123 456 7890" 
                      />
                    </label>
                    <label>
                      Passcode
                      <input 
                        type="text" 
                        value={zoomConfig.passcode}
                        onChange={(e) => setZoomConfig({ passcode: e.target.value })}
                        placeholder="Optional" 
                      />
                    </label>
                    <label>
                      Display Name
                      <input 
                        type="text" 
                        value={zoomConfig.userName}
                        onChange={(e) => setZoomConfig({ userName: e.target.value })}
                        placeholder="AI Agent" 
                      />
                    </label>
                    <p className="config-hint">
                      Requires Zoom Client ID & Secret to generate a signature locally for this sandbox.
                    </p>
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
              <div className="transcription-controls">
                <button 
                   className={c('rec-button', { recording: isListening })}
                   onClick={() => setListening(!isListening)}
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
                  <option value="en-US">EN (US)</option>
                  <option value="en-GB">EN (GB)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="nl-NL">Dutch</option>
                  <option value="tl-PH">Tagalog</option>
                </select>
                <button onClick={clearEntries} className="clear-button">
                  <span className="icon">delete_sweep</span>
                </button>
              </div>
              
              <div className="transcript-log">
                 {entries.length === 0 && (
                   <div className="empty-state">
                     <span className="icon">graphic_eq</span>
                     <p>Start recording to see real-time transcription.</p>
                   </div>
                 )}
                 {entries.map((entry, idx) => (
                    <div key={idx} className={c('transcript-entry', { final: entry.isFinal })}>
                      <div className="entry-header">
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
