# Accounts, email codes, admin Settings and Neon database: setup guide

All of this is done in the browser. Nothing here needs a terminal.

**What you get**
- Anyone new must **Register** (name, email, phone, password), receive a **6 digit code by email**, enter it, and then **Log in** with email and password.
- Projects, room library and rate presets are saved to your **Neon** database for each person, so they follow them to any device.
- Only the **admin** (you) sees **Settings** in the account menu: paste the Gmail **App Password** to connect the mail app, change the contact details, close registration, and manage users.
- If you do not set `DATABASE_URL`, the site works exactly as before (no login, browser storage).

## Step 1. Create the Neon database (free)
1. Go to **neon.tech** and sign up. Create a project (any name, pick the region nearest your users).
2. On the project dashboard click **Connect**. Choose the **pooled** connection string and **copy** it. It starts with `postgresql://`.
3. You do not need to create tables. The site creates them automatically the first time it runs.

## Step 2. Create a Gmail App Password (this is the "mail app security key")
1. Open your Google Account, **Security**, and turn on **2-Step Verification**.
2. Search for **App passwords**, create one named `BuildVision`, and copy the 16 characters Google shows. Spaces do not matter.
3. This is the key you paste in the site's Settings. Never use your normal Gmail password.

## Step 3. Add the settings in Vercel
Vercel project, **Settings**, **Environment Variables**. Add these (all environments):

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon string from Step 1 |
| `APP_SECRET` | any long random text, 40+ characters (keep a copy) |
| `ADMIN_EMAIL` | your own email. The account you register with this email becomes admin |
| `SMTP_USER` | your Gmail address (only for the first start) |
| `SMTP_PASS` | the App Password from Step 2 (only for the first start) |

Then **Deployments**, the latest one, **Redeploy**. (If you uploaded new code to GitHub, Vercel redeploys by itself, but environment variables only apply to a new deployment.)

Why `SMTP_USER` / `SMTP_PASS` at first: your own account must receive a code before you can open Settings, so the site needs one working mail key to start. Once you are in, paste the key in Settings and you may delete these two variables.

## Step 4. First login
1. Open your site. You see **Register**. Use the **same email as `ADMIN_EMAIL`**.
2. A code arrives in that inbox (check spam). Enter it. Then log in with your email and password.
3. Click your initial (top right), then **Settings** (only you see it).

## Step 5. Connect the mail app in Settings
Settings, **Email**: type your Gmail address, paste the App Password, press **Save and connect**. The site checks the key with Gmail first and only saves it if the login works. The panel then says which address mails are sent from. Use **Send test email** to check. Every verification code is sent from that address.

Other mail provider? Open "Other mail providers", enter its server and port, then paste its SMTP password.

## Settings panel
- **General**: allow or stop new registrations; contact email and phone shown on the home page.
- **Email**: connect, change or disconnect the mail app; test email.
- **Users**: see everyone, disable or enable, make or remove admin, delete (also deletes their saved projects).
- **Database**: connection status, number of users and projects, and whether `APP_SECRET` / `ADMIN_EMAIL` are set.

## What is stored in Neon
Tables (created automatically): `bv_users`, `bv_codes`, `bv_sessions`, `bv_settings`, `bv_projects`, `bv_kv`.
Passwords are stored only as scrypt hashes. Verification codes are stored hashed and expire after 10 minutes (5 tries). Login sessions last 30 days (cookie, HttpOnly). The mail key is stored encrypted with `APP_SECRET`: **if you change `APP_SECRET` later, paste the mail key again.**

## Troubleshooting
- **"The database is not connected yet" / no login screen**: `DATABASE_URL` missing or not redeployed.
- **"Email sending is not set up yet"**: add `SMTP_USER` and `SMTP_PASS` (Step 3), redeploy.
- **"The mail server refused the login"**: use the 16 character App Password, with 2-Step Verification on.
- **Code not arriving**: check spam; use "Send a new code" (one per minute).
- **Build error mentioning nodemailer or neon**: copy the build log text and ask for help.
- **Forgot password**: not built yet (see below). The admin can delete the account in Settings, and the person registers again.

## Honest notes
- The login system was tested with automated tests and a browser test against an in-memory database and a fake mailer. It has **not** been run against a real Neon database or real Gmail, and `npm run build` has not been run. The first real run happens on your Vercel site.
- Not built yet: forgot-password, changing email, two-factor login, rate limiting by IP (wrong passwords lock an account for 15 minutes after 5 tries).
- Projects deleted on one device can come back from another device that still has a copy.
