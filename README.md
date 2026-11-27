# Passcode Lock

A small free web app that helps keep Instagram and TikTok off an iPhone.

It works together with iOS **Screen Time**. Screen Time does the actual blocking.
This app makes the Screen Time passcode, hides it, and only shows it again after a
waiting period (24 hours by default). An urge to open Instagram has time to pass
before you can undo the block.

There is no App Store, no account, no server and no cost. The page runs entirely in
your browser. The passcode is stored only on your phone and is never sent anywhere.

## Set up (once, about 10 minutes)

Do these on the iPhone.

1. **Install the app.** Open the app's web address in **Safari**, tap Share, then
   **Add to Home Screen**. From now on, open it only from that Home Screen icon.
2. **Start setup** in the app and pick a waiting time. Longer is stricter.
3. **Turn on the Screen Time lock.** Go to Settings > Screen Time. Turn Screen Time on
   if it is off. Tap **Lock Screen Time Settings** and enter the code (hold the button in
   the app to see it).
   When iOS asks for an Apple ID for recovery, **enter yours.** Without it, a forgotten
   code means erasing the phone.
4. **Put Instagram and TikTok back temporarily.** Install both from the App Store.
   Do not log in.
5. **Limit them.** Go to Settings > Screen Time > App Limits > Add Limit. Open the Social
   category, tick Instagram and TikTok, choose **1 minute**, every day. Turn on
   **Block at End of Limit**.
6. **Check it works.** Open each app for about a minute. A Screen Time lock screen should
   appear, and "Ask For More Time" should ask for the passcode.
7. **Check whether the limit survives deleting the apps.** Delete one app. In App Limits,
   see whether it is still listed. Reinstall it and open it. If the limit is still
   there, you can delete both apps again. If not, leave them installed and locked.
8. Tap **I've entered it in Screen Time** in this app.

## Everyday use

- **Locked:** the passcode is hidden. Nothing to do.
- **You need the passcode** (for example, to install another app): tap **Request
  passcode**. Come back when the timer ends. The code is then visible for 15 minutes.
- **When you are done,** tap **Change to a new code**, then change the passcode in
  Settings > Screen Time > Change Screen Time Passcode. That way the old code stops
  working and you cannot reuse it later.
- The wait can be made longer at any time. Making it shorter needs the passcode first,
  so you cannot dodge the wait by shrinking it.

## What this does not stop

Be honest with yourself about these. They are why this is "annoying to undo" and not
impossible to undo.

- About a minute a day of each app still works, and iOS may offer one extra minute.
- **Forgot Passcode?** with your Apple ID can reset the Screen Time code. Do not use it
  on impulse.
- The websites instagram.com and tiktok.com are not blocked. To block them as well, go
  to Settings > Screen Time > Content & Privacy Restrictions > Content Restrictions >
  Web Content > Limit Adult Websites, then add both sites under Never Allow.
- The passcode is saved in the browser. If you clear Safari's website data, the app
  forgets the code. Screen Time still has it, so you would use **Forgot Passcode?** to
  reset it.
- If the 15 minutes run out while you are changing the code, the app keeps the old code.
  If you had already changed it on the phone, use **Forgot Passcode?** to reset it.
- A four-digit code can be memorised. Changing it after every reveal limits that.

## Why a web app and not an iPhone app

A normal iPhone app needs a paid Apple developer account to stay installed (a free
one expires every 7 days), and Apple's Screen Time interface for apps needs a special
paid permission. A web page added to the Home Screen is free and does not expire.

## Development

No dependencies. Needs Node 20 or newer for the tests.

```
npm test                       # unit tests for the lock logic
python -m http.server 8000     # then open http://localhost:8000
```

- `lock.js`: the lock rules. Pure functions with an injectable clock.
- `app.js`, `index.html`: the screens.
- `sw.js`: keeps the page working offline.
- `tests/lock.test.js`: tests for every state change and rule.
