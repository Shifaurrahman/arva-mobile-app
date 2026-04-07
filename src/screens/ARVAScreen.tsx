import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import ARVAOrb from '../components/ARVAOrb';
import { useVoice } from '../hooks/useVoice';
import { login, askARVA, getUserName } from '../services/arva';

interface Message {
  id: string;
  role: 'user' | 'arva';
  text: string;
}

interface HistoryMessage {
  role: string;
  content: string;
}

export default function ARVAScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { isRecording, isProcessing, startRecording, stopRecording } = useVoice();

  const addMessage = (role: 'user' | 'arva', text: string) => {
    const msg: Message = { id: Date.now().toString(), role, text };
    setMessages(prev => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      const name = await login(email, password);
      setIsLoggedIn(true);
      addMessage('arva', `Hi ${name}! I am ARVA, your task assistant. Hold the mic button and speak, or type below.`);
    } catch (e) {
      Alert.alert('Login failed', 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const sendToARVA = async (text: string) => {
    if (!text.trim()) return;
    addMessage('user', text);

    const newHistory: HistoryMessage[] = [...history, { role: 'user', content: text }];

    try {
      const reply = await askARVA(text, newHistory);
      addMessage('arva', reply);
      Speech.speak(reply, { language: 'en', rate: 0.95 });
      setHistory([...newHistory, { role: 'assistant', content: reply }]);
    } catch (e: any) {
        addMessage('arva', e.message || 'Sorry, I could not connect to the server.');
    }
  };

  const handleVoicePressIn = async () => {
    if (!isLoggedIn) {
      Alert.alert('Please login first');
      return;
    }
    await startRecording();
  };

  const handleVoicePressOut = async () => {
    const text = await stopRecording();
    if (text) await sendToARVA(text);
  };

  const handleTextSend = async () => {
    const text = inputText.trim();
    setInputText('');
    await sendToARVA(text);
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <Text style={styles.logoText}>ARVA</Text>
        <Text style={styles.logoSub}>AI Task Assistant</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.loginBtnText}>Login</Text>
          }
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Main ARVA screen
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>ARVA</Text>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        style={styles.chatList}
        renderItem={({ item }) => (
          <View style={[
            styles.bubble,
            item.role === 'user' ? styles.userBubble : styles.arvaBubble,
          ]}>
            <Text style={[
              styles.bubbleText,
              item.role === 'user' ? styles.userText : styles.arvaText,
            ]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      <View style={styles.orbContainer}>
        <ARVAOrb
          isRecording={isRecording}
          isProcessing={isProcessing}
          onPressIn={handleVoicePressIn}
          onPressOut={handleVoicePressOut}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.textRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Or type here..."
            placeholderTextColor="#666"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleTextSend}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleTextSend}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1, backgroundColor: '#0D0D1A',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  logoText: {
    fontSize: 48, fontWeight: 'bold', color: '#7F77DD', marginBottom: 8,
  },
  logoSub: { fontSize: 16, color: '#888', marginBottom: 48 },
  input: {
    width: '100%', backgroundColor: '#1A1A2E', color: '#fff',
    borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#333', fontSize: 16,
  },
  loginBtn: {
    width: '100%', backgroundColor: '#5C4AB7',
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#0D0D1A' },
  header: {
    textAlign: 'center', color: '#7F77DD',
    fontSize: 24, fontWeight: 'bold', paddingVertical: 12,
  },
  chatList: { flex: 1, paddingHorizontal: 16 },
  bubble: {
    marginVertical: 6, maxWidth: '80%', borderRadius: 16, padding: 12,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#5C4AB7' },
  arvaBubble: { alignSelf: 'flex-start', backgroundColor: '#1A1A2E' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#fff' },
  arvaText: { color: '#ddd' },
  orbContainer: {
    alignItems: 'center', paddingVertical: 32,
  },
  textRow: {
    flexDirection: 'row', padding: 12, gap: 8,
    borderTopWidth: 0.5, borderTopColor: '#222',
  },
  textInput: {
    flex: 1, backgroundColor: '#1A1A2E', color: '#fff',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 0.5, borderColor: '#333', fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#5C4AB7', borderRadius: 24,
    paddingHorizontal: 20, justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});