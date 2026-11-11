# Android store preparation

The owner does not yet have a Google Play Console account. No Play listing or submission has been created. Creating and verifying that account, providing a public developer name/support email, and completing the Console declarations are owner steps.

## Build and signing

- Application ID: `app.mlibrary.reader`; version 1.5.0, code 9; Android 8+; target SDK 36.
- `scripts/setup-signing.ps1` creates a permanent RSA-4096 upload key under ignored `.private/`. The password is protected with Windows DPAPI for the signing account. The directory ACL permits that account and SYSTEM.
- Run `npm run android:store` to build the non-debuggable signed AAB and a release APK. Signing variables exist only for the build process; neither password nor private key is committed or uploaded.
- The generated public certificate is `artifacts/MLibrary-upload-certificate.pem`. Register this as the upload certificate when enrolling in Play App Signing; let Play generate the distribution signing key.
- Version 1.5.0's store APK/AAB signatures were verified and Google's bundletool 1.18.1 accepted the AAB. The store APK is non-debuggable. No `.so` libraries are packaged; the Console pre-launch and device checks still remain before submission.
- The existing GitHub APK keeps its previous development certificate for update compatibility. The store package uses a different certificate. It cannot install over the existing sideloaded app. Export a full backup before uninstalling the old package, install the store version, and restore the backup. Never uninstall as part of an automated update test.
- Keep a private backup of the upload keystore. The DPAPI password file alone cannot be decrypted on a different Windows account/machine. Export the password into a trusted password manager on the signing computer before retiring it; never put it in a GitHub release or repository. Google Play supports requesting a replacement upload key if necessary.

## Draft listing

Name: **MLibrary**

Short description: **Read books in English, French and Arabic. Save highlights and share quotes.**

Full description:

Build a personal reading library from public collections and your own EPUB, PDF and text files. Read inside MLibrary with adjustable typography, paper, sepia and night themes, bookmarks and animated page turns. Explore collections in English, French and Arabic, including classic literature, open-access research and Arabic heritage texts.

Highlight passages, save notes and design quote cards for stories or other formats. For scanned pages, select a region and extract its text with on-device OCR or optional online OCR. Track your reading time and milestones, organize books with tags, and edit titles and authors for imported books.

Keep downloaded books offline. Export a portable backup including your book files, or enable encrypted device sync for your shelves, progress and notes using a private recovery key. Availability varies by provider and edition; some books require borrowing or your own copy.

## Submission checklist requiring the owner's account

- Create and verify the Play developer account; create the app entry and choose its distribution countries and audience.
- Supply developer display name and a reachable public support email. Replace the temporary support paragraph in `/privacy.html` with that contact before submission.
- Upload the AAB to an internal test track first. Inspect the Play pre-launch report and 16 KB native-library compatibility result; complete any account-specific closed-testing requirement shown by Console.
- Category: Books & Reference. The app itself has no ads or paid purchases. External source websites may have their own content or advertising.
- Complete content rating and Data safety accurately: optional cloud sync sends encrypted user content; online OCR sends the selected image region to OCR.space; catalogue requests include search terms; hosting/providers process operational network data. Do not declare “no data collected” solely because sync is encrypted.
- Privacy URL: `https://mlibrary-fedimechergui.netlify.app/privacy.html`. Review third-party policies and actual hosting retention before submitting legal declarations.
- Screenshots must show the final build on a real emulator/device; use the release validation artifacts. Launcher assets are generated from `public/icon.svg`. A 512 px store icon and 1024×500 feature graphic are required in the listing package.

The GitHub release includes `MLibrary-1.5.0-store-assets.zip`: the 512×512 icon, 1024×500 feature graphic, three 1080×1920 screenshots captured from the final Android client, these instructions and the privacy document. The screenshots show public French/Arabic books, without personal notes or sync keys. `SHA256SUMS.txt` covers the packages, artwork archive and public certificate.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756), [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469).
