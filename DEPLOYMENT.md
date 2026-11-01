# Deploying BuildVision AI: GitHub → Vercel (browser only)

You do not need VS Code or a terminal. You will need free accounts on **GitHub** (github.com) and **Vercel** (vercel.com). Vercel can sign you in with your GitHub account.

> Honest note: this project has not yet had a real build (see README). The first Vercel build is the first real test. If it fails, see *Troubleshooting* below; the fix is usually small.

## Part 1: Put the code on GitHub

1. **Unzip** `buildvision-ai.zip` on your computer. You get a folder called `buildvision-ai`.
2. Sign in at **github.com**, click the **+** (top right) → **New repository**.
3. Repository name: `buildvision-ai`. Choose **Private** (recommended) or Public. Do **not** tick "Add a README" or ".gitignore" (the project already has them). Click **Create repository**.
4. On the new empty repository page, click the link **uploading an existing file**.
5. Open the unzipped `buildvision-ai` folder and select **everything inside it** (not the folder itself), then drag it into the GitHub page.
   - Hidden files matter: `.gitignore`, `.eslintrc.json` and `.env.example` start with a dot. If you cannot see them, show hidden files (Mac: press **Cmd + Shift + .** in Finder; Windows: File Explorer → View → Show → Hidden items). Dragging the files in from the folder includes them.
   - GitHub's web uploader accepts about **100 files per upload**. This project has fewer than that. If GitHub ever shows a limit message, upload the `src` folder first, commit, then upload the rest.
   - Keep the folder structure: `src`, `tests`, `e2e` must appear as folders.
6. Wait until all files finish uploading. In "Commit changes" leave the default message, choose **Commit directly to the main branch**, and click **Commit changes**.
7. Check that the repository's front page shows `package.json`, `next.config.mjs`, `README.md` and the `src` folder **at the top level** (not inside another folder). If everything is inside a sub-folder, you uploaded the wrong level: delete the repo contents or create a new repository and upload the inner files again.

## Part 2: Deploy on Vercel

1. Go to **vercel.com** → **Sign Up** → **Continue with GitHub** and allow access.
2. Click **Add New… → Project**. Find `buildvision-ai` in the list and click **Import**. (If it is not listed, click "Adjust GitHub App Permissions" and give Vercel access to that repository.)
3. On the configure screen leave everything at its defaults: Framework Preset **Next.js**, Root Directory `./`, Build Command and Output Directory blank (defaults). No environment variables are needed.
4. Click **Deploy** and wait 1–3 minutes.
5. When it finishes, click **Visit** (or the preview image) to open your live site at an address like `https://buildvision-ai-xxxx.vercel.app`.

## Part 3: Updating the site later

Every change you commit to the `main` branch on GitHub triggers a new Vercel deployment automatically.

- To replace or edit a file in the browser: open the file on GitHub → pencil icon → edit → **Commit changes**.
- To upload new or replacement files: repository page → **Add file → Upload files** → drag files (keeping their folder paths) → **Commit changes**.
- Watch progress on Vercel under your project → **Deployments**. If a deployment fails, the previous working version stays live.

## Using it

Open the live site and click **New project** (or open a sample). Projects are stored in the browser you use. They are **not** shared across devices or visitors. Use **Download backup** to keep a JSON copy and **Import project** to restore it elsewhere.

## Troubleshooting

**Where to look:** Vercel → your project → **Deployments** → click the failed one → **Build Logs**. Scroll to the first red `Error` line.

| Symptom | Likely cause and fix |
|---|---|
| `Module not found: Can't resolve '@/lib/...'` or `Cannot find module` | A file or folder was not uploaded, or the folder structure was flattened. Compare the GitHub repo with the layout in README ("Project layout") and upload the missing files with their folders. |
| `No Next.js version detected` or `Couldn't find any pages or app directory` | Files were uploaded inside an extra folder. `package.json` and `src/` must be at the top level of the repository (Part 1, step 7). Alternatively set **Root Directory** in Vercel → Settings → General to the inner folder. |
| `npm error ERESOLVE` / peer dependency conflict during install | Version ranges drifted. In Vercel → Settings → General → *Install Command*, override with `npm install --legacy-peer-deps`, redeploy. Then ask for help pinning exact versions. |
| `Type error: ...` in the build log (TypeScript) | The build was not verified against the real library types. The message names a file and line. Copy the whole error and ask for a fix; do not disable type checking. |
| 3D view is blank or says it failed | Open the browser developer console (F12) and copy any red errors. The 2D editor, estimate and exports do not depend on the 3D view. |
| PDF export fails | Same: copy the console error. SVG, PNG, CSV and JSON exports are separate code paths. |
| Dot-files missing on GitHub (`.gitignore` etc.) | Not fatal for deployment. `.gitignore` only prevents committing `node_modules`; add the file later if wanted. |
| Site works but my projects disappeared | Projects live in that browser's local storage. A different browser/device, private window or cleared site data shows an empty list. Import your JSON backup. |
| Build says it needs a newer Node version | Vercel → Settings → General → **Node.js Version**: choose 20.x or 22.x. |

## Optional: running locally (not required)

Install Node.js 20 or newer, open a terminal in the project folder, then:

```
npm install
npm run dev
```

and open http://localhost:3000. Run `npm test` for the unit tests and `npm run typecheck` for TypeScript.
