# Voice-call i18n keys (`calls.*`)

Keys used by the stage 3–6 call UI — `src/components/CallStatusCard.tsx`,
`src/components/DoseConfirmationDialog.tsx`,
`src/components/ProviderUnavailableNotice.tsx`, and
`src/pages/CallHistoryPage.tsx`. The integration agent merges the JSON
blocks below into `src/i18n/en.json` and `src/i18n/kn.json` under a
top-level `"calls"` object. (The `common.cancel` key used by the dialog
already exists in both dictionaries.)

> Kannada translations are functional and NOT native-speaker reviewed.
> They need a review pass before real patients use them.

## English (`en.json` → `"calls"`)

```json
"calls": {
  "historyTitle": "Call history",
  "historySubtitle": "Voice reminder calls for your scheduled medicines.",
  "refresh": "Refresh",
  "filterAll": "All",
  "loading": "Loading call history…",
  "loadError": "Could not load call history",
  "noCalls": "No calls yet",
  "noCallsText": "Voice reminder calls will appear here once they are made.",
  "status": {
    "queued": "Queued",
    "calling": "Calling",
    "completed": "Completed",
    "no_answer": "No answer",
    "busy": "Busy",
    "failed": "Failed",
    "voicemail": "Voicemail",
    "cancelled": "Cancelled"
  },
  "scheduledFor": "Scheduled for {{date}}",
  "attemptNumber": "Attempt",
  "retryScheduled": "Retry scheduled",
  "escalation": "Caregiver alert",
  "escalationStatus": {
    "none": "None",
    "pending": "Help requested",
    "notified": "Caregiver notified",
    "declined": "Not sent"
  },
  "response": "Response",
  "responseType": {
    "keypad": "Keypad",
    "speech": "Voice",
    "none": "No response"
  },
  "keyPressed": "key {{key}}",
  "confirmed": "Dose confirmed as taken",
  "notConfirmed": "Dose not confirmed",
  "viewDetails": "View details",
  "dialog": {
    "title": "Confirm dose from call",
    "text": "Call reminder for {{medicine}}, due {{date}}.",
    "safetyNote": "Only confirm if the medicine was actually taken.",
    "confirm": "I have taken it",
    "remindLater": "Remind me later",
    "needHelp": "I need help",
    "confirmedResult": "Recorded as taken. Thank you.",
    "laterResult": "We will remind you again later.",
    "helpResult": "Help requested. Your caregiver will be informed.",
    "close": "Close"
  },
  "notConfigured": {
    "title": "Voice calls are not configured",
    "text": "Voice reminder calls are not set up yet, so no calls will be made."
  },
  "offline": {
    "title": "You are offline",
    "text": "Voice calls need an internet connection. Call records will update when you are back online."
  },
  "inAppStillAvailable": "In-app reminders still work."
}
```

## Kannada (`kn.json` → `"calls"`)

Functional translation — NOT native-speaker reviewed (see the note above).

```json
"calls": {
  "historyTitle": "ಕರೆಯ ಇತಿಹಾಸ",
  "historySubtitle": "ನಿಮ್ಮ ನಿಗದಿತ ಔಷಧಿಗಳಿಗಾಗಿ ಧ್ವನಿ ನೆನಪು ಕರೆಗಳು.",
  "refresh": "ಮರುಲೋಡ್ ಮಾಡಿ",
  "filterAll": "ಎಲ್ಲಾ",
  "loading": "ಕರೆಯ ಇತಿಹಾಸವನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…",
  "loadError": "ಕರೆಯ ಇತಿಹಾಸವನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ",
  "noCalls": "ಇನ್ನೂ ಯಾವುದೇ ಕರೆಗಳಿಲ್ಲ",
  "noCallsText": "ಧ್ವನಿ ನೆನಪು ಕರೆಗಳನ್ನು ಮಾಡಿದ ನಂತರ ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.",
  "status": {
    "queued": "ಸರದಿಯಲ್ಲಿದೆ",
    "calling": "ಕರೆ ಮಾಡಲಾಗುತ್ತಿದೆ",
    "completed": "ಪೂರ್ಣಗೊಂಡಿದೆ",
    "no_answer": "ಉತ್ತರವಿಲ್ಲ",
    "busy": "ನಿರತವಾಗಿದೆ",
    "failed": "ವಿಫಲವಾಗಿದೆ",
    "voicemail": "ಧ್ವನಿ ಸಂದೇಶ",
    "cancelled": "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ"
  },
  "scheduledFor": "{{date}} ಕ್ಕೆ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ",
  "attemptNumber": "ಪ್ರಯತ್ನ",
  "retryScheduled": "ಮರುಪ್ರಯತ್ನ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ",
  "escalation": "ಆರೈಕೆದಾರರ ಎಚ್ಚರಿಕೆ",
  "escalationStatus": {
    "none": "ಯಾವುದೂ ಇಲ್ಲ",
    "pending": "ಸಹಾಯ ಕೋರಲಾಗಿದೆ",
    "notified": "ಆರೈಕೆದಾರರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ",
    "declined": "ಕಳುಹಿಸಲಾಗಿಲ್ಲ"
  },
  "response": "ಪ್ರತಿಕ್ರಿಯೆ",
  "responseType": {
    "keypad": "ಕೀಪ್ಯಾಡ್",
    "speech": "ಧ್ವನಿ",
    "none": "ಯಾವುದೇ ಪ್ರತಿಕ್ರಿಯೆ ಇಲ್ಲ"
  },
  "keyPressed": "{{key}} ಕೀ",
  "confirmed": "ಔಷಧಿಯನ್ನು ತೆಗೆದುಕೊಂಡಿರುವುದಾಗಿ ದೃಢಪಡಿಸಲಾಗಿದೆ",
  "notConfirmed": "ಔಷಧಿ ದೃಢಪಡಿಸಲಾಗಿಲ್ಲ",
  "viewDetails": "ವಿವರಗಳನ್ನು ನೋಡಿ",
  "dialog": {
    "title": "ಕರೆಯಿಂದ ಔಷಧಿಯನ್ನು ದೃಢೀಕರಿಸಿ",
    "text": "{{medicine}} ಗಾಗಿ ಕರೆ ನೆನಪು, {{date}} ಕ್ಕೆ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ.",
    "safetyNote": "ಔಷಧಿಯನ್ನು ನಿಜವಾಗಿಯೂ ತೆಗೆದುಕೊಂಡಿದ್ದರೆ ಮಾತ್ರ ದೃಢೀಕರಿಸಿ.",
    "confirm": "ನಾನು ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ",
    "remindLater": "ನಂತರ ನೆನಪಿಸಿ",
    "needHelp": "ನನಗೆ ಸಹಾಯ ಬೇಕು",
    "confirmedResult": "ತೆಗೆದುಕೊಂಡಿರುವುದಾಗಿ ದಾಖಲಿಸಲಾಗಿದೆ. ಧನ್ಯವಾದಗಳು.",
    "laterResult": "ನಾವು ನಿಮಗೆ ನಂತರ ಮತ್ತೆ ನೆನಪಿಸುತ್ತೇವೆ.",
    "helpResult": "ಸಹಾಯ ಕೋರಲಾಗಿದೆ. ನಿಮ್ಮ ಆರೈಕೆದಾರರಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ.",
    "close": "ಮುಚ್ಚಿ"
  },
  "notConfigured": {
    "title": "ಧ್ವನಿ ಕರೆಗಳನ್ನು ಹೊಂದಿಸಲಾಗಿಲ್ಲ",
    "text": "ಧ್ವನಿ ನೆನಪು ಕರೆಗಳನ್ನು ಇನ್ನೂ ಹೊಂದಿಸಲಾಗಿಲ್ಲ, ಆದ್ದರಿಂದ ಯಾವುದೇ ಕರೆಗಳನ್ನು ಮಾಡಲಾಗುವುದಿಲ್ಲ."
  },
  "offline": {
    "title": "ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ",
    "text": "ಧ್ವನಿ ಕರೆಗಳಿಗೆ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಬೇಕು. ನೀವು ಮತ್ತೆ ಆನ್‌ಲೈನ್‌ಗೆ ಬಂದಾಗ ಕರೆ ದಾಖಲೆಗಳು ನವೀಕರಿಸಲ್ಪಡುತ್ತವೆ."
  },
  "inAppStillAvailable": "ಆ್ಯಪ್‌ನಲ್ಲಿನ ನೆನಪುಗಳು ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತವೆ."
}
```

## Key inventory (for the merge check)

Every key below must exist in both dictionaries after the merge (47 keys):

- historyTitle, historySubtitle, refresh, filterAll, loading, loadError,
  noCalls, noCallsText
- status.queued, status.calling, status.completed, status.no_answer,
  status.busy, status.failed, status.voicemail, status.cancelled
- scheduledFor, attemptNumber, retryScheduled, escalation,
  escalationStatus.none, escalationStatus.pending,
  escalationStatus.notified, escalationStatus.declined
- response, responseType.keypad, responseType.speech, responseType.none,
  keyPressed, confirmed, notConfirmed, viewDetails
- dialog.title, dialog.text, dialog.safetyNote, dialog.confirm,
  dialog.remindLater, dialog.needHelp, dialog.confirmedResult,
  dialog.laterResult, dialog.helpResult, dialog.close
- notConfigured.title, notConfigured.text, offline.title, offline.text,
  inAppStillAvailable
