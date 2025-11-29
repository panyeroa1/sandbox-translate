/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, MediaMode } from '@/lib/state';
import c from 'classnames';
import { DEFAULT_LIVE_API_MODEL, AVAILABLE_VOICES } from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useState } from 'react';
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

  const [editingTool, setEditingTool] = useState<FunctionCall | null>(null);

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
        </div>

        <div className="sidebar-content">
          {activeTab === 'settings' ? (
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
          ) : (
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