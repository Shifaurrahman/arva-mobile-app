import { useState, useRef } from 'react';
import { Audio } from 'expo-av';
import axios from 'axios';

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_KEY;

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isRecordingRef = useRef(false); // guard against race conditions

  const startRecording = async () => {
    // Guard: don't start if already recording
    if (isRecordingRef.current) return;

    // Clean up any zombie recording left over from a previous session
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (_) {
        // already unloaded — safe to ignore
      }
      recordingRef.current = null;
    }

    try {
      isRecordingRef.current = true;
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      console.error('Start recording error:', e);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = async (): Promise<string> => {
    // Guard: don't stop if not recording
    if (!isRecordingRef.current || !recordingRef.current) return '';

    // Grab and clear refs immediately to prevent double-stop
    isRecordingRef.current = false;
    const recording = recordingRef.current;
    recordingRef.current = null;

    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) {
        setIsProcessing(false);
        return '';
      }

      // Send to Whisper
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'voice.m4a',
      } as any);
      formData.append('model', 'whisper-1');

      const res = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      const text = res.data.text || '';
      setTranscript(text);
      setIsProcessing(false);
      return text;
    } catch (e) {
      console.error('Stop recording error:', e);
      setIsProcessing(false);
      return '';
    }
  };

  return { isRecording, isProcessing, transcript, startRecording, stopRecording };
}