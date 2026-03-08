# How to deploy your 333 mint (step-by-step)

## Option A: Deploy with Vercel CLI (fastest)

1. **Open Terminal**
   - On Mac: press `Cmd + Space`, type **Terminal**, press Enter.

2. **Go to your project folder**
   - Paste this and press Enter:
   ```bash
   cd /Users/mo/Desktop/333_collection/mint-page
   ```

3. **Install Vercel CLI (only needed once)**
   - Paste this and press Enter:
   ```bash
   npm install -g vercel
   ```
   - If it asks for your password, enter your Mac password.

4. **Log in to Vercel (only if you haven’t before)**
   - Run:
   ```bash
   vercel login
   ```
   - Follow the prompts (email or GitHub).

5. **Deploy**
   - Run:
   ```bash
   vercel --prod
   ```
   - If it says “Set up and deploy?” and shows your project name, press **Y** then Enter.
   - If it asks to link to an existing project, choose **Y** and pick **333landingpage**.
   - Wait until it prints a URL like `https://333landingpage.vercel.app` — that’s your live site.

6. **Done**
   - Your latest code (with the mint fix) is now live at that URL.

---

## Option B: Deploy with Git + Vercel (for future updates)

1. **Create a repo on GitHub**
   - Go to https://github.com/new
   - Name it (e.g. `333-mint`), leave it empty, click **Create repository**.

2. **Open Terminal and go to your project**
   ```bash
   cd /Users/mo/Desktop/333_collection/mint-page
   ```

3. **Turn the folder into a git repo and push**
   - Run these one at a time (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name):
   ```bash
   git init
   git add .
   git commit -m "333 mint with fix"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
   - If it asks for GitHub login, use a **Personal Access Token** as the password (GitHub → Settings → Developer settings → Personal access tokens).

4. **Connect the repo to Vercel**
   - Go to https://vercel.com and log in.
   - Click **Add New…** → **Project**.
   - Import the repo you just pushed (e.g. `YOUR_USERNAME/YOUR_REPO`).
   - Click **Deploy** (use the default settings).
   - Wait for the build to finish — your site will be at the URL Vercel shows.

5. **Next time you change code**
   - Run:
   ```bash
   cd /Users/mo/Desktop/333_collection/mint-page
   git add .
   git commit -m "describe your change"
   git push
   ```
   - Vercel will automatically deploy the new version.

---

**Use Option A** if you just want to deploy once right now.  
**Use Option B** if you want to push code from this folder and have Vercel auto-deploy on every push.
