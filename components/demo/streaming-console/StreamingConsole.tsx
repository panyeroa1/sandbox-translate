/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useState } from 'react';
import { Modality } from '@google/genai';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useSettings, useTools } from '@/lib/state';
import { KJUR } from 'jsrsasign';

function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper to load external scripts dynamically
const loadScript = (url: string) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.body.appendChild(script);
  });
};

const loadStyles = (url: string) => {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
}

// Generate Zoom Signature Client-Side (For Sandbox Demo Purpose Only)
const generateSignature = (sdkKey: string, sdkSecret: string, meetingNumber: string, role: number) => {
  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const oHeader = { alg: 'HS256', typ: 'JWT' };
  const oPayload = {
    sdkKey: sdkKey,
    mn: meetingNumber,
    role: role,
    iat: iat,
    exp: exp,
    appKey: sdkKey,
    tokenExp: exp
  };
  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);
  const sJWT = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, sdkSecret);
  return sJWT;
};

export default function StreamingConsole() {
  const { setConfig, volume, client } = useLiveAPIContext();
  const { systemPrompt, voice, mediaMode, youtubeUrl, audioUrl, zoomConfig, zoomCredentials, setZoomConfig, setMediaMode } = useSettings();
  const { tools } = useTools();
  const zoomRootRef = useRef<HTMLDivElement>(null);
  const [zoomClient, setZoomClient] = useState<any>(null);
  const [zoomError, setZoomError] = useState<string | null>(null);

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

  // Handle Tool Calls (e.g., join_meeting)
  useEffect(() => {
    const onToolCall = (toolCall: any) => {
      // We only intercept to update state, the actual response is handled in useLiveApi or we can do it here.
      // The context handles the response, we just listen for side effects.
      // However, useLiveApi intercepts toolcalls to send "ok".
      // We need to look for specific function names to trigger UI changes.
      for (const fc of toolCall.functionCalls) {
        if (fc.name === 'join_meeting') {
          const { meetingId, passcode, userName } = fc.args;
          setZoomConfig({ 
            meetingId: meetingId || zoomConfig.meetingId, 
            passcode: passcode || zoomConfig.passcode, 
            userName: userName || zoomConfig.userName 
          });
          setMediaMode('zoom');
        }
      }
    };
    client.on('toolcall', onToolCall);
    return () => {
      client.off('toolcall', onToolCall);
    };
  }, [client, setZoomConfig, setMediaMode, zoomConfig]);


  // Initialize Zoom SDK
  useEffect(() => {
    if (mediaMode === 'zoom' && zoomRootRef.current) {
        const initZoom = async () => {
            try {
                // Load dependencies
                loadStyles('https://source.zoom.us/embedded/3.10.0/lib/zoom-meeting-embedded-3.10.0.css');
                await loadScript('https://source.zoom.us/embedded/3.10.0/lib/zoom-meeting-embedded-3.10.0.min.js');

                const ZoomMtgEmbedded = (window as any).ZoomMtgEmbedded;
                if (!ZoomMtgEmbedded) return;

                const client = ZoomMtgEmbedded.createClient();
                setZoomClient(client);
                
                // Initialize
                const meetingSDKElement = document.getElementById('meetingSDKElement');
                if(!meetingSDKElement) return;

                await client.init({
                    zoomAppRoot: meetingSDKElement,
                    language: 'en-US',
                });
            } catch (err: any) {
                console.error("Zoom Init Error", err);
                setZoomError("Failed to load Zoom SDK. Check console.");
            }
        };
        initZoom();
    }
    
    // Cleanup on unmount or mode switch
    return () => {
        if (zoomClient) {
            // Note: Embedded client doesn't have a clean destroy method in all versions,
            // but removing the DOM element usually resets it.
            setZoomClient(null);
        }
    }
  }, [mediaMode]);

  // Join Meeting Trigger
  useEffect(() => {
    if (mediaMode === 'zoom' && zoomClient && zoomConfig.meetingId && zoomCredentials.clientId && zoomCredentials.clientSecret) {
        try {
            const signature = generateSignature(
                zoomCredentials.clientId,
                zoomCredentials.clientSecret,
                zoomConfig.meetingId,
                0 // 0 for participant, 1 for host
            );

            zoomClient.join({
                sdkKey: zoomCredentials.clientId,
                signature: signature,
                meetingNumber: zoomConfig.meetingId,
                password: zoomConfig.passcode,
                userName: zoomConfig.userName,
            }).catch((e: any) => {
                console.error(e);
                setZoomError(e.reason || "Join Failed");
            });
        } catch (e) {
            setZoomError("Error generating signature or joining.");
        }
    }
  }, [zoomClient, zoomConfig, zoomCredentials, mediaMode]);


  const youtubeId = extractYouTubeId(youtubeUrl) || 'jfKfPfyJRdk';

  return (
    <div className="zoom-viewport">
      
      {mediaMode === 'youtube' && (
        <div className="youtube-embed-container">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ pointerEvents: 'none' }} 
          ></iframe>
        </div>
      )}

      {mediaMode === 'zoom' && (
        <div className="zoom-interface-container" style={{background: 'black', position: 'relative'}}>
           {(!zoomCredentials.clientId || !zoomCredentials.clientSecret) ? (
               <div style={{
                   display: 'flex', 
                   flexDirection: 'column', 
                   alignItems: 'center', 
                   justifyContent: 'center', 
                   height: '100%', 
                   color: 'var(--gray-300)',
                   gap: '16px'
                }}>
                   <span className="icon" style={{fontSize: '48px'}}>lock</span>
                   <p>Please enter Zoom Client ID & Secret in Integrations Settings.</p>
               </div>
           ) : (
                <div id="meetingSDKElement" style={{width: '100%', height: '100%'}} ref={zoomRootRef}>
                    {/* Zoom SDK renders here */}
                </div>
           )}
           {zoomError && (
               <div style={{position: 'absolute', top: 20, left: 20, background: 'red', color: 'white', padding: '10px', borderRadius: '4px', zIndex: 1000}}>
                   Error: {zoomError}
               </div>
           )}
        </div>
      )}

      {mediaMode === 'audio' && (
         <div className="audio-player-container">
            <div className="audio-visualizer">
               {Array.from({ length: 20 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="bar"
                    style={{ 
                       height: `${20 + Math.random() * 80 * (volume + 0.1)}%`,
                       animationDelay: `${i * 0.05}s` 
                    }}
                  ></div>
               ))}
            </div>
            <div className="audio-info">
              <span className="icon">music_note</span>
              <span>Audio Stream Active</span>
            </div>
            {audioUrl && (
              <audio 
                id="integrated-audio-player"
                src={audioUrl} 
                autoPlay 
                loop 
                controls 
                crossOrigin="anonymous"
                className="native-audio-player"
              />
            )}
         </div>
      )}

      {/* Shared Active Speaker Overlay for Non-Zoom Modes */}
      {mediaMode !== 'zoom' && (
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
      )}

    </div>
  );
}