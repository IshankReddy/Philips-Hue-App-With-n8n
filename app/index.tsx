import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  SafeAreaView,
  Platform,
  Pressable,
  StatusBar,
  Image,  // Add this line
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Voice from "@react-native-voice/voice";
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

let VoiceModule: typeof Voice | null = null;
try {
  VoiceModule = require("@react-native-voice/voice").default;
} catch (e) {
  console.warn("Voice module not available in Expo Go");
}

const COLORS = [
  { name: "red", emoji: "🔴", value: "#FF4444" },
  { name: "blue", emoji: "🔵", value: "#4444FF" },
  { name: "green", emoji: "🟢", value: "#44FF44" },
  { name: "yellow", emoji: "🟡", value: "#FFFF44" },
  { name: "white", emoji: "⚪", value: "#FFFFFF" },
];

// Add proper TypeScript interfaces
interface Color {
  name: string;
  emoji: string;
  value: string;
}

interface ColorButtonProps {
  color: Color;
  isLoading: boolean;
  onPress: (color: Color) => void;
}

interface WhisperResponse {
  text: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ColorButton: React.FC<ColorButtonProps> = ({ color, isLoading, onPress }) => {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }]
    };
  });

  const onPressIn = () => {
    scale.value = withSpring(0.95);
  };

  const onPressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <AnimatedPressable
      style={[{
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.value,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.1)",
        opacity: isLoading ? 0.5 : 1,
      }, animatedStyle]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={() => onPress(color)}
      disabled={isLoading}
    >
      <Text className="text-4xl">{color.emoji}</Text>
    </AnimatedPressable>
  );
};

// Add these color variations at the top with your COLORS array
const COLOR_VARIATIONS = {
  red: ['red', 'crimson', 'scarlet'],
  blue: ['blue', 'azure', 'navy'],
  green: ['green', 'emerald', 'lime'],
  yellow: ['yellow', 'golden', 'amber'],
  white: ['white', 'bright', 'light'],
  black: ['black', 'dark', 'midnight'],
  purple: ['purple', 'violet', 'lavender'],
  orange: ['orange', 'tangerine'],
  pink: ['pink', 'rose', 'magenta']
};

export default function HomeScreen() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [openAIKey, setOpenAIKey] = useState("");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const sendCommand = useCallback(async (action: string, value?: string) => {
    if (!webhookUrl.trim()) {
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Please set your n8n webhook URL first");
      }
      return;
    }

    setIsLoading(true);
    try {
      const payload: Record<string, string> = { action };
      
      // Add appropriate parameter based on action
      if (action === 'set_color' && value) {
        payload.color = value;
      } else if (action === 'set_brightness' && value) {
        payload.brightness = value;
      }

      console.log("Sending command:", payload);
      const queryParams = new URLSearchParams(payload).toString();
      const urlWithParams = `${webhookUrl.trim()}?${queryParams}`;

      const response = await fetch(urlWithParams);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      setLastCommand(`${action} ${value || ''}`);
    } catch (error) {
      console.error("Error sending command:", error);
      Alert.alert("Error", "Failed to send command. Please check your webhook URL.");
    } finally {
      setIsLoading(false);
    }
  }, [webhookUrl]);

  const processVoiceCommand = useCallback(async (text: string) => {
    const command = text.toLowerCase().trim();
    console.log('Processing command:', command);
    
    let action = '';
    let color = '';

    // Handle power commands
    if (command.match(/turn (on|off)/i) || command.match(/(on|off)/i)) {
      action = command.includes('off') ? 'turn_off' : 'turn_on';
    }
    
    // Handle color commands
    const colorPhrases = [
      'change to', 'switch to', 'make it', 'set to', 'set it to',
      'change the color to', 'set the color to', 'turn it', 'set light to',
      'change light to', 'make the light'
    ];

    // Check for any color-related phrase
    const hasColorCommand = colorPhrases.some(phrase => command.includes(phrase)) ||
      command.includes('color') ||
      Object.values(COLOR_VARIATIONS).flat().some(color => command.includes(color));

    if (hasColorCommand || !action) { // Check for color if no power command found
      // Find the color in the command
      for (const [baseColor, variations] of Object.entries(COLOR_VARIATIONS)) {
        if (variations.some(variant => command.includes(variant))) {
          action = 'set_color';
          color = baseColor;
          break;
        }
      }
    }

    // Handle brightness commands (if your webhook supports it)
    if (command.match(/(bright|dim|brightness)/i)) {
      if (command.match(/(full|max|maximum|brightest)/i)) {
        action = 'set_brightness';
        color = '100';
      } else if (command.match(/(half|medium|mid)/i)) {
        action = 'set_brightness';
        color = '50';
      } else if (command.match(/(low|dim|minimum)/i)) {
        action = 'set_brightness';
        color = '20';
      }
    }

    if (action) {
      console.log(`Executing command: ${action} ${color}`);
      await sendCommand(action, color);
      // Provide feedback to user
      let feedbackMessage = `Command executed: ${action.replace('_', ' ')}`;
      if (color) {
        feedbackMessage += ` (${color})`;
      }
      Alert.alert('Success', feedbackMessage);
    } else {
      console.log('No valid command found in:', command);
      Alert.alert('Command Not Recognized', 
        'Try saying things like:\n' +
        '• "Turn the light on/off"\n' +
        '• "Change to blue"\n' +
        '• "Set the color to red"\n' +
        '• "Make it green"'
      );
    }
  }, [sendCommand]);

  const loadOpenAIKey = async () => {
    try {
      const key = await AsyncStorage.getItem("openAIKey");
      if (key) setOpenAIKey(key);
    } catch (error) {
      console.error("Error loading OpenAI key:", error);
    }
  };

  const saveOpenAIKey = async (key: string) => {
    try {
      await AsyncStorage.setItem("openAIKey", key);
    } catch (error) {
      console.error("Error saving OpenAI key:", error);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsListening(false);

      if (!uri) throw new Error('No recording URI available');

      // Create form data for OpenAI API
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any);
      formData.append('model', 'whisper-1');

      // Get transcription from OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const command = data.text.trim();
      
      // Send the raw command to webhook
      const queryParams = new URLSearchParams({
        command: command
      }).toString();
      
      const webhookResponse = await fetch(`${webhookUrl.trim()}?${queryParams}`);
      if (!webhookResponse.ok) {
        throw new Error(`Webhook error: ${webhookResponse.status}`);
      }

      // Show success message with the transcribed command
      setLastCommand(command);
      Alert.alert('Command Sent', `"${command}"`);

    } catch (err) {
      console.error('Error:', err);
      Alert.alert('Error', 'Failed to process voice command');
    }
  };

  const startVoiceRecognition = useCallback(async () => {
    if (!openAIKey || !webhookUrl) {
      Alert.alert('Error', 'Please set both OpenAI API key and webhook URL first');
      return;
    }

    if (isListening) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isListening, openAIKey, webhookUrl]);

  const setupVoice = useCallback(async () => {
    if (!VoiceModule) {
      setVoiceAvailable(false);
      return;
    }

    try {
      const available = await VoiceModule.isAvailable();
      setVoiceAvailable(Boolean(available));
      
      if (!available) {
        console.warn("Voice recognition not available on this platform");
        return;
      }

      VoiceModule.onSpeechStart = () => setIsListening(true);
      VoiceModule.onSpeechEnd = () => setIsListening(false);
      VoiceModule.onSpeechResults = handleVoiceResults;
      VoiceModule.onSpeechError = (error) => {
        console.error("Voice error:", error);
        setIsListening(false);
        if (Platform.OS !== "web") {
          Alert.alert(
            "Voice Error",
            "Failed to process voice command. Please check microphone permissions and try again.",
          );
        }
      };
      VoiceModule.onSpeechPartialResults = (event) => {
        console.log("Partial results:", event.value);
      };
    } catch (error) {
      console.error("Error setting up voice:", error);
      setVoiceAvailable(false);
    }
  }, []);

  const cleanupVoice = useCallback(() => {
    if (!VoiceModule) return;
    try {
      VoiceModule?.stop();
      VoiceModule?.cancel();
      VoiceModule?.removeAllListeners();
      VoiceModule?.destroy();
    } catch (error) {
      console.warn("Error cleaning up voice:", error);
    }
  }, []);

  const convertVoiceToText = async (audioUri: string): Promise<string | null> => {
    if (!openAIKey) {
      Alert.alert("Error", "Please set your OpenAI API key in settings");
      return null;
    }

    try {
      // Read the audio file as base64
      const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Create form data
      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      } as any);
      formData.append('model', 'whisper-1');

      // Make request to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data: WhisperResponse = await response.json();
      return data.text.trim().toLowerCase();
    } catch (error) {
      console.error('Error converting voice to text:', error);
      Alert.alert('Error', 'Failed to convert voice to text');
      return null;
    }
  };

  const handleVoiceResults = useCallback(async (event: any) => {
    try {
      const { value } = event;
      if (value && value.length > 0) {
        const audioUri = value[0];
        const text = await convertVoiceToText(audioUri);
        
        if (text) {
          console.log("Voice command received:", text);
          setLastCommand(text);
          processVoiceCommand(text);
        }
      }
    } catch (error) {
      console.error("Error handling voice results:", error);
    }
  }, [processVoiceCommand, convertVoiceToText]);



  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadWebhookUrl(),
        loadOpenAIKey(),
        setupVoice()
      ]);
    };
    init();
    return () => {
      cleanupVoice();
    };
  }, [setupVoice, cleanupVoice]);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  const loadWebhookUrl = async () => {
    try {
      const url = await AsyncStorage.getItem("webhookUrl");
      if (url) setWebhookUrl(url);
    } catch (error) {
      console.error("Error loading webhook URL:", error);
    }
  };

  const saveWebhookUrl = async (url: string) => {
    try {
      await AsyncStorage.setItem("webhookUrl", url);
    } catch (error) {
      console.error("Error saving webhook URL:", error);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="#FFFFFF"
        translucent={false} 
      />
      <ScrollView className="flex-1 px-6 py-8">
        <Image 
          source={require('../assets/images/Kaviwebdesign-Logo.png')}
          className="w-72 h-20 mx-auto"
          resizeMode="contain"
        />
        <Text className="text-4xl font-bold text-center mb-20 text-white">
          🏠Smart Controller
        </Text>

        {/* Main Content */}
       {/* {(!webhookUrl || !openAIKey) && (
          <View className="bg-red-900/50 p-4 rounded-lg mb-6">
            <Text className="text-white text-center">
              ⚠️ Please add both your n8n webhook URL and OpenAI API key below to enable all features
            </Text>
          </View>
        )} */ }

        {/* Color Buttons */}
        <View className="flex-row flex-wrap justify-center gap-4 mb-20">
          {COLORS.map((color) => (
            <ColorButton
              key={color.name}
              color={color}
              isLoading={isLoading}
              onPress={() => sendCommand('set_color', color.name)}
            />
          ))}
        </View>

        {/* Control Buttons */}
        <View className="flex-row justify-center gap-4 mb-8">
          <TouchableOpacity
            className="bg-green-600 px-8 py-4 rounded-xl shadow-lg"
            onPress={() => sendCommand('turn_on')}
            disabled={isLoading}
          >
            <Text className="text-white text-lg font-semibold">Turn On</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-red-600 px-8 py-4 rounded-xl shadow-lg"
            onPress={() => sendCommand('turn_off')}
            disabled={isLoading}
          >
            <Text className="text-white text-lg font-semibold">Turn Off</Text>
          </TouchableOpacity>
        </View>

        {/* Voice Control Button */}
        <TouchableOpacity
          className={`mx-auto px-8 py-5 rounded-2xl shadow-lg mb-20 ${
            isListening 
              ? "bg-red-600"
              : (!webhookUrl || !openAIKey)
                ? "bg-gray-600"
                : "bg-blue-600"
          }`}
          onPress={startVoiceRecognition}
          disabled={!webhookUrl || !openAIKey}
        >
          <Text className="text-white text-lg font-semibold">
            {isListening ? "🎤 Listening... Tap to Send" : "🎤 Tap to Speak"}
          </Text>
        </TouchableOpacity>

        {lastCommand ? (
          <Text className="text-gray-400 text-center mb-8">
            Last command: "{lastCommand}"
          </Text>
        ) : null}

        {/* Settings Section */}
        <View className="bg-gray-800/50 rounded-xl p-4 mt-auto">
          <Text className="text-white text-lg font-semibold mb-4">⚙️ Settings</Text>
          
          <View className="space-y-4">
            <View>
              <Text className="text-gray-400 text-sm mb-2">Webhook URL</Text>
              <TextInput
                className="bg-gray-800 text-white px-4 py-3 rounded-lg"
                placeholder="Enter your n8n webhook URL"
                placeholderTextColor="#666"
                value={webhookUrl}
                onChangeText={setWebhookUrl}
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">OpenAI API Key</Text>
              <TextInput
                className="bg-gray-800 text-white px-4 py-3 rounded-lg"
                placeholder="Enter your OpenAI API key"
                placeholderTextColor="#666"
                value={openAIKey}
                onChangeText={setOpenAIKey}
                secureTextEntry
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}