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
  youtubeUrl: string;
  audioUrl: string;
  zoomConfig: ZoomConfig;
  zoomCredentials: { clientId: string; clientSecret: string };
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setMediaMode: (mode: MediaMode) => void;
  setYoutubeUrl: (url: string) => void;
  setAudioUrl: (url: string) => void;
  setZoomConfig: (config: Partial<ZoomConfig>) => void;
  setZoomCredentials: (creds: { clientId: string; clientSecret: string }) => void;
}>(set => ({
  systemPrompt: `You are Eburon, a helpful AI assistant capable of joining Zoom meetings and interacting with media.`,
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  mediaMode: 'youtube',
  youtubeUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  audioUrl: '',
  zoomConfig: {
    meetingId: '',
    passcode: '',
    userName: 'AI Assistant',
    joinUrl: '',
  },
  zoomCredentials: {
    clientId: '',
    clientSecret: '',
  },
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
  setMediaMode: mediaMode => set({ mediaMode }),
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
  activeTab: 'settings' | 'integrations';
  toggleSidebar: () => void;
  setActiveTab: (tab: 'settings' | 'integrations') => void;
}>(set => ({
  isSidebarOpen: true,
  activeTab: 'settings',
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  setActiveTab: activeTab => set({ activeTab }),
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