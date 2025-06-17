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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Voice from "@react-native-voice/voice";
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

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

export default function HomeScreen() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const sendCommand = useCallback(async (action: string, color?: string) => {
    if (!webhookUrl.trim()) {
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Please set your n8n webhook URL first");
      }
      return;
    }

    setIsLoading(true);
    try {
      const payload = color ? { action, color } : { action };
      console.log("Sending command:", payload);

      // Convert payload to query parameters
      const queryParams = new URLSearchParams(payload).toString();
      const urlWithParams = `${webhookUrl.trim()}?${queryParams}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(urlWithParams, {
        method: "GET", // Changed from POST to GET
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const actionText = color ? `${action} (${color})` : action;
        console.log("Command sent successfully:", actionText);
        if (Platform.OS !== "web") {
          Alert.alert("Success", `Command sent: ${actionText}`);
        }
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error("Error sending command:", error);
      if (Platform.OS !== "web") {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        Alert.alert("Error", `Failed to send command: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [webhookUrl]);

  const parseVoiceCommand = useCallback((command: string) => {
    try {
      const lowerCommand = command.toLowerCase();

      if (
        lowerCommand.includes("turn on") ||
        lowerCommand.includes("switch on") ||
        lowerCommand === "on"
      ) {
        sendCommand("on");
      } else if (
        lowerCommand.includes("turn off") ||
        lowerCommand.includes("switch off") ||
        lowerCommand === "off"
      ) {
        sendCommand("off");
      } else if (
        lowerCommand.includes("red") ||
        lowerCommand.includes("change to red")
      ) {
        sendCommand("color", "red");
      } else if (
        lowerCommand.includes("blue") ||
        lowerCommand.includes("change to blue")
      ) {
        sendCommand("color", "blue");
      } else if (
        lowerCommand.includes("green") ||
        lowerCommand.includes("change to green")
      ) {
        sendCommand("color", "green");
      } else if (
        lowerCommand.includes("yellow") ||
        lowerCommand.includes("change to yellow")
      ) {
        sendCommand("color", "yellow");
      } else if (
        lowerCommand.includes("white") ||
        lowerCommand.includes("change to white")
      ) {
        sendCommand("color", "white");
      } else {
        if (Platform.OS !== "web") {
          Alert.alert(
            "Command not recognized",
            'Try saying: "Turn on", "Turn off", or "Change to red"\n\nReceived: "' +
              command +
              '"',
          );
        }
      }
    } catch (error) {
      console.error("Error parsing voice command:", error);
    }
  }, [sendCommand]);

  const handleVoiceResults = useCallback((event: any) => {
    try {
      const results = event.value;
      if (results && results.length > 0) {
        const command = results[0].toLowerCase().trim();
        console.log("Voice command received:", command);
        setLastCommand(command);
        parseVoiceCommand(command);
      }
    } catch (error) {
      console.error("Error handling voice results:", error);
    }
  }, [parseVoiceCommand]);

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
  }, [handleVoiceResults]);

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

  const startVoiceRecognition = useCallback(async () => {
    if (!VoiceModule) return;
    try {
      if (Platform.OS === "web") {
        Alert.alert(
          "Voice Recognition",
          "Voice recognition is not available on web platform",
        );
        return;
      }

      if (!voiceAvailable) {
        Alert.alert(
          "Voice Recognition",
          "Voice recognition is not available on this device",
        );
        return;
      }

      // Stop any existing recognition
      await VoiceModule?.stop().catch(() => {});
      await VoiceModule?.cancel().catch(() => {});

      console.log("Starting voice recognition...");
      await VoiceModule?.start("en-US");
    } catch (error) {
      console.error("Error starting voice recognition:", error);
      setIsListening(false);
      if (Platform.OS !== "web") {
        Alert.alert(
          "Error",
          "Failed to start voice recognition. Please check microphone permissions.",
        );
      }
    }
  }, [voiceAvailable]);

  const stopVoiceRecognition = useCallback(async () => {
    if (!VoiceModule) return;
    try {
      console.log("Stopping voice recognition...");
      await VoiceModule?.stop();
      await VoiceModule?.cancel();
      setIsListening(false);
    } catch (error) {
      console.error("Error stopping voice recognition:", error);
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadWebhookUrl();
      await setupVoice();
    };
    init();
    return () => {
      cleanupVoice();
    };
  }, [setupVoice, cleanupVoice]);

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
    <SafeAreaView className="flex-1 bg-gray-900">
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <ScrollView className="flex-1 px-6 py-8">
        {/* App Title */}
        <Text className="text-4xl font-bold text-center mb-8 text-white">
          🏠 Hue Control
        </Text>

        {/* ON/OFF Buttons */}
        <View className="flex-row justify-center mb-12 gap-6">
          <TouchableOpacity
            className={`px-10 py-5 rounded-2xl shadow-lg ${
              isLoading 
                ? "bg-gray-700" 
                : "bg-green-500 active:bg-green-600"
            }`}
            onPress={() => sendCommand("on")}
            disabled={isLoading}
          >
            <Text className="text-white text-xl font-bold">ON</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`px-10 py-5 rounded-2xl shadow-lg ${
              isLoading 
                ? "bg-gray-700" 
                : "bg-red-500 active:bg-red-600"
            }`}
            onPress={() => sendCommand("off")}
            disabled={isLoading}
          >
            <Text className="text-white text-xl font-bold">OFF</Text>
          </TouchableOpacity>
        </View>

        {/* Color Buttons */}
        <Text className="text-xl font-bold text-center mb-6 text-white">
          Colors
        </Text>
        <View className="flex-row flex-wrap justify-center mb-12 gap-4">
          {COLORS.map((color) => (
            <ColorButton
              key={color.name}
              color={color}
              isLoading={isLoading}
              onPress={(selectedColor) => sendCommand("color", selectedColor.value)}
            />
          ))}
        </View>

        {/* Voice Control Button */}
        {Platform.OS !== "web" && voiceAvailable && (
          <TouchableOpacity
            className={`mx-auto px-8 py-5 rounded-2xl shadow-lg mb-8 ${
              isListening 
                ? "bg-red-500" 
                : isLoading 
                  ? "bg-gray-700" 
                  : "bg-blue-500 active:bg-blue-600"
            }`}
            onPress={isListening ? stopVoiceRecognition : startVoiceRecognition}
            disabled={isLoading}
          >
            <Text className="text-white text-xl font-bold text-center">
              🎤 {isListening ? "Stop Listening" : "Voice Control"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Last Command Display */}
        {lastCommand && (
          <Text className="text-center text-gray-400 mb-8">
            Last command: "{lastCommand}"
          </Text>
        )}

        {/* Webhook URL Settings */}
        <View className="bg-gray-800 p-6 rounded-2xl shadow-lg mb-8">
          <Text className="text-xl font-bold mb-4 text-white">
            ⚙️ Settings
          </Text>
          <Text className="text-sm text-gray-300 mb-3">n8n Webhook URL:</Text>
          <TextInput
            className="border border-gray-600 bg-gray-700 rounded-xl px-4 py-3 text-base text-white"
            placeholder="https://your-n8n-instance.com/webhook/hue-control"
            placeholderTextColor="#666"
            value={webhookUrl}
            onChangeText={(text) => {
              setWebhookUrl(text);
              saveWebhookUrl(text);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Instructions */}
        <View className="bg-gray-800 p-6 rounded-2xl shadow-lg">
          <Text className="text-lg font-bold mb-4 text-white">
            {Platform.OS !== "web" && voiceAvailable
              ? "🗣 Voice Commands"
              : "📝 Manual Controls"}
          </Text>
          {Platform.OS !== "web" && voiceAvailable ? (
            <>
              <Text className="text-gray-300 mb-2">• "Turn on" or "On"</Text>
              <Text className="text-gray-300 mb-2">• "Turn off" or "Off"</Text>
              <Text className="text-gray-300 mb-2">
                • "Red", "Blue", "Green", "Yellow", "White"
              </Text>
              <Text className="text-gray-300">• "Change to [color]"</Text>
            </>
          ) : (
            <>
              <Text className="text-gray-300 mb-2">
                • Use the ON/OFF buttons to control power
              </Text>
              <Text className="text-gray-300 mb-2">
                • Tap color buttons to change light color
              </Text>
              <Text className="text-gray-300">
                • Set your n8n webhook URL in settings
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}