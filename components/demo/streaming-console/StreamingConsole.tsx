/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useState } from 'react';
import { Modality } from '@google/genai';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useSettings, useTools, useUI } from '@/lib/state';
import { KJUR } from 'jsrsasign';
import cn from 'classnames';

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
  const { systemPrompt, voice, mediaMode, mediaVolume, youtubeUrl, audioUrl, zoomConfig, zoomCredentials, setZoomConfig, setMediaMode } = useSettings();
  const { isProcessing } = useUI();
  const { tools } = useTools();
  const zoomRootRef = useRef<HTMLDivElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const youtubeFrameRef = useRef<HTMLIFrameElement>(null);
  
  const [zoomClient, setZoomClient] = useState<any>(null);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<string>('');
  const captionTimeoutRef = useRef<number | null>(null);

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
      // Enable output transcription to capture the translated speech text
      outputAudioTranscription: {}, 
    };

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice]);

  // Handle Output Transcription (Captions)
  useEffect(() => {
    const onOutputTranscription = (text: string, isFinal: boolean) => {
        setCaptions(prev => {
             // If we just finished a sentence (was empty or previous was final?), maybe append space?
             // Simple accumulation strategy for demo
             if (!text) return prev;
             return prev + text;
        });

        if (isFinal) {
            // Clear captions after a delay when a sentence completes
            if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
            captionTimeoutRef.current = window.setTimeout(() => {
                setCaptions('');
            }, 5000); // Keep text for 5 seconds after finish
        } else {
             if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
        }
    };
    
    // Also listen for turn complete to clear? 
    // Sometimes outputTranscription isFinal comes before turnComplete.
    const onTurnComplete = () => {
         if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
         captionTimeoutRef.current = window.setTimeout(() => {
            setCaptions('');
         }, 5000);
    };

    client.on('outputTranscription', onOutputTranscription);
    client.on('turncomplete', onTurnComplete);

    return () => {
        client.off('outputTranscription', onOutputTranscription);
        client.off('turncomplete', onTurnComplete);
        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
    };
  }, [client]);

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
                // Load dependencies - using latest version
                loadStyles('https://source.zoom.us/3.10.1/css/bootstrap.css');
                loadStyles('https://source.zoom.us/3.10.1/css/react-select.css');
                await loadScript('https://source.zoom.us/3.10.1/lib/vendor/react.min.js');
                await loadScript('https://source.zoom.us/3.10.1/lib/vendor/react-dom.min.js');
                await loadScript('https://source.zoom.us/3.10.1/lib/vendor/redux.min.js');
                await loadScript('https://source.zoom.us/3.10.1/lib/vendor/redux-thunk.min.js');
                await loadScript('https://source.zoom.us/3.10.1/lib/vendor/lodash.min.js');
                await loadScript('https://source.zoom.us/3.10.1/index.js');

                const ZoomMtg = (window as any).ZoomMtg;
                if (!ZoomMtg) {
                    setZoomError("ZoomMtg not loaded");
                    return;
                }

                ZoomMtg.preLoadWasm();
                ZoomMtg.prepareWebSDK();
                
                const meetingSDKElement = document.getElementById('meetingSDKElement');
                if(!meetingSDKElement) return;

                setZoomClient(ZoomMtg);
            } catch (err: any) {
                console.error("Zoom Init Error", err);
                setZoomError(`Failed to load Zoom SDK: ${err.message}`);
            }
        };
        initZoom();
    }
    
    // Cleanup on unmount or mode switch
    return () => {
        if (zoomClient) {
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

            zoomClient.init({
                leaveUrl: window.location.origin,
                success: () => {
                    zoomClient.join({
                        signature: signature,
                        sdkKey: zoomCredentials.clientId,
                        meetingNumber: zoomConfig.meetingId,
                        passWord: zoomConfig.passcode,
                        userName: zoomConfig.userName,
                        success: (success: any) => {
                            console.log('Join meeting success', success);
                        },
                        error: (error: any) => {
                            console.error('Join meeting error', error);
                            setZoomError(error.reason || "Join Failed");
                        }
                    });
                },
                error: (error: any) => {
                    console.error('Init error', error);
                    setZoomError("SDK Init Failed");
                }
            });
        } catch (e) {
            setZoomError("Error generating signature or joining.");
        }
    }
  }, [zoomClient, zoomConfig, zoomCredentials, mediaMode]);


  // Apply Volume Control
  useEffect(() => {
      // 1. Apply to Audio Element
      if (audioPlayerRef.current) {
          audioPlayerRef.current.volume = mediaVolume;
      }

      // 2. Apply to YouTube IFrame
      if (youtubeFrameRef.current && youtubeFrameRef.current.contentWindow) {
          // Use the YouTube IFrame API's postMessage interface
          // Note: args is [volumePercent] (0-100)
          const volumeCmd = {
              event: 'command',
              func: 'setVolume',
              args: [mediaVolume * 100]
          };
          youtubeFrameRef.current.contentWindow.postMessage(JSON.stringify(volumeCmd), '*');
      }
  }, [mediaVolume, mediaMode]);

  const youtubeId = extractYouTubeId(youtubeUrl) || 'jfKfPfyJRdk';

  return (
    <div className="zoom-viewport">
      
      {mediaMode === 'youtube' && (
        <div className="youtube-embed-container">
          <iframe
            ref={youtubeFrameRef}
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&enablejsapi=1&controls=0&loop=1&playlist=${youtubeId}`}
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
                   {zoomConfig.joinUrl && <p style={{fontSize: '12px', color: 'var(--Blue-400)'}}>Ready to join: {zoomConfig.meetingId}</p>}
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
                ref={audioPlayerRef}
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
            className={cn("speaker-indicator", { thinking: isProcessing })}
            style={{
               transform: `scale(${1 + volume * 2})`,
               opacity: 0.5 + volume * 2
            }}
          >
            <span className="material-symbols-outlined icon">graphic_eq</span>
          </div>
          <div className="speaker-label">
            {isProcessing ? 'Translating...' : 'Eburon (AI)'}
          </div>
        </div>
      )}

      {/* Live Captions Overlay */}
      {captions && (
        <div className="live-caption-overlay fade-in">
           <p>{captions}</p>
        </div>
      )}

    </div>
  );
}