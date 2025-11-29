/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { AudioRecorder } from './audio-recorder';
import { ASSEMBLY_AI_API_KEY } from './constants';
import EventEmitter from 'eventemitter3';

export class AssemblyAIClient {
  private socket: WebSocket | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private isConnected = false;
  private emitter = new EventEmitter();

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);
  private emit = this.emitter.emit.bind(this.emitter);

  constructor() {}

  async connect(sampleRate: number = 16000, lang?: string, stream?: MediaStream) {
    if (this.isConnected) return;

    // Use default 'en_us' if lang is 'auto' or not provided, as AssemblyAI V2 Streaming defaults to English
    // unless specified. V2 doesn't have "auto" streaming detection out of the box without specific config.
    // We will pass it if it's a specific code.
    // Enable speaker labels for diarization
    let url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sampleRate}&token=${ASSEMBLY_AI_API_KEY}&speaker_labels=true`;
    
    if (lang && lang !== 'auto') {
        // Append the language_code parameter to the URL
        url += `&language_code=${lang}`; 
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
        const speaker = data.speaker || '';
        
        if (data.message_type === 'FinalTranscript') {
            this.emit('transcript', { text: data.text, isFinal: true, speaker });
        } else if (data.message_type === 'PartialTranscript') {
            this.emit('transcript', { text: data.text, isFinal: false, speaker });
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