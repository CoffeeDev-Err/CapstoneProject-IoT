import React, { useState } from 'react';
import { Modal, TextInput, View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Pressable } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

export default function UserProfile({ navigation }: any) {
  // Modal Visibility States
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [alertModalVisible, setAlertModalVisible] = useState(false);

  // Form States
  const [reportType, setReportType] = useState('');
  const [location, setLocation] = useState('');
  const [event, setEvent] = useState('');
  const [description, setDescription] = useState('');

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView>
        {/* PROFILE CARD */}
        <View style={styles.card}>
          <Image
            source={{ uri: 'https://i.pravatar.cc/150' }}
            style={styles.avatar}
          />
          <Text style={styles.name}>Juan Dela Cruz</Text>
          <Text style={styles.role}>Police Corporal</Text>

          <View style={styles.divider} />

          {/* INFO ROWS */}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Location:</Text>
            <Text style={styles.value}>Cabagan Police Station</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>On Duty</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.label}>Duty</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Check Point</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.label}>Last Updated</Text>
            <Text style={styles.value}>8:25 PM</Text>
          </View>
        </View>

        {/* MAIN ACTION BUTTONS */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.alertBtn}
            onPress={() => setAlertModalVisible(true)}
          >
            <Text style={styles.alertText}>Alert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setReportModalVisible(true)}
          >
            <Text style={styles.reportText}>Report</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* --- REPORT MODAL --- */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReportModalVisible(false)} />
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Report</Text>

            <Text style={styles.fieldLabel}>Report Type</Text>
            <TextInput style={styles.input} value={reportType} onChangeText={setReportType} />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} />

            <Text style={styles.fieldLabel}>Event</Text>
            <TextInput style={styles.input} value={event} onChangeText={setEvent} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={() => setReportModalVisible(false)}>
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- ALERT MODAL --- */}
      <Modal
        visible={alertModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAlertModalVisible(false)} />
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Alert</Text>

            <Text style={styles.fieldLabel}>Report</Text>
            <TextInput style={styles.input}  placeholderTextColor="#999" />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.input}  placeholderTextColor="#999" />

            <Text style={styles.fieldLabel}>Event</Text>
            <TextInput style={styles.input}  placeholderTextColor="#999" />

            <TouchableOpacity style={styles.submitBtnalert} onPress={() => setAlertModalVisible(false)}>
              <Text style={styles.submitText}>ALERT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BOTTOM RIGHT NAVIGATION */}
      <View style={styles.bottomRight}>
        <TouchableOpacity style={styles.changeBtn}>
          <Text style={styles.changeText}>Change Password</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            })
          }
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  header: {
    backgroundColor: '#1d4ed8',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  card: {
    margin: 20,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#fff', // Added background for card visibility
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#1d4ed8',
    marginBottom: 10,
  },
  name: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#111',
  },
  role: {
    fontSize: 22,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 15,
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#666',
    fontSize: 16,
  },
  value: {
    color: '#111',
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    marginHorizontal: 20,
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    marginBottom: 100, // Space for bottom buttons
  },
  alertBtn: {
    backgroundColor: '#ff0000',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    width: '50%', // Adjusted width for better UI
    elevation: 5,
  },
  reportBtn: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    width: '50%',
    elevation: 5,
  },
  alertText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  reportText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#172554',
    padding: 20,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
    textAlign: 'center',
  },
  fieldLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    fontSize: 14,
    color: '#000',
  },
  submitBtn: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-end', // ✅ Push to the right
  },



    submitBtnalert: {
    backgroundColor: '#ff0000',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-end', // ✅ Push to the right
  },



  submitText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },

  /* FOOTER BUTTONS */
  bottomRight: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    gap: 10,
  },
  changeBtn: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  changeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  logoutBtn: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
