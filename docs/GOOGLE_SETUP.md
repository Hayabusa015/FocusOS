# Connecting Google to Cortex

This is a one-time setup, about fifteen minutes. **Google is optional.** Cortex works fully without
it: tasks, capture, Today, XP and the rituals never need it. Connecting adds three things:

- your calendar events on the **Today** schedule;
- your time blocks mirrored to a calendar named **Cortex** in Google, so they show on your phone;
- **email suggestions**: Atlas reads new inbox mail and proposes tasks. Nothing becomes a task
  until you press **Accept**.

## Read this first

- **Use a personal Google account only.** Do not use school email, and do not forward school email
  to the personal account. School email can contain student information.
- **Cortex only ever reads email.** It never sends, deletes, labels or moves a message.
- **Cortex writes to one calendar only: the one it creates, named "Cortex".** Your other calendars
  are read-only to it. This is enforced by Google, not just by Cortex: the permission Cortex asks
  for can only reach calendars Cortex itself made.
- **For each email Cortex reads the sender, subject, date and a ~200-character snippet. Never the
  message body or attachments.** Atlas (Claude) sees those four things and nothing else. Cortex
  keeps only the sender, subject, date and Atlas's proposal.
- Your Google sign-in is stored encrypted by Windows, on this PC only.

## What Cortex asks Google for

| Permission | What it lets Cortex do |
|---|---|
| See, create and change calendars it created (`calendar.app.created`) | Make the "Cortex" calendar and edit events on it. Nothing else. |
| View events on all your calendars (`calendar.events.readonly`) | Show your events on Today. Read only. |
| See the list of your calendars (`calendar.calendarlist.readonly`) | Let you choose which calendars to show. |
| Read your email (`gmail.readonly`) | Look at new inbox messages for suggestions. Read only. |

## Steps

Google rearranges its Cloud console from time to time. If a name below differs slightly, look for
the closest one.

### 1. Create a project and switch on the two APIs

1. Go to <https://console.cloud.google.com> and sign in with your **personal** account.
2. At the top, open the project picker and choose **New project**. Name it `Cortex` and create it.
3. Open **APIs & Services → Library**. Search for **Google Calendar API**, open it, press
   **Enable**.
4. Do the same for **Gmail API**.

### 2. Set up the consent screen (this step matters)

1. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**).
2. App name `Cortex`; your own email for support and contact.
3. **Audience / User type: External.**
4. Under **Data access** (or **Scopes**), add the four permissions in the table above.
5. Add yourself as a **test user**.
6. **Publish the app, so its status is "In production".** Press **Publish app** and confirm.
   - **Do not leave it in "Testing".** Google expires sign-ins for apps in Testing after **7 days**,
     and Cortex would ask you to sign in again every week.
   - You do not need to submit it for verification. It is your own private project.

### 3. Create the sign-in credentials

1. Open **Clients** (or **APIs & Services → Credentials**), then **Create client** (or
   **Create credentials → OAuth client ID**).
2. Application type: **Desktop app**. Name it `Cortex`.
3. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and the **Client secret**
   (starts with `GOCSPX-`).

### 4. Sign in from Cortex

1. In Cortex open **Settings → Google**.
2. Paste the Client ID and Client secret, then press **Sign in with Google**.
3. Your browser opens Google's page. You will see **"Google hasn't verified this app"**. That is
   expected, because it is your own project. Press **Advanced**, then **Go to Cortex (unsafe)**.
4. **Tick every permission box** on the next screen, then press **Continue**. If you leave one
   unticked (for example Gmail), that part will not work.
5. The browser says "Cortex is connected". Go back to Cortex.

Cortex shows **Connected as you@gmail.com**, creates the **Cortex** calendar, and shows your main
calendar on Today. In Settings → Google you can switch other calendars on or off.

## Checking that email works

Google treats permission to read Gmail as a restricted permission, and a private, unverified app
may be refused it. Cortex checks this when you sign in:

- If Settings → Google says **"Last checked …"** under Email suggestions, Gmail works.
- If it says **"Google did not allow Cortex to read Gmail, so email suggestions are off. Calendar
  still works."**, Google refused the Gmail permission. Calendar keeps working. Tell whoever is
  maintaining Cortex so the result can be recorded, and email suggestions stay off.

Email suggestions also need your Anthropic API key (Settings → Atlas), because Atlas does the
reading.

## Disconnecting

- **Settings → Google → Disconnect Google** forgets the sign-in and the cached events on this PC.
  The **Cortex** calendar stays in Google, and your tasks are untouched.
- To also remove Cortex's access on Google's side, open
  <https://myaccount.google.com/permissions>, choose Cortex, and press **Delete all connections**.
  You can delete the **Cortex** calendar from Google Calendar yourself if you no longer want it.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Google needs you to sign in again" | Press **Sign in again**. If it happens every week, the consent screen is still in Testing: publish it (step 2.6). |
| "Google does not recognise that client ID and secret" | Copy them again from Google Cloud → Clients. Check for a stray space. |
| "…API is not switched on for your project" | Enable the Calendar API and the Gmail API (step 1). |
| "Google refused that Calendar request…" | If you already had a calendar called **Cortex** before connecting, rename or delete it in Google Calendar, then sign in again. |
| "Google did not give Cortex a long-lasting sign-in" | Remove Cortex at <https://myaccount.google.com/permissions> and sign in again. |
| The browser never opens | Make sure Windows has a default browser (Settings → Apps → Default apps), then try again. |
| An event moved in Google did not move in Cortex | Press **Sync now**, or wait: Cortex checks every 5 minutes and when the window gets focus. |
