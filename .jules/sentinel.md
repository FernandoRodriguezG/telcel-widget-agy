## 2024-10-22 - [Secure Keychain Access]
**Vulnerability:** Weak default iOS Keychain access configuration. `SecItemAdd` was called without `kSecAttrAccessible`, leaving credential storage reliant on default accessibility settings, which can be overly permissive and allow backups.
**Learning:** Default Keychain access controls might sync or expose passwords to undesired locations or backups.
**Prevention:** Always explicitly define `kSecAttrAccessible` (like `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) when setting sensitive values like passwords.
