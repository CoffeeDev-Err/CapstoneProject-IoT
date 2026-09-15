# GeoSentri Local Android APK Build Using `C:\cbm`

This guide is for the VS Code **Git Bash** terminal. `C:\cbm` is a short-path build workspace used to avoid Windows CMake path-length errors. Make all code changes in the original repository, then sync them to CBM before building.

## Important locations

| Purpose                                      | Location                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| Original mobile source                       | `C:\desktop\GeoSentri-PNP_System\bantaycabagan-mobileapp` |
| Short-path build workspace                   | `C:\cbm`                                                  |
| Verified APK output                          | `C:\cbm\dist-apk`                                         |
| Shared domain contract used by type-checking | `C:\contracts\domain-contracts.json`                      |

Do not make permanent code changes directly inside `C:\cbm`. A later sync or fresh preparation can replace them.

## Routine process after changing the code

### 1. Save and test changes in the original repository

Open Git Bash in the repository:

```bash
cd /c/desktop/GeoSentri-PNP_System
git status
```

The CBM preparation script copies the current working files, including changes that have not been committed yet. Committing first is still recommended so the exact build can be recovered later.

### 2. Choose a valid Android version code

Every APK update must have a `versionCode` equal to or higher than the version already installed. For a new release, use the next unused number. After version code 29, normally use 30, then 31, and so on.

If a phone is connected through USB debugging, check its installed version:

```bash
"/c/Users/leoga/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell dumpsys package com.bantaycabagan.mobileapp | grep -E "versionCode|versionName"
```

Update the same integer in both files:

- `bantaycabagan-mobileapp/app.json` under `expo.android.versionCode`
- `bantaycabagan-mobileapp/android/app/build.gradle` under `defaultConfig.versionCode`

The visible version, such as `2.2.3`, is `version` in `app.json`, `version` in `package.json`, and `versionName` in `android/app/build.gradle`. Keep those three values equal whenever the visible version changes.

The build preflight also checks a connected phone automatically. It stops before the long Gradle build if the configured version code is lower than the installed one.

### 3. Sync the latest source to CBM

Run this from any Git Bash directory:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/desktop/GeoSentri-PNP_System/bantaycabagan-mobileapp/scripts/local-android/prepare-cbm.ps1"
```

The script:

- copies the current mobile source into `C:\cbm`;
- retains the existing Gradle, CMake, and `node_modules` caches;
- runs `npm ci` only when dependencies changed or `node_modules` is missing;
- copies the shared domain contract to `C:\contracts`;
- restores the current verified build script at `C:\cbm\build-local-apk.ps1`;
- checks that the local `.env`, EAS-compatible credentials, and release keystore are available.

Wait for:

```text
CBM WORKSPACE READY
```

### 4. Run the fast preflight check

```bash
cd /c/cbm && powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/cbm/build-local-apk.ps1" -PreflightOnly
```

Continue only after this appears:

```text
LOCAL APK PREFLIGHT PASSED
```

The preflight validates the package, app and native versions, HTTPS production configuration, TypeScript, release signing key, Android architectures, and the connected phone's installed version code when available.

### 5. Build the APK

```bash
cd /c/cbm && powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/cbm/build-local-apk.ps1"
```

The first native build can take 30 to 90 minutes or longer. Later builds are usually faster because Gradle and CMake reuse their caches. A percentage that stays unchanged for a while during a CMake task does not necessarily mean the build has stopped.

The build is complete only when this appears:

```text
LOCAL APK BUILD VERIFIED
```

The output filename follows this pattern:

```text
C:\cbm\dist-apk\GeoSentri-<version>-v<versionCode>-arm-universal.apk
```

For version 2.2.3 and code 29:

```text
C:\cbm\dist-apk\GeoSentri-2.2.3-v29-arm-universal.apk
```

The ARM universal APK includes `arm64-v8a` for modern phones and `armeabi-v7a` for older 32-bit ARM phones.

### 6. Install it as an update

Connect the phone, enable USB debugging, and accept the authorization prompt. Check the connection:

```bash
"/c/Users/leoga/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices
```

The device status must be `device`. Install the exact new APK filename:

```bash
"/c/Users/leoga/AppData/Local/Android/Sdk/platform-tools/adb.exe" install -r "/c/cbm/dist-apk/GeoSentri-2.2.3-v29-arm-universal.apk"
```

`-r` updates the existing app and preserves its local app data. Do not uninstall the existing app unless losing local drafts and other device-only data is acceptable.

Confirm the installed version:

```bash
"/c/Users/leoga/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell dumpsys package com.bantaycabagan.mobileapp | grep -E "versionCode|versionName"
```

## Recreate CBM when it is damaged or stale

Use a fresh preparation after deleting or renaming source files, changing native dependencies, or encountering unexplained stale build behavior:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:/desktop/GeoSentri-PNP_System/bantaycabagan-mobileapp/scripts/local-android/prepare-cbm.ps1" -Fresh
```

The script does not immediately delete the old workspace. It renames it to a timestamped backup such as `C:\cbm-backup-20260913-230000`, creates a real `C:\cbm` directory, copies the source, and installs the exact dependencies. After the new APK has been built and tested successfully, the backup may be deleted manually.

Then repeat the preflight, build, and installation steps above.

## Common errors

| Error                                  | Meaning and action                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INSTALL_FAILED_VERSION_DOWNGRADE`   | The APK version code is lower than the installed app. Increase it in both version files, sync CBM again, and rebuild.                              |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | The installed app and APK use different signing keys. Do not uninstall immediately if local data must be preserved. Verify which APK is installed. |
| `unauthorized` from `adb devices`  | Unlock the phone and accept its USB debugging authorization prompt.                                                                                |
| No device is listed                    | Enable Developer options and USB debugging, reconnect the cable, and select a USB mode that permits data transfer.                                 |
| `package appears to be invalid`      | Install through ADB to obtain the specific `INSTALL_FAILED_...` reason instead of relying on the generic phone message.                          |
| The command stops after `-File`      | Paste the complete command on one line, including the quoted `.ps1` path.                                                                        |

## Before distributing an APK

Confirm all of the following:

- The terminal displayed `LOCAL APK BUILD VERIFIED`.
- The filename contains the intended visible version and version code.
- The version code is at least as high as every APK currently installed by testers.
- The package is `com.bantaycabagan.mobileapp`.
- The build reports both `arm64-v8a` and `armeabi-v7a`.
- Installation through `adb install -r` succeeds on at least one actual phone.
- Login, notifications, reports, tasks, and backup-request flows open successfully against the AWS backend.
