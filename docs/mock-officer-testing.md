# Mock officer testing

The optional mock officer provides a second mobile login without requiring another physical GPS tracker. It uses a simulated Cabagan Municipal Hall location and an always-active test deployment so backup requests can be exercised immediately.

## Local test account

- Login ID: `officer.mock`
- Initial password: `MockOfficer!2026`
- Personnel ID: `psms-002`
- GPS device: none (simulated location)

Login still uses the normal one-time verification code. When `MOCK_OFFICER_EMAIL` is empty, the code is sent to the `+mock-officer` alias of `GMAIL_USER`, which arrives in the same Gmail inbox. Set `MOCK_OFFICER_EMAIL` explicitly if a different tester should receive the code.

## Test a backup request

1. Start the backend so the enabled seed is applied.
2. Sign in on the second phone with the mock account and enter the emailed OTP.
3. To test the mock officer as requester, open Map and tap the backup button. Its seeded deployment is already active.
4. On the GPS-linked officer phone, open Tasks and accept the request.
5. To reverse the roles, create a request from an actively deployed GPS-linked officer, then accept it from the mock officer's Tasks screen.

## Edit the account

In the supervisor web portal, open **Account Management > Manage Accounts**, search for `officer.mock`, and select **Edit**. Name, badge, rank, login ID, official email, password, mobile number, photo, and status can be updated without selecting a GPS device.

The seed does not overwrite edited login details or passwords on later restarts. Set `ENABLE_MOCK_OFFICER=false` and deactivate the account in Account Management when testing is finished.
