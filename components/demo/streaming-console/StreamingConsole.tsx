/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState } from 'react';
import { LiveConnectConfig, Modality } from '@google/genai';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useSettings, useTools } from '@/lib/state';

export default function StreamingConsole() {
  const { client, setConfig, volume } = useLiveAPIContext();
  const { systemPrompt, voice } = useSettings();
  const { tools } = useTools();

  // Set the configuration for the Live API
  useEffect(() => {
    const enabledTools = tools
      .filter(tool => tool.isEnabled)
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      tools: enabledTools,
    };

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice]);

  return (
    <div className="zoom-viewport">
      {/* YouTube Embed as Background/Shared Content */}
      <div className="youtube-embed-container">
        <iframe
          width="100%"
          height="100%"
          src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&mute=1&controls=0&loop=1&playlist=jfKfPfyJRdk"
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ pointerEvents: 'none' }} 
        ></iframe>
      </div>

      {/* Active Speaker Visualizer Overlay */}
      <div className="active-speaker-overlay">
        <div 
          className="speaker-indicator"
          style={{
             transform: `scale(${1 + volume * 2})`,
             opacity: 0.5 + volume * 2
          }}
        >
          <span className="material-symbols-outlined icon">graphic_eq</span>
        </div>
        <div className="speaker-label">Eburon (AI)</div>
      </div>
    </div>
  );
}