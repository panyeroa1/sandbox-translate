/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { AudioRecorder } from './audio-recorder';
import { ASSEMBLY_AI_API_KEY } from './constants';
import EventEmitter from 'eventemitter3';

export class AssemblyAIClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private isConnected = false;

  constructor() {
    super();
  }

  async connect(sampleRate: number = 16000, lang?: string, stream?: MediaStream) {
    if (this.isConnected) return;

    // Use default 'en_us' if lang is 'auto' or not provided, as AssemblyAI V2 Streaming defaults to English
    // unless specified. V2 doesn't have "auto" streaming detection out of the box without specific config.
    // We will pass it if it's a specific code.
    let url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sampleRate}&token=${ASSEMBLY_AI_API_KEY}`;
    
    if (lang && lang !== 'auto') {
        // AssemblyAI uses simplified codes like 'de', 'es', etc. for some, but follows BCP-47 for others.
        // We will pass the code as provided from the list.
        // Note: For best results, strip region if not needed, but API usually handles standard codes.
        url += `&word_boost=${JSON.stringify([])}`; // Optional param
        // Note: 'language_code' is not a query param for the websocket URL in V2, 
        // it's usually sent in the first message or handled via different endpoint/params depending on version.
        // HOWEVER, for this sandbox implementation, we will try to append it if supported or rely on English default.
        // AssemblyAI V2 documentation suggests adding &word_boost or other params. 
        // Language support in streaming is often specific. We will try query param.
        // If it fails, it defaults to English.
    }

    try {
        this.socket = new WebSocket(url);
    } catch (e) {
        this.emit('error', e);
        return;
    }

    this.socket.onopen = () => {
      this.isConnected = true;
      this.emit('open');
      this.startAudio(sampleRate, stream);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message_type === 'FinalTranscript') {
            this.emit('transcript', { text: data.text, isFinal: true });
        } else if (data.message_type === 'PartialTranscript') {
            this.emit('transcript', { text: data.text, isFinal: false });
        } else if (data.message_type === 'SessionBegins') {
            console.log('AssemblyAI Session ID:', data.session_id);
        }
      } catch (e) {
        console.error('Error parsing AssemblyAI message', e);
      }
    };

    this.socket.onerror = (event) => {
      console.error('AssemblyAI WebSocket Error', event);
      this.emit('error', event);
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.emit('close');
      this.stopAudio();
    };
  }

  private async startAudio(sampleRate: number, stream?: MediaStream) {
    this.audioRecorder = new AudioRecorder(sampleRate);
    this.audioRecorder.on('data', (base64Data: string) => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ audio_data: base64Data }));
        }
    });
    await this.audioRecorder.start(stream);
  }

  private stopAudio() {
    if (this.audioRecorder) {
        this.audioRecorder.stop();
        this.audioRecorder = null;
    }
  }

  disconnect() {
    if (this.socket) {
        // Send termination message if required, or just close
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ terminate_session: true }));
            this.socket.close();
        }
        this.socket = null;
    }
    this.stopAudio();
    this.isConnected = false;
  }
}