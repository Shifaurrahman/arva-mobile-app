import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  Animated,
  StyleSheet,
  View,
  Text,
} from 'react-native';

interface Props {
  isRecording: boolean;
  isProcessing: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export default function ARVAOrb({
  isRecording,
  isProcessing,
  onPressIn,
  onPressOut,
}: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current; // non-native: opacity
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null);

  // pulse — native driver (transform only)
  useEffect(() => {
    // Stop any running loop cleanly before starting a new one
    if (pulseAnim.current) {
      pulseAnim.current.stop();
      pulseAnim.current = null;
    }

    if (isRecording) {
      pulseAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnim.current.start();
    } else {
      Animated.timing(pulse, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isRecording]);

  // glow opacity — non-native driver, on its own dedicated node
  useEffect(() => {
    Animated.timing(glowOpacity, {
      toValue: isRecording ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // opacity on a separate node — no conflict
    }).start();
  }, [isRecording]);

  const orbColor = isRecording
    ? '#E85D24'
    : isProcessing
    ? '#EF9F27'
    : '#5C4AB7';

  const label = isRecording
    ? 'Listening...'
    : isProcessing
    ? 'Thinking...'
    : 'Hold to speak';

  return (
    <View style={styles.container}>

      {/* Glow ring — opacity only, non-native driver, completely separate node */}
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: glowOpacity,
            borderColor: orbColor,
          },
        ]}
      />

      {/* Pulse ring — scale only, native driver, separate node */}
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: pulse }],
            borderColor: orbColor,
          },
        ]}
      />

      <TouchableOpacity
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.8}
        style={[styles.orb, { backgroundColor: orbColor }]}
      >
        <Text style={styles.micIcon}>🎤</Text>
      </TouchableOpacity>

      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  orb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  micIcon: { fontSize: 36 },
  label: {
    marginTop: 20,
    color: '#888',
    fontSize: 14,
  },
});
