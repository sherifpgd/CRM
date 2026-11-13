# Consultancy CRM – Setup Guide

What you get:
- **Today screen**: overdue tasks, today's tasks and the next 7 days, plus leads that have no next step.
- **Leads and clients** go through the stages Enquiry → Quotation sent → Negotiation → Won / Lost, with notes, call logs and full history.
- **Tasks** can have due dates, times and repeats (for example quarterly VAT returns).
  - You get a **7 AM email** every day.
  - You get an **email 15 minutes before** any task that has a time.
  - You get **pop-ups** while the CRM is open.
- **Task from WhatsApp**: copy a client's message, click **💬 From WhatsApp**, and the task is created. It is linked to the client, with the date picked up from the message.
- **Staff logins** with roles, an **activity log**, light/dark theme, phone-friendly layout, and Excel export.

Cost: **free**. You need a GitHub account and a Google account.

| Part | What | Time |
|---|---|---|
| **A** | WhatsApp on your computer (the old phone can stay off) | 5 min |
| **B** | Put the CRM online (GitHub Pages) | 10 min |
| **C** | Shared database and reminder emails (Google Sheet) | 15 min |
| **D** | Add staff, phones, light/dark mode | 5 min |
| **E** | Google Calendar (optional) | 5 min |

---

## A. WhatsApp on the computer (no CRM connection needed)

Your number keeps working on the computer even when the old phone is switched off.

1. Install **WhatsApp** from the Microsoft Store, or open <https://web.whatsapp.com> in Chrome.
2. On the old phone, open WhatsApp → **⋮ / Settings → Linked devices → Link a device**, then scan the QR code on the computer.
3. Done. You can read and reply from the computer. You can link up to 4 computers or browsers to the same number.

> ⚠ **Important:** switch the old phone on and connect it to Wi-Fi **at least once every 14 days**. If you don't, WhatsApp signs out the linked computers.
> Easiest option: leave the old phone on a charger with office Wi-Fi.

When a client's WhatsApp button is clicked in the CRM, the chat opens in this WhatsApp, with the message template already typed.

---

## B. Put the CRM online with GitHub Pages

1. Go to <https://github.com> and sign in. Click **+ → New repository**.
   - Name: `crm` · Visibility: **Public**. The code holds no client data, which stays in Google. Click **Create repository**.
2. Click **uploading an existing file** and drag in these files from `D:\Claude\consultancy-crm`:
   `index.html`, `app.js`, `manifest.json`, `sw.js`, `icon.svg`, `.gitignore`, `SETUP.md`
   - Don't upload the `apps-script` folder. That code goes into Google (Part C).
3. Click **Commit changes**.
4. Open **Settings → Pages**. Under *Branch*, choose **main** and **/ (root)**, then click **Save**.
5. After about a minute, the CRM is at `https://YOUR-GITHUB-NAME.github.io/crm/`

You can already use it now, with data saved in that browser only. To try it, go to **Settings → Load sample data**. Remove the sample data before Part C.

---

## C. Shared database (Google Sheet in your other Google account)

The database lives in the Google account you choose. Reminder emails are sent from that account.

> **Use a Chrome Incognito window** (Ctrl + Shift + N) for every step in this part, and sign in there with **only the database account**.
> Google's permission pop-ups break when several Google accounts are signed in at once.

1. In the Incognito window, sign in to the **database Google account**. Then go to <https://sheets.new> and name the sheet **CRM Database**.
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor. Open `D:\Claude\consultancy-crm\apps-script\Code.gs` in Notepad, copy all of it, paste it in, and click 💾 **Save**.
4. Click **⚙ Project Settings** (left side). Set **Time zone** to **(GMT+04:00) Dubai**.
5. Go back to the **Editor** (`< >`). In the function list at the top, choose **setup**, then click **▶ Run**.
   - Google asks for permission: **Review permissions → choose the database account → Advanced → Go to project (unsafe) → Allow**.
     Google shows this warning for every new script. The script only uses this one sheet and sends your reminder emails.
   - Open **Execution log** and copy the **SETUP KEY**. You need it once, in step 7.
6. Click **Deploy → New deployment** → ⚙ next to *Select type* → **Web app**.
   - *Execute as*: **Me**  · *Who has access*: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
   - "Anyone" only means the CRM can reach the sheet. Every request still needs a staff user name and password.
7. In your normal browser, open the CRM and go to **Settings → Google Sheet**. Paste the **Web app URL**, then click **Connect**.
   Enter the **setup key**, your name, **your email** (this is where reminders go), a user name and a password (8+ characters).
   - If the CRM already has data in that browser, choose **OK** to upload it.
8. Go to **Settings → Company & lists**. Enter your company name and the **CRM web address** from Part B, so the reminder emails include a link. Click **Save**.
9. Go to **Settings → My account → Send me a test email** to check that emails work.
10. **Build the sign-in into the CRM** so staff never need the long URL:
    - On GitHub, open your `crm` repository and click `index.html`, then click ✏️ (Edit).
    - Find the line `window.CRM_CONFIG = { apiUrl: "" };` near the bottom.
    - Paste the Web app URL between the quotes: `window.CRM_CONFIG = { apiUrl: "https://script.google.com/macros/s/…/exec" };`
    - Click **Commit changes**. From now on, anyone who opens the CRM address sees the **staff sign-in** screen straight away.

### If you change Code.gs later
In Apps Script, go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The web app URL stays the same.

---

## D. Staff, phones and reminders

- **Add staff:** go to **Settings → Users & access → + Add user**. Enter the name, user name, role, **email** (for their reminders) and a temporary password.

  | Role | Can do |
  |---|---|
  | **Admin** | Everything, including users, settings and the activity log |
  | **Manager** | All clients and tasks, delete, export, activity log |
  | **Staff** | Add and edit clients and tasks |
  | **Viewer** | Look only |

- **Each computer or phone:** open the CRM address and sign in with your own user name and password. Every action is recorded under that person's name in the **Activity log**.
- **Forgotten password:** an Admin opens **Settings → Users → Edit** and types a new password. Staff can change their own under **Settings → My account**.
- **Mobile app:** open the CRM in Chrome (Android) → **⋮ → Add to Home screen**, or in Safari (iPhone) → **Share → Add to Home Screen**.
  It opens full-screen like an app, with a bottom tab bar (Today · Clients · + Add · Tasks · More) and a top bar showing who is signed in, a ☀/🌙 button and a sign-out button.
- **Light / dark mode:** click the **🌙 / ☀️** button (bottom-left on a computer, top-right on a phone), or go to **Settings → Light / dark mode**. *Same as device* follows the phone's or computer's own setting. Each person's choice is remembered on their own device.
- **Pop-up reminders:** on the Today screen, click **Turn on** under *Turn on pop-up reminders* and allow notifications. Pop-ups appear while the CRM is open in a browser tab, so keep it pinned.
- **Emails:** every person with an email gets their **overdue and today's tasks at 7 AM**, plus an email **15 minutes before** any task with a time. Tasks not assigned to anyone go to the Admins.

---

## E. Google Calendar (optional)

There are two ways to use it, and you can use both:

**1. One task at a time, into your own calendar.** Open any task with a date → **📅 Add to Google Calendar**. Google Calendar opens with the task filled in. Click **Save**. Nothing needs setting up.

**2. Automatic: every task in a shared "CRM Tasks" calendar.**
1. In the **Incognito window signed in to the database account**, open Apps Script. Paste the latest `Code.gs` if you haven't already, then click **Save**.
2. Choose **setupCalendar** in the function list → **▶ Run** → **Allow**. Google now asks for Calendar permission too.
   This creates a calendar called **CRM Tasks** and adds all open tasks.
3. Click **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
4. In the CRM, go to **Settings → Google Calendar**. Make sure **Put tasks in Google Calendar automatically** is ticked, then click **Save**.
   - Optional: tick **Also add each task to the assigned staff member's own calendar**. Each person then sees their own tasks in their own Google Calendar, using the email in their user profile.
5. **See it on your own Google account and phone:** in the database account, open <https://calendar.google.com>. Next to **CRM Tasks** click **⋮ → Settings and sharing → Share with specific people → + Add people**, enter your main Gmail address, and choose *See all event details*.
   Accept the email you receive. The calendar then appears in the Google Calendar app on your phone.

How it behaves:
- A task with a time becomes a 30-minute event with a pop-up 15 minutes before. A task without a time becomes an all-day event with a pop-up the day before.
- Changing a task's date moves the event. Ticking a task done or deleting it removes the event.
- The calendar is updated from the CRM only, so edits made directly in Google Calendar don't come back into the CRM.

---

## Everyday use

### The Home screen
Three boxes at the top show **Tasks today**, **Payments to chase** and **Clients waiting**. Click a box to jump to its list.
- **Tasks:** tap the circle (or **Done**) when something is finished. **Later** moves it to tomorrow.
- **Payments to chase:** **💬 Remind** opens WhatsApp with a ready-written message. **Got paid** records the money.
- **Clients waiting:** enquiries with no next step. Tap **+ Follow-up** so you're reminded.
- On a phone, the big **+** button at the bottom adds a task, a task from WhatsApp, a client or an invoice.

### Payments (so you never forget to chase money)
1. When you send an invoice, open **Payments → + New invoice** and enter the client, amount, what it's for and the due date.
   - When you mark an enquiry as **Won**, the CRM offers to add the invoice straight away.
   - For **monthly fees and retainers**, choose **Repeat: Every month**. The next invoice is then created automatically each month.
2. Once the due date passes, the invoice appears under **Payments to chase** on the Home screen and in your **7 AM email**.
3. Tap **💬 Remind**.
   - The CRM picks the right message (*Before due date*, *Friendly reminder* or *Overdue notice*) with the amount, due date and days overdue filled in. You can edit the text before sending.
   - Choose when to be reminded again (3, 7, 14 or 30 days), then tap **Send on WhatsApp**. You can also tap **Email**, or **I called them** if you phoned instead.
   - Every reminder is saved, so you can see "Reminded 3× – last 5 days ago".
4. When money arrives, tap **Got paid** and enter the amount, date and method (bank transfer, cash, cheque…).
   Part payments are fine: the CRM keeps chasing the balance.
5. Set this up once in **Settings → Company**:
   - **Bank details**, which are added to every payment reminder.
   - **How often to chase**, which is every 7 days by default.

You can edit the reminder messages in **Settings → WhatsApp messages**.

### Documents for VAT & corporate tax registration
- A client whose service is **VAT registration** or **Corporate tax registration** gets a **📄 Documents** checklist on their page automatically.
  To add another checklist (for example, a client who needs both), choose it from **+ Checklist**.
- Tick each document as it arrives. The client list shows progress like "📄 5/13 docs".
- Tap **💬 Ask for the missing documents**. WhatsApp opens with a numbered list of **only the documents still missing**.
  Choose when to be reminded (2, 3 or 5 days, or 1 week), and a "Check documents received" task is created. When the last document is ticked, that task completes itself.
- You can also ask for documents from **Send a message… → 📄 Ask for missing documents**. Any WhatsApp message that contains **{documents}** fills in the missing list.
- To change the lists, go to **Settings → Document checklists**. Put one document per line, and give the checklist the same name as the service.

### Monday summary email
Every Monday at 8 AM, each **Admin and Manager** with an email gets last week's summary:
- new enquiries
- quotations sent, won and lost
- money received
- overdue payments and tasks
- a table of what each staff member did (tasks completed, clients added, payment reminders sent, deals won)

To try it straight away, use **Settings → Monday summary email → Send me last week's summary now**. You can switch it off on the same card.

### Import your existing clients from Excel
1. Go to **Clients → ⬆ Import**, or **Settings → Import clients from Excel**.
2. Either choose your **.xlsx** or **.csv** file, or copy the cells in Excel (including the header row) and paste them in.
   The first row must contain column names, such as Name, Company, Phone, Email, Service, Stage. **Download an example file** shows the layout.
3. The CRM guesses which column is which. Check the matches and change any that are wrong.
4. Choose the stage for rows without one (normally **Won (existing client)**), and what to do when a phone number is already in the CRM (**Skip** or **Fill in missing details**).
5. Click **Import**. UAE numbers like `050 123 4567` are converted to WhatsApp format automatically.

> **Already set up the Google Sheet?** Paste the new `Code.gs` into Apps Script, click Save, run **setup** once more (this schedules the Monday email; your setup key stays the same), then **Deploy → Manage deployments → ✏️ → New version → Deploy**.
> The **Payments** sheet is created automatically.

- **Quick task:** type it in plain words in the box at the top, for example `Send quotation to Ahmed by Thursday 3pm`. The date, time and client are picked up automatically.
- **Task from WhatsApp:** in WhatsApp, right-click the message and choose **Copy**. In the CRM, click **💬 From WhatsApp**, or just press **Ctrl + V** on the Today screen.
  The CRM suggests the task (for example *"Send quotation to …"* when the client asks about prices), the due date, and the client. If the number is new, it adds them as a new lead.
- **Quotation sent:** when you move a lead to *Quotation sent*, the CRM asks you to set a follow-up reminder.
- **Leads with no next step:** this list on the Today screen shows open leads with no task, so nothing gets forgotten.
- **Repeating work** (VAT returns, renewals): set **Repeat** on the task. When you tick it done, the next one is created automatically.
- **WhatsApp templates:** open a client and choose **Send a template…**. Edit the templates in **Settings**.
- Make changes in the CRM, not directly in the Google Sheet. Make an occasional **Settings → Full backup**.

### If something goes wrong
- **Lost the setup key:** in Apps Script, run **showSetupKey**.
- **All admins locked out:** in Apps Script, open **resetAdminPassword**, edit the two lines at the top, then run it.
- **Phone lost or staff member left:** go to **Settings → Users → Edit → Disabled**. To sign out everyone, run **signOutEveryone**.
