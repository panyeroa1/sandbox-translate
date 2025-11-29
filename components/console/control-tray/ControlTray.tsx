/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';

import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useUI, useSettings } from '@/lib/state';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { toggleSidebar } = useUI();
  const { mediaVolume, setMediaVolume } = useSettings();

  const { client, connected, connect, disconnect } = useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    if (!connected) {
      setMuted(false);
    }
  }, [connected]);

  // CHANGED: We do NOT send audio data to client.sendRealtimeInput anymore to prevent feedback.
  // The audio recorder here is purely for local visualization or future use if we want to enable mic again.
  // Gemini receives text via the Sidebar's bridge logic.
  useEffect(() => {
    const onData = (base64: string) => {
      // client.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: base64 }]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client, muted, audioRecorder]);

  const handleMicClick = () => {
    if (connected) {
      setMuted(!muted);
    } else {
      connect();
    }
  };

  const getVolumeIcon = () => {
    if (mediaVolume === 0) return 'volume_off';
    if (mediaVolume < 0.5) return 'volume_down';
    return 'volume_up';
  };

  const micButtonTitle = connected
    ? muted
      ? 'Unmute microphone'
      : 'Mute microphone'
    : 'Connect and start microphone';

  const connectButtonTitle = connected ? 'Stop streaming' : 'Start streaming';

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav')}>
        {/* Mic toggle kept for "connection" logic, but audio sending is disabled */}
        <button
          className={cn('action-button mic-button')}
          onClick={handleMicClick}
          title={micButtonTitle}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="volume-control">
          <button 
            className="action-button volume-button"
            onClick={() => setMediaVolume(mediaVolume === 0 ? 0.5 : 0)}
            title="Mute/Unmute Media"
          >
            <span className="material-symbols-outlined filled">{getVolumeIcon()}</span>
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={mediaVolume}
            onChange={(e) => setMediaVolume(parseFloat(e.target.value))}
            className="volume-slider"
            title="Media Volume"
          />
        </div>
        
        <button
          className={cn('action-button')}
          onClick={toggleSidebar}
          aria-label="Settings"
          title="Settings"
        >
          <span className="icon">tune</span>
        </button>

        {children}
      </nav>

      <div className={cn('connection-container', { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected })}
            onClick={connected ? disconnect : connect}
            title={connectButtonTitle}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
    </section>
  );
}

export default memo(ControlTray);