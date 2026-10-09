# Code Signing — Esportra Air

To sign the installer:
1. Obtain an EV code signing certificate (recommended) or standard OV certificate from a CA.
2. Set the following environment variables before running `npm run build`:
   - CSC_LINK — path or PKCS#12 base64 of the signing certificate
   - CSC_KEY_PASSWORD — password for the certificate
3. electron-builder reads CSC_LINK and CSC_KEY_PASSWORD automatically for Windows signing.
4. For CI: store CSC_LINK as a base64-encoded secret in your CI provider.

Without signing, Windows SmartScreen will warn on first run. This is expected for unsigned builds.
