import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileTheme } from '../constants/mobileTheme';

type PrivacyNoticeModalProps = {
  visible: boolean;
  onClose: () => void;
  dark?: boolean;
};

const sections = [
  {
    title: 'Information GeoSentri processes',
    body: 'Account and personnel details such as name, rank, badge number, official contact information, and profile photo; assigned GPS device identifiers and telemetry such as coordinates, timestamps, speed, direction, and battery level; deployment, task, notification, report, evidence, and account-security records created through authorized use of the system.',
  },
  {
    title: 'On-duty location tracking',
    body: 'GeoSentri accepts and stores live GPS location records only while an officer has an active deployment. Off-duty readings are not added to GeoSentri live location or location history. The latest authorized reading may remain in the current operational record until it is replaced or removed under the approved station retention policy.',
  },
  {
    title: 'Purpose and lawful basis',
    body: 'Cabagan Police Station processes this information to perform its authorized official functions, including personnel coordination, officer safety, emergency response, deployment monitoring, incident reporting, and system security. Processing is limited to these declared official purposes and other lawful grounds that apply to police operations and public safety.',
  },
  {
    title: 'Who may access the information',
    body: 'Authorized COP or supervisors, the officer through their own account, authenticated on-duty officers when operational coordination requires it, and approved service providers used to host, secure, map, notify, or process authorized GeoSentri data. Access is limited by assigned role and operational need.',
  },
  {
    title: 'Retention',
    body: 'Detailed GPS location history is automatically deleted after 24 hours. The latest operational location is retained only while needed for current authorized operations. Account, deployment, task, report, evidence, notification, and audit records are retained only for as long as needed for their official purpose and applicable government record-keeping requirements, then securely disposed of under the station retention schedule.',
  },
  {
    title: 'Security and access controls',
    body: 'GeoSentri uses authenticated accounts, role-based permissions, encrypted HTTPS connections, restricted data access, session controls, and protected storage. Officers must protect their credentials and immediately report a lost phone, tracker, or suspected unauthorized access.',
  },
  {
    title: 'Your data privacy rights',
    body: 'Subject to applicable law and official-record requirements, you may ask to be informed, access or correct your personal data, object to certain processing, request blocking or deletion when allowed, and raise a privacy complaint. Requests should be directed to the station or its designated Data Protection Officer.',
  },
  {
    title: 'Personal Information Controller and privacy contact',
    body: 'Personal Information Controller: Cabagan Police Station, Philippine National Police, Cabagan, Isabela. Privacy questions, requests, or complaints may be submitted in person through the station administrative desk for endorsement to the designated Data Protection Officer. The station may update this notice with its official DPO name, email address, and telephone number after its privacy review.',
  },
];

export default function PrivacyNoticeModal({
  visible,
  onClose,
  dark = false,
}: PrivacyNoticeModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.screen, dark && styles.screenDark]}>
        <View style={[styles.header, dark && styles.headerDark]}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.icon, dark && styles.iconDark]}>
              <Icon name="privacy-tip" size={22} color={mobileTheme.blue} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, dark && styles.textDark]}>GeoSentri Privacy Notice</Text>
              <Text style={[styles.subtitle, dark && styles.mutedDark]}>Mobile officer application</Text>
            </View>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close privacy notice"
            style={[styles.closeIcon, dark && styles.closeIconDark]}
            onPress={onClose}
          >
            <Icon name="close" size={23} color={dark ? '#f8fafc' : mobileTheme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.summary, dark && styles.summaryDark]}>
            <Text style={[styles.summaryText, dark && styles.textDark]}>
              This notice explains how GeoSentri currently processes and protects personal
              information through the mobile officer application. Cabagan Police Station may
              update it when its privacy practices, official contacts, or applicable requirements
              change.
            </Text>
          </View>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, dark && styles.textDark]}>{section.title}</Text>
              <Text style={[styles.sectionBody, dark && styles.mutedDark]}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, dark && styles.footerDark]}>
          <TouchableOpacity accessibilityRole="button" style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneText}>Close Privacy Notice</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mobileTheme.background },
  screenDark: { backgroundColor: '#050b18' },
  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.border,
    backgroundColor: mobileTheme.surface,
  },
  headerDark: { borderBottomColor: '#22314a', backgroundColor: '#0b1528' },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileTheme.blueSoft,
  },
  iconDark: { backgroundColor: '#132442' },
  headerCopy: { flex: 1 },
  title: { color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  subtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  closeIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 21,
  },
  closeIconDark: { borderColor: '#2a3a56' },
  content: { padding: 20, paddingBottom: 28 },
  summary: {
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: mobileTheme.blue,
    borderRadius: 10,
    padding: 14,
    backgroundColor: mobileTheme.blueSoft,
  },
  summaryDark: { backgroundColor: '#132442' },
  summaryText: { color: mobileTheme.text, fontSize: 12, lineHeight: 19 },
  section: { marginBottom: 22 },
  sectionTitle: { marginBottom: 6, color: mobileTheme.text, fontSize: 14, fontWeight: '800' },
  sectionBody: { color: mobileTheme.textMuted, fontSize: 12, lineHeight: 19 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.border,
    backgroundColor: mobileTheme.surface,
  },
  footerDark: { borderTopColor: '#22314a', backgroundColor: '#0b1528' },
  doneButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileTheme.blue,
  },
  doneText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#9eabc0' },
});
