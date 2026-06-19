import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* TOP GRADIENT */}
      <LinearGradient
        colors={['#ffffff', '#7b6cf6']}
        style={styles.topGradient}
      />

      {/* BOTTOM GRADIENT */}
      <LinearGradient
        colors={['#7b6cf6', '#ffffff']}
        style={styles.bottomRightAccent}
      />

      {/* TITLE */}
      <Text style={styles.title}>Login</Text>

      <Text style={styles.subtitle}>
        Welcome to BantayCabagan System
      </Text>

      {/* ID INPUT */}
      <View style={styles.inputBox}>
        <TextInput
          placeholder="ID"
          placeholderTextColor="#999"
          style={styles.input}
        />
      </View>

      {/* PASSWORD INPUT */}
      <View style={styles.inputBox}>
        <MaterialIcons name="lock-outline" size={18} color="#999" />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          style={[styles.input, { marginLeft: 8 }]}
        />
      </View>

      {/* LOGIN BUTTON */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('UserMaps')}
      >
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>

    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
    backgroundColor: '#fff',
  },

  topGradient: {
    position: 'absolute',
    width: 300,
    height: 300,
    top: -90,
    left: -60,
    borderRadius: 150,
    opacity: 0.6,
  },

  bottomRightAccent: {
    position: 'absolute',
    width: 350,
    height: 350,
    bottom: -120,
    right: -120,
    borderRadius: 200,
    opacity: 0.6,
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 14,
    marginBottom: 30,
    color: '#666',
  },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 15,
  },

  input: {
    flex: 1,
    fontSize: 14,
  },

  button: {
    backgroundColor: '#2d2da8',
    padding: 12,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
  },

  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});