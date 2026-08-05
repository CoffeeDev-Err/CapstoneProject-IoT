import { View, Text, TextInput, StyleSheet, TouchableOpacity, Animated, Pressable } from 'react-native';
import React, { useState, useRef } from 'react';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-vector-icons/MaterialIcons';


export default function UserMaps({ navigation }: any) {

      const [taskModalVisible, setTaskModalVisible] = useState(false);
      const slideAnim = useRef(new Animated.Value(300)).current;

      const [activeTab, setActiveTab] = useState('All');


      const openTaskModal = () => {


      setTaskModalVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    const closeTaskModal = () => {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setTaskModalVisible(false));
    };

    return (


      
      <View style={styles.container}>

        

        {/* 🌍 LEAFLET MAP */}
        <WebView
          style={StyleSheet.absoluteFill}
          source={{
            html: `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <style>
      body { margin: 0; }
      #map { height: 100vh; width: 100%; }

      /* 🧭 PIN */
      .pin-container {
        position: relative;
        width: 60px;
        height: 75px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .pin-circle {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        border: 4px solid #1de60b;
        overflow: hidden;
        background: white;
        z-index: 2;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      }

      .pin-circle img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .pin-arrow {
        width: 0;
        height: 0;
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-top: 18px solid #1de60b;
        margin-top: -2px;
      }

      /* 🌑 MODAL OVERLAY */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      }

      /* 📦 MODAL CARD */
  /* 📦 MODAL CARD (UPDATED RESPONSIVE) */
  .modal-card {
    background: #000033;
    padding: 25px;
    border-radius: 20px;

    width: 85%;
    max-width: 320px;

    min-height: 400px;

    text-align: center;
    color: white;
    font-family: Arial;

    box-shadow: 0 15px 35px rgba(0,0,0,0.6);

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

      .popup-img {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 3px solid #1de60b;
        margin-bottom: 10px;
      }

      .popup-name {
        font-size: 30px;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .popup-text {
        font-size: 13px;
        margin: 4px 0;
      }

      .popup-role {
    font-size: 14px;
    color: #8755b6; 
    margin-bottom: 10px;
    font-weight: 600;
  }


  /* ❌ CLOSE BUTTON */
  .close-btn {
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 24px;
    color: white;
    cursor: pointer;
  }

  /* make modal card relative so close button positions correctly */
  .modal-card {
    position: relative;
  }

  /* 👤 PROFILE IMAGE BIGGER & TOP LOOK */
  .popup-img {
    width: 95px;
    height: 95px;
    border-radius: 50%;
    border: 3px solid #1de60b;
    margin-bottom: 10px;
  }
/* 👮 NAME (BIGGER) */
.popup-name {
  font-size: 26px;   /* increased */
  font-weight: 700;
  margin-bottom: 6px;
  color: #ffffff;
  text-align: center;
}

/* 🟣 ROLE (BIGGER BUT LESS THAN NAME) */
.popup-role {
  font-size: 18px;   /* increased */
  color: #a56bff;
  margin-bottom: 14px;
  font-weight: 600;
  text-align: center;
}

  /* ➖ DIVIDER */
  .divider {
    width: 80%;
    height: 1px;
    background: rgba(255,255,255,0.3);
    margin: 10px 0;
  }

  /* 📍 TEXT */
  .popup-text {
    font-size: 13px;
    margin: 4px 0;
  }


  /* 📌 ROW (LEFT + RIGHT TEXT) */
.row-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

/* LEFT TEXT */
.row-left {
  font-size: 18px;
  color: #bdbdbd;
  text-align: left;
}

/* RIGHT TEXT */
.row-right {
  font-size: 18px;
  color: #ffffff;
  font-weight: 500;
  text-align: right;
}

/* ➖ DIVIDER LINE */
.divider {
  width: 100%;
  height: 1px;
  background: rgba(255,255,255,0.2);
  margin: 10px 0;
}





    </style>
  </head>

  <body>
    <div id="map"></div>

    <!-- 📦 MODAL -->
  <div class="modal-overlay" id="modal">
    <div class="modal-card">

      <!-- ❌ CLOSE -->
      <div class="close-btn" onclick="document.getElementById('modal').style.display='none'">
        ×
      </div>

      <!-- 👤 PROFILE -->
      <img class="popup-img" src="https://i.pravatar.cc/150" />
      <div class="popup-name">Juan Dela Cruz</div>
      <div class="popup-role">Police Corporal</div>

      <div class="divider"></div>

    <div class="row-item">
      <div class="row-left">Location</div>
      <div class="row-right">Cabagan, Isabela</div>
    </div>

    <div class="divider"></div>

      <div class="row-item">
        <div class="row-left">Status</div>
        <div class="row-right">On Duty</div>
      </div>

  <div class="divider"></div>

      <div class="row-item">
        <div class="row-left">Duty</div>
        <div class="row-right">Checkpoint</div>
      </div>

       <div class="divider"></div>

      <div class="row-item">
        <div class="row-left">Last Updated</div>
        <div class="row-right" id="timeText"></div>
      </div>

    </div>
  </div>

    </div>

    <script>
     var map = L.map('map').setView([17.4269, 121.7653], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // 🕒 TIME FORMAT
      function formatTime(date) {
        let hours = date.getHours();
        let minutes = date.getMinutes();
        let ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;

        return hours + ':' + minutes + ' ' + ampm;
      }

      document.getElementById("timeText").innerText =
        "Last Updated: " + formatTime(new Date());

      // 🧭 PIN ICON
      var profileIcon = L.divIcon({
        className: '',
        html: \`
          <div class="pin-container">
            <div class="pin-circle">
              <img src="https://i.pravatar.cc/100" />
            </div>
            <div class="pin-arrow"></div>
          </div>
        \`,
        iconSize: [60, 75],
        iconAnchor: [30, 75]
      });

      // 📍 MARKER
      L.marker([17.4269, 121.7653], { icon: profileIcon })
        .addTo(map)
        .on('click', function () {
          document.getElementById("modal").style.display = "flex";
        });

      // ❌ CLOSE MODAL WHEN CLICK OUTSIDE CARD
      document.getElementById("modal").addEventListener("click", function (e) {
        if (e.target.id === "modal") {
          document.getElementById("modal").style.display = "none";
        }
      });

    </script>
  </body>
  </html>
            `
          }}

        />

      {taskModalVisible && (
        <Pressable style={styles.taskOverlay} onPress={closeTaskModal}>
          
          <Animated.View
            style={[
              styles.taskModal,
              { transform: [{ translateY: slideAnim }] }
            ]}
          >

            {/* TITLE */}
            <Text style={styles.taskTitle}>My Task</Text>

            <View style={styles.tabRow}>
          {['All', 'Duty', 'Alert'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.activeTabButton
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>


<View style={styles.taskCard}>

  {/* TOP ROW */}
  <View style={styles.taskHeader}>

    {/* LEFT: ALERT */}
    <Text style={styles.alertText}>Alert</Text>

    {/* RIGHT: STATUS + TIME */}
    <View style={styles.statusContainer}>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Pending</Text>
      </View>

      <Text style={styles.timeText}>10:30 PM</Text>
    </View>

  </View>

  {/* Report */}
  <Text style={styles.locationLabel}>Report</Text>
  <Text style={styles.locationValue}>Vehicle accident in front of Xentro Mall.</Text>

{/* LOCATION ROW */}
<View style={styles.locationRow}>
  <View>
    <Text style={styles.locationLabel}>Location</Text>
    <Text style={styles.locationValue}>Xentro Mall Cabagan</Text>
  </View>

  <TouchableOpacity style={styles.locateButton}>
    <Text style={styles.locateText}>Locate</Text>
  </TouchableOpacity>
</View>

</View>

 {/* failed card */}
<View style={styles.taskCardFailed}>

  {/* TOP ROW */}
  <View style={styles.taskHeader}>

    {/* LEFT: ALERT */}
    <Text style={styles.alertText}>Alert</Text>

    {/* RIGHT: STATUS + TIME */}
    <View style={styles.statusContainer}>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Failed</Text>
      </View>

      <Text style={styles.timeText}>2:55 PM</Text>
    </View>

  </View>

  {/* Report */}
  <Text style={styles.locationLabel}>Report</Text>
  <Text style={styles.locationValue}>Vehicle accident in front of Xentro Mall.</Text>

{/* LOCATION ROW */}
<View style={styles.locationRow}>
  <View>
    <Text style={styles.locationLabel}>Location</Text>
    <Text style={styles.locationValue}>Cansan highway</Text>
  </View>

  <TouchableOpacity style={styles.reportButton}>
    <Text style={styles.reportText}>Report</Text>
  </TouchableOpacity>
</View>

</View>

<View style={styles.taskCard}>

  {/* TOP ROW */}
  <View style={styles.taskHeader}>

    {/* LEFT: ALERT */}
    <Text style={styles.alertTextDuty}>Duty</Text>

    {/* RIGHT: STATUS + TIME */}
    <View style={styles.statusContainer}>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Active</Text>
      </View>

      <Text style={styles.timeText}>2:35 PM</Text>
    </View>

  </View>

  {/* Report */}
  <Text style={styles.locationLabel}>location</Text>
  <Text style={styles.locationValue}>Centro, Cabagan Park</Text>

{/* LOCATION ROW */}
<View style={styles.locationRow}>
  <View>
    <Text style={styles.locationLabel}>Duty</Text>
    <Text style={styles.locationValue}>Operation Inspection</Text>
  </View>

  <TouchableOpacity style={styles.locateButton}>
    <Text style={styles.locateText}>Locate</Text>
  </TouchableOpacity>
</View>

</View>
          </Animated.View>

        </Pressable>
      )}

        {/* 🔍 SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Icon name="search" size={22} color="#666" />
          <TextInput
            placeholder="Search here"
            placeholderTextColor="#888"
            style={styles.searchInput}
          />
        </View>

{/* 🔘 BOTTOM NAV */}
<View style={styles.bottomNav}>
  <TouchableOpacity style={styles.navItem}>
    <Icon name="map" size={32} color="#fff" />
  </TouchableOpacity>

  <TouchableOpacity style={styles.navItem} onPress={openTaskModal}>
    <Icon name="assignment" size={32} color="#fff" />
  </TouchableOpacity>

<TouchableOpacity
  style={styles.navItem}
onPress={() => navigation.navigate('UserProfile')}
>
  <Icon name="person" size={32} color="#fff" />
</TouchableOpacity>

</View>

      </View>
    );    
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },


    alertTextDuty: {
  color: '#6b28f1',
  fontSize: 25,        
  fontWeight: 'bold',
  marginBottom: 8,     
},


  // starting task card styles
  taskCard: {
  backgroundColor: '#ffffff',
  borderRadius: 15,
  padding: 15,
  marginBottom: 12,

  borderWidth: 2,           // 👈 ADD
  borderColor: '#6b28f1',

},

locationRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 8,
},

taskHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 8,
},



statusBadge: {
 
  paddingHorizontal: 10,
  paddingVertical: 3,
  borderRadius: 10,
},

statusText: {
  color: '#6b28f1',
  fontSize: 12,
  fontWeight: '600',
},

locationLabel: {
  color: '#6b28f1',
  fontSize: 12,
},

locationValue: {
  color: '#000000',
  fontSize: 14,
  fontWeight: '500',
  marginTop: 2,
},

statusContainer: {
  alignItems: 'flex-end',
},


alertText: {
  color: '#ff4d4d',
  fontSize: 25,        // 🔥 bigger
  fontWeight: 'bold',
  marginBottom: 8,     
},

timeText: {
  color: '#000000',
  fontSize: 10,
  marginTop: 0,
  marginRight: 10,
  fontWeight: 'bold',
},

locateButton: {
  alignSelf: 'flex-end',   // 👈 pushes to right
  marginTop: 10,
  backgroundColor: '#6b28f1',
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 15,
},

locateText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: 'bold',
},

// end of task card styles

//  STYLES for failed



  taskCardFailed: {
  backgroundColor: '#f6e7e7',
  borderRadius: 15,
  padding: 15,
  marginBottom: 12,

  borderWidth: 2,           // 👈 ADD
  borderColor: '#ff4d4d',

},

reportButton: {
  alignSelf: 'flex-end',   // 👈 pushes to right
  marginTop: 10,
  backgroundColor: '#ff4d4d',
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 15,
},

reportText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: 'bold',
},





    tabRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  marginBottom: 20,
  marginHorizontal: 10,
},

tabButton: {
  flex: 1,
  paddingVertical: 10,
  marginHorizontal: 5,
  borderRadius: 20,
  backgroundColor: '#d1cdda',
  alignItems: 'center',

  borderWidth: 1.5,
  borderColor: '#6b28f1',

  // ✅ SHADOW (iOS)
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.25,
  shadowRadius: 4,

  // ✅ SHADOW (Android)
  elevation: 5,
},

activeTabButton: {
  backgroundColor: '#ffffff', // 👈 active = white
    borderWidth: 1.5,          // ✅ ADD THIS
  borderColor: '#1c1c4d',    // ✅ OUTLINE COLOR
},

tabText: {
  color: '#1c1c4d', // 👈 text color
  fontWeight: '600',
  fontSize: 15,
},

activeTabText: {
  color: '#1c1c4d', // same but keeps consistency
},

taskOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'flex-end',

  zIndex: 999,       // 👈 important
  elevation: 999,    // 👈 VERY important for Android
},

taskModal: {
  backgroundColor: '#ffffff',
  padding: 20,
  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,
  minHeight: 500,
},

taskTitle: {
  fontSize: 30,
  fontWeight: 'bold',
  color: '#1c1c4d',
  marginTop: 20,
  marginBottom: 50,
  marginLeft: 10,
  textAlign: 'left',
},





taskClose: {
  position: 'absolute',
  top: 10,
  right: 15,
},

    searchContainer: {
      position: 'absolute',
      top: 50,
      left: 20,
      right: 20,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      paddingHorizontal: 15,
      height: 50,
      borderRadius: 14,
      elevation: 5,
    },

    searchInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 14,
      color: '#000',
    },

    bottomNav: {
      position: 'absolute',
      bottom: 25,
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: '#2d2da8',
      paddingVertical: 12,
      paddingHorizontal: 35,
      borderRadius: 30,
      width: 260,
      elevation: 10,


    },

    navItem: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });