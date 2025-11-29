/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { zoomTools } from './tools';
import { customerSupportTools } from './tools/customer-support';
import { navigationSystemTools } from './tools/navigation-system';
import { personalAssistantTools } from './tools/personal-assistant';
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

/**
 * Settings
 */
export type MediaMode = 'youtube' | 'zoom' | 'audio';

export interface ZoomConfig {
  meetingId: string;
  passcode: string;
  userName: string;
  joinUrl: string;
}

export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  mediaMode: MediaMode;
  mediaVolume: number;
  youtubeUrl: string;
  audioUrl: string;
  zoomConfig: ZoomConfig;
  zoomCredentials: { clientId: string; clientSecret: string };
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setMediaMode: (mode: MediaMode) => void;
  setMediaVolume: (volume: number) => void;
  setYoutubeUrl: (url: string) => void;
  setAudioUrl: (url: string) => void;
  setZoomConfig: (config: Partial<ZoomConfig>) => void;
  setZoomCredentials: (creds: { clientId: string; clientSecret: string }) => void;
}>(set => ({
  systemPrompt: `Your job is to translate the text transcribe by the webspeech into the users chosen language output eg. [Dutch Flemish] and natively read aloud in a warm highly motivated, faithfully convicted style of voice and tone. You are not allowed to interact of comment, including converse at any given time. Your only task is to translate and read aloud, Now wait for the text and start continuesly..`,
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  mediaMode: 'youtube',
  mediaVolume: 0.5,
  youtubeUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  audioUrl: '',
  zoomConfig: {
    meetingId: '',
    passcode: '',
    userName: 'AI Assistant',
    joinUrl: '',
  },
  zoomCredentials: {
    clientId: 'VCMkJFWDQPGQb0_gtAeehQ',
    clientSecret: 'EkE38ouAyCD4ETvNzsyHu0zObMD4jv6z',
  },
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
  setMediaMode: mediaMode => set({ mediaMode }),
  setMediaVolume: mediaVolume => set({ mediaVolume }),
  setYoutubeUrl: youtubeUrl => set({ youtubeUrl }),
  setAudioUrl: audioUrl => set({ audioUrl }),
  setZoomConfig: config =>
    set(state => ({ zoomConfig: { ...state.zoomConfig, ...config } })),
  setZoomCredentials: creds => set({ zoomCredentials: creds }),
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  activeTab: 'settings' | 'integrations' | 'transcription';
  isProcessing: boolean;
  toggleSidebar: () => void;
  setActiveTab: (tab: 'settings' | 'integrations' | 'transcription') => void;
  setProcessing: (isProcessing: boolean) => void;
}>(set => ({
  isSidebarOpen: true,
  activeTab: 'settings',
  isProcessing: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  setActiveTab: activeTab => set({ activeTab }),
  setProcessing: isProcessing => set({ isProcessing }),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}

export type Template = 'customer-support' | 'personal-assistant' | 'navigation-system';

export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: zoomTools,
  template: 'customer-support',
  setTemplate: (template: Template) => {
    set({ template });
    switch (template) {
      case 'customer-support':
        set({ tools: customerSupportTools });
        break;
      case 'personal-assistant':
        set({ tools: personalAssistantTools });
        break;
      case 'navigation-system':
        set({ tools: navigationSystemTools });
        break;
    }
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  turns: [],
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) =>
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    })),
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [] }),
}));

/**
 * Transcription & Topic Detection
 */
export interface TranscriptEntry {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: string;
  topic?: string;
  language: string;
  speaker: string;
}

const detectTopic = (text: string): string | undefined => {
  const lower = text.toLowerCase();
  if (lower.includes('zoom') || lower.includes('meet') || lower.includes('call') || lower.includes('join')) return 'Coordination';
  if (lower.includes('code') || lower.includes('function') || lower.includes('bug') || lower.includes('api')) return 'Development';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('buy') || lower.includes('sell')) return 'Business';
  if (lower.includes('hello') || lower.includes('hi ') || lower.includes('bye')) return 'Casual';
  return undefined;
};

export type TranscriptionProvider = 'web_speech' | 'assembly_ai';

export const useTranscriptionStore = create<{
  entries: TranscriptEntry[];
  isListening: boolean;
  language: string;
  provider: TranscriptionProvider;
  audioSource: string; // 'system' or deviceId
  audioDevices: MediaDeviceInfo[];
  addEntry: (text: string, isFinal: boolean, lang: string, speaker?: string) => void;
  updateLastEntry: (text: string) => void;
  setListening: (listening: boolean) => void;
  setLanguage: (lang: string) => void;
  setProvider: (provider: TranscriptionProvider) => void;
  setAudioSource: (source: string) => void;
  setAudioDevices: (devices: MediaDeviceInfo[]) => void;
  clearEntries: () => void;
}>((set, get) => ({
  entries: [],
  isListening: false,
  language: 'auto',
  provider: 'assembly_ai',
  audioSource: 'system',
  audioDevices: [],
  setListening: (isListening) => set({ isListening }),
  setLanguage: (language) => set({ language }),
  setProvider: (provider) => set({ provider }),
  setAudioSource: (audioSource) => set({ audioSource }),
  setAudioDevices: (audioDevices) => set({ audioDevices }),
  clearEntries: () => set({ entries: [] }),
  addEntry: (text, isFinal, lang, speaker = 'Speaker') => set(state => {
    const topic = isFinal ? detectTopic(text) : undefined;
    const newEntry: TranscriptEntry = {
      id: Math.random().toString(36).substring(7),
      text,
      isFinal,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      topic,
      language: lang,
      speaker
    };
    
    const lastEntry = state.entries[state.entries.length - 1];
    if (lastEntry && !lastEntry.isFinal) {
      const updatedEntries = [...state.entries];
      updatedEntries[state.entries.length - 1] = newEntry;
      return { entries: updatedEntries };
    }
    
    return { entries: [...state.entries, newEntry] };
  }),
  updateLastEntry: (text) => set(state => {
     if (state.entries.length === 0) return state;
     const updatedEntries = [...state.entries];
     const lastIdx = updatedEntries.length - 1;
     updatedEntries[lastIdx] = { 
       ...updatedEntries[lastIdx], 
       text,
       topic: detectTopic(text) 
     };
     return { entries: updatedEntries };
  })
}));