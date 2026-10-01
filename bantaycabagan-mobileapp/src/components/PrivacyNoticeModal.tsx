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

type PrivacySection = {
  title: string;
  body: string;
  emphasis?: string;
};

const sections: PrivacySection[] = [
  {
    title: 'Information GeoSentri processes',
    body: 'Account and personnel details such as name, rank, badge number, official contact information, and profile photo; assigned GPS device identifiers and telemetry such as coordinates, timestamps, speed, direction, and battery level; deployment, task, notification, report, evidence, and account-security records created through authorized use of the system.',
    emphasis: 'name, rank, badge number, official contact information, and profile photo',
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

function SectionBody({ section, dark }: { section: PrivacySection; dark: boolean }) {
  if (!section.emphasis) {
    return <Text style={[styles.sectionBody, dark && styles.mutedDark]}>{section.body}</Text>;
  }

  const [before, after] = section.body.split(section.emphasis);
  return (
    <Text style={[styles.sectionBody, dark && styles.mutedDark]}>
      {before}
      <Text style={[styles.emphasis, dark && styles.emphasisDark]}>{section.emphasis}</Text>
      {after}
    </Text>
  );
}

export default function PrivacyNoticeModal({
  visible,
  onClose,
  dark = false,
}: PrivacyNoticeModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.dialog, dark && styles.dialogDark]}>
          <View style={[styles.header, dark && styles.headerDark]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.icon, dark && styles.iconDark]}>
                <Icon name="privacy-tip" size={23} color={mobileTheme.danger} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, dark && styles.textDark]}>Privacy Notice</Text>
                <Text style={[styles.subtitle, dark && styles.mutedDark]}>
                  GeoSentri mobile officer application
                </Text>
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close privacy notice"
              style={[styles.closeIcon, dark && styles.closeIconDark]}
              onPress={onClose}
            >
              <Icon name="close" size={22} color={dark ? '#f8fafc' : mobileTheme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces
            alwaysBounceVertical
            overScrollMode="always"
          >
            <View style={[styles.summary, dark && styles.summaryDark]}>
              <View style={styles.summaryTitleRow}>
                <Icon name="verified-user" size={18} color={mobileTheme.blue} />
                <Text style={[styles.summaryTitle, dark && styles.textDark]}>
                  Your information, clearly explained
                </Text>
              </View>
              <Text style={[styles.summaryText, dark && styles.mutedDark]}>
                This notice explains how GeoSentri collects, uses, protects, and retains personal
                information during authorized police operations.
              </Text>
            </View>

            {sections.map((section, index) => (
              <View key={section.title} style={[styles.section, dark && styles.sectionDark]}>
                <View style={[styles.sectionNumber, dark && styles.sectionNumberDark]}>
                  <Text style={styles.sectionNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.sectionCopy}>
                  <Text style={[styles.sectionTitle, dark && styles.textDark]}>{section.title}</Text>
                  <SectionBody section={section} dark={dark} />
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, dark && styles.footerDark]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close Privacy Notice"
              style={styles.doneButton}
              onPress={onClose}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
  },
  dialog: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 24,
  },
  dialogDark: { backgroundColor: '#0b1528' },
  header: {
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.borderSoft,
    backgroundColor: mobileTheme.surface,
  },
  headerDark: { borderBottomColor: '#22314a', backgroundColor: '#0b1528' },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: mobileTheme.dangerSoft,
  },
  iconDark: { backgroundColor: '#3a151d' },
  headerCopy: { flex: 1 },
  title: { color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  subtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  closeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: mobileTheme.surfaceMuted,
  },
  closeIconDark: { backgroundColor: '#15233a' },
  scroll: { flexShrink: 1 },
  content: { padding: 16, paddingBottom: 8 },
  summary: {
    marginBottom: 14,
    borderRadius: 16,
    padding: 15,
    backgroundColor: mobileTheme.blueSoft,
  },
  summaryDark: { backgroundColor: '#132442' },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryTitle: { flex: 1, color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  summaryText: { marginTop: 8, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  section: {
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    backgroundColor: mobileTheme.surfaceMuted,
  },
  sectionDark: { backgroundColor: '#101d32' },
  sectionNumber: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: mobileTheme.blueSoft,
  },
  sectionNumberDark: { backgroundColor: '#1a3156' },
  sectionNumberText: { color: mobileTheme.blue, fontSize: 11, fontWeight: '800' },
  sectionCopy: { flex: 1 },
  sectionTitle: { marginBottom: 5, color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  sectionBody: { color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  emphasis: { color: mobileTheme.text, fontWeight: '700', fontStyle: 'italic' },
  emphasisDark: { color: '#dbeafe' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: mobileTheme.borderSoft,
    backgroundColor: mobileTheme.surface,
  },
  footerDark: { borderTopColor: '#22314a', backgroundColor: '#0b1528' },
  doneButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileTheme.blue,
  },
  doneText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#9eabc0' },
});
